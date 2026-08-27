-- Trilha de auditoria de acessos (gestão de usuários / RBAC).
-- Imutável por design: só INSERT. A proteção contra UPDATE/DELETE vem
-- dos privilégios do usuário de aplicação (ver 0001_init), igual ao
-- movement_log_corrections. Esta migração cria só a estrutura.

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('CREATE', 'ROLE_CHANGE', 'DEACTIVATE', 'REACTIVATE');

-- CreateTable
CREATE TABLE "access_logs" (
    "id" SERIAL NOT NULL,
    "action" "AccessAction" NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "target_email" TEXT NOT NULL,
    "changes" JSONB,
    "actor_user_id" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "actor_role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_logs_target_user_id_created_at_idx" ON "access_logs"("target_user_id", "created_at");
CREATE INDEX "access_logs_actor_user_id_created_at_idx" ON "access_logs"("actor_user_id", "created_at");

-- Imutabilidade append-only: bloqueia UPDATE e DELETE na access_logs,
-- no mesmo padrão do movement_log_corrections. Trilha de auditoria não
-- pode ser adulterada — só inserção é permitida.
CREATE OR REPLACE FUNCTION control_block_access_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'access_logs e imutavel: % nao permitido (trilha append-only)', TG_OP
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_access_logs_no_update
    BEFORE UPDATE ON "access_logs"
    FOR EACH ROW EXECUTE FUNCTION control_block_access_log_mutation();

CREATE TRIGGER trg_access_logs_no_delete
    BEFORE DELETE ON "access_logs"
    FOR EACH ROW EXECUTE FUNCTION control_block_access_log_mutation();
