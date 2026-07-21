-- Migration: rastreio de desativação pra suporte ao Undo (janela 60s)
-- Adicionados 2 campos opcionais ao User:
--   deactivated_at        timestamptz : quando foi desativado
--   deactivated_by_user_id text       : quem desativou
--
-- Quando isActive=true, esses campos ficam null. Setados ao desativar,
-- consultados pelo /restore pra verificar janela e ownership, limpos
-- ao reativar (Undo ou reativação normal).

ALTER TABLE "users"
  ADD COLUMN "deactivated_at" TIMESTAMP(3),
  ADD COLUMN "deactivated_by_user_id" TEXT;
