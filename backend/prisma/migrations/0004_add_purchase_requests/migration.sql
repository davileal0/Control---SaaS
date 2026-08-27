-- Migration: tabela purchase_requests + enums associados.
-- Implementa a feature de Solicitações de Compra (SC):
--   - Líder autoriza → Heryck registra número → fecha (auto ou manual).
--   - Granularidade: por CATEGORY (Notebook/Celular/AllInOne) ou
--     PERIPHERAL_MODEL (Mouse, Teclado, Headset, etc).
--   - Estados: AGUARDANDO_ABERTURA / ABERTA / FECHADA / CANCELADA.

CREATE TYPE "PurchaseRequestStatus" AS ENUM (
  'AGUARDANDO_ABERTURA',
  'ABERTA',
  'FECHADA',
  'CANCELADA'
);

CREATE TYPE "PurchaseRequestTargetKind" AS ENUM (
  'CATEGORY',
  'PERIPHERAL_MODEL'
);

CREATE TYPE "PurchaseRequestCloseReason" AS ENUM (
  'STOCK_NORMALIZED',
  'MANUAL',
  'CANCELED'
);

CREATE TABLE "purchase_requests" (
  "id"                     TEXT NOT NULL,

  "target_kind"            "PurchaseRequestTargetKind" NOT NULL,
  "target_value"           TEXT NOT NULL,

  "status"                 "PurchaseRequestStatus" NOT NULL DEFAULT 'AGUARDANDO_ABERTURA',

  "authorized_by_user_id"  TEXT NOT NULL,
  "authorized_by_name"     TEXT NOT NULL,
  "authorized_by_role"     "Role" NOT NULL,
  "authorized_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sc_number"              TEXT,
  "opened_by_user_id"      TEXT,
  "opened_by_name"         TEXT,
  "opened_by_role"         "Role",
  "opened_at"              TIMESTAMP(3),

  "closed_by_user_id"      TEXT,
  "closed_by_name"         TEXT,
  "closed_by_role"         "Role",
  "closed_at"              TIMESTAMP(3),
  "close_reason"           "PurchaseRequestCloseReason",

  "notes"                  TEXT,

  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- Busca rápida de "SC ativa por alvo" — usado em auto-close e
-- ao decorar alertas no Dashboard/PeripheralsModal.
CREATE INDEX "purchase_requests_target_kind_target_value_status_idx"
  ON "purchase_requests"("target_kind", "target_value", "status");
