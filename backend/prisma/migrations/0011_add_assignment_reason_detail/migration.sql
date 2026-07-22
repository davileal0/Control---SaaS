-- Sub-categoria/intenção da atribuição (ex: "Upgrade IFS", "Migração
-- Empresa X"). Não-destrutivo: só adiciona uma coluna nullable ao
-- movement_logs. Logs antigos ficam com NULL (sem intenção registrada).

-- AlterTable
ALTER TABLE "movement_logs" ADD COLUMN "assignment_reason_detail" TEXT;

-- Índice para as consultas de estatística/autocomplete que filtram por
-- motivo e agrupam pela intenção.
CREATE INDEX "movement_logs_assignment_reason_detail_idx"
  ON "movement_logs" ("assignment_reason", "assignment_reason_detail");
