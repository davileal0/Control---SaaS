-- Adiciona autor (operador que fez a ação) ao MovementLog.
-- Colunas NULLABLE: logs antigos não têm autor e permanecem NULL.
-- Não-destrutivo: nenhum dado existente é alterado ou removido.

-- AlterTable
ALTER TABLE "movement_logs" ADD COLUMN "actor_user_id" TEXT;
ALTER TABLE "movement_logs" ADD COLUMN "actor_name" TEXT;
ALTER TABLE "movement_logs" ADD COLUMN "actor_role" "Role";

-- CreateIndex (consultas do painel de atividade por operador)
CREATE INDEX "movement_logs_actor_user_id_timestamp_idx" ON "movement_logs"("actor_user_id", "timestamp");
