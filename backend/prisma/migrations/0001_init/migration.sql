-- =====================================================================
-- Control — Migração inicial (0001_init)
-- PostgreSQL
-- =====================================================================
-- Modelo de auditoria (revisado):
--   * movement_logs é CORRIGÍVEL: pode ser editado e ANULADO (is_voided)
--     no caso de engano, mas NUNCA apagado fisicamente — um trigger
--     bloqueia DELETE para preservar a cadeia.
--   * movement_log_corrections é APPEND-ONLY e IMUTÁVEL (bloqueia
--     UPDATE/DELETE). É aqui que vive a inviolabilidade: cada edição ou
--     anulação registra autor, motivo e diff, disponível aos supervisores.
--   * discard_records guarda o snapshot de cada descarte para exportação
--     em planilha.
--
-- Nota de higiene Prisma: como este é o scaffold inicial (pré-deploy),
-- consolidamos tudo em 0001_init. Em um ambiente já implantado, estas
-- mudanças entrariam como uma migração 0002 separada.
-- =====================================================================

-- ---------- Enums ----------
CREATE TYPE "Category"            AS ENUM ('Notebook', 'Desktop', 'Celular', 'all_in_one', 'Periferico');
CREATE TYPE "AssetStatus"         AS ENUM ('Disponivel', 'em_uso', 'Danificado');
CREATE TYPE "Role"                AS ENUM ('OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI');
CREATE TYPE "CorrectionOperation" AS ENUM ('EDIT', 'VOID');

-- ---------- assets ----------
CREATE TABLE "assets" (
    "serial_number" TEXT          NOT NULL,
    "model"         TEXT          NOT NULL,
    "category"      "Category"    NOT NULL,
    "status"        "AssetStatus" NOT NULL DEFAULT 'Disponivel',
    "is_archived"   BOOLEAN       NOT NULL DEFAULT false,
    "created_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("serial_number")
);
CREATE INDEX "assets_status_is_archived_idx" ON "assets" ("status", "is_archived");
CREATE INDEX "assets_category_model_idx"     ON "assets" ("category", "model");

-- ---------- movement_logs (corrigível, sem delete físico) ----------
CREATE TABLE "movement_logs" (
    "id"                  SERIAL        NOT NULL,
    "asset_serial_number" TEXT          NOT NULL,
    "origin_status"       "AssetStatus",
    "destination_status"  "AssetStatus" NOT NULL,
    "ticket_id"           TEXT,
    "end_user_name"       TEXT,
    "manager_name"        TEXT,
    "department"          TEXT,
    "invoice_number"      TEXT,
    "tracking_code"       TEXT,
    "notes"               TEXT,
    "is_voided"           BOOLEAN       NOT NULL DEFAULT false,
    "voided_at"           TIMESTAMP(3),
    "timestamp"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movement_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movement_logs_asset_fkey"
        FOREIGN KEY ("asset_serial_number") REFERENCES "assets" ("serial_number")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "movement_logs_asset_timestamp_idx" ON "movement_logs" ("asset_serial_number", "timestamp");
CREATE INDEX "movement_logs_is_voided_idx"       ON "movement_logs" ("is_voided");

-- ---------- movement_log_corrections (append-only, imutável) ----------
CREATE TABLE "movement_log_corrections" (
    "id"              SERIAL                NOT NULL,
    "movement_log_id" INTEGER               NOT NULL,
    "operation"       "CorrectionOperation" NOT NULL,
    "reason"          TEXT                  NOT NULL,
    "changes"         JSONB,
    "actor_user_id"   TEXT                  NOT NULL,
    "actor_name"      TEXT                  NOT NULL,
    "actor_role"      "Role"                NOT NULL,
    "created_at"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movement_log_corrections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movement_log_corrections_log_fkey"
        FOREIGN KEY ("movement_log_id") REFERENCES "movement_logs" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "mlc_log_created_idx" ON "movement_log_corrections" ("movement_log_id", "created_at");
CREATE INDEX "mlc_created_idx"     ON "movement_log_corrections" ("created_at");

-- ---------- discard_records (exportável em planilha) ----------
CREATE TABLE "discard_records" (
    "id"                   SERIAL        NOT NULL,
    "serial_number"        TEXT          NOT NULL,
    "model"                TEXT          NOT NULL,
    "category"             "Category"    NOT NULL,
    "last_status"          "AssetStatus" NOT NULL,
    "reason"               TEXT          NOT NULL,
    "discarded_by_user_id" TEXT          NOT NULL,
    "discarded_by_name"    TEXT          NOT NULL,
    "discarded_at"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discard_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "discard_records_discarded_at_idx" ON "discard_records" ("discarded_at");
CREATE INDEX "discard_records_last_status_idx"  ON "discard_records" ("last_status");

-- ---------- users ----------
CREATE TABLE "users" (
    "id"         TEXT         NOT NULL,
    "email"      TEXT         NOT NULL,
    "full_name"  TEXT         NOT NULL,
    "role"       "Role"       NOT NULL,
    "is_active"  BOOLEAN      NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

-- =====================================================================
-- INTEGRIDADE DA AUDITORIA
-- =====================================================================
-- 1) movement_logs: permite UPDATE (edição/anulação) mas BLOQUEIA DELETE
--    físico. Nenhum lançamento pode sumir; remover = anular (is_voided).
CREATE OR REPLACE FUNCTION control_block_log_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'movement_logs nao pode ser apagado fisicamente; use anulacao logica (is_voided)'
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movement_logs_no_delete
    BEFORE DELETE ON "movement_logs"
    FOR EACH ROW EXECUTE FUNCTION control_block_log_delete();

-- 2) movement_log_corrections: append-only total (sem UPDATE nem DELETE).
CREATE OR REPLACE FUNCTION control_block_correction_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'movement_log_corrections e imutavel: % nao permitido (trilha append-only)', TG_OP
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_corrections_no_update
    BEFORE UPDATE ON "movement_log_corrections"
    FOR EACH ROW EXECUTE FUNCTION control_block_correction_mutation();

CREATE TRIGGER trg_corrections_no_delete
    BEFORE DELETE ON "movement_log_corrections"
    FOR EACH ROW EXECUTE FUNCTION control_block_correction_mutation();

-- Privilégios sugeridos para o usuário de aplicação (control_app):
--   GRANT SELECT, INSERT, UPDATE        ON movement_logs            TO control_app; -- sem DELETE
--   GRANT SELECT, INSERT                ON movement_log_corrections TO control_app; -- sem UPDATE/DELETE
--   GRANT SELECT, INSERT                ON discard_records          TO control_app;
--   GRANT SELECT, INSERT, UPDATE        ON assets                   TO control_app; -- sem DELETE (soft-delete)
