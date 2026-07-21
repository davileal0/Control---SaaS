-- Adiciona a coluna `quantity` em purchase_requests (NOT NULL).
--
-- Estratégia em 3 passos pra cobrir SCs antigas que possam existir no
-- banco (do teste anterior). O DEFAULT 1 sobrevive só durante o ALTER
-- pra popular registros pré-existentes; depois remove-se o default e
-- a aplicação passa a EXIGIR via Zod (min 1, max 10000).
--
-- Em prod, o ideal seria backfill explícito antes de tornar NOT NULL.
-- Aqui, qualquer SC pré-existente recebe `quantity = 1` (valor mínimo
-- válido — sinaliza "dado legado" sem quebrar).

ALTER TABLE "purchase_requests"
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "purchase_requests"
  ALTER COLUMN "quantity" DROP DEFAULT;
