-- Adiciona o campo `assignment_reason` em movement_logs.
--
-- Campo NULLABLE: a) só vale pra logs de atribuição (destinationStatus
-- = EmUso); outras transições continuam null. b) Logs ANTERIORES à esta
-- migration ficam null permanentemente — decisão consciente de não
-- atribuir retroativamente categorias que não temos certeza (vide P2 do
-- alinhamento). KPIs novos só contam atribuições FUTURAS.

CREATE TYPE "AssignmentReason" AS ENUM (
  'AUMENTO_QUADRO',
  'SUBSTITUICAO'
);

ALTER TABLE "movement_logs"
  ADD COLUMN "assignment_reason" "AssignmentReason";
