-- Migration: rollback dos campos de tracking de desativação.
-- A feature de Undo de desativação foi cancelada — esses campos
-- existiam apenas pra suportar essa feature. Sem ela, os campos
-- viram peso morto que polui o schema.
--
-- A migration 0002 adicionou esses campos. Esta os remove.

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "deactivated_at",
  DROP COLUMN IF EXISTS "deactivated_by_user_id";
