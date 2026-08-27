-- Pendências de periférico (item de chamado não entregue na atribuição).
-- Não-destrutivo: cria enum + tabela novos.

-- CreateEnum
CREATE TYPE "PendencyStatus" AS ENUM ('PENDENTE', 'ENTREGUE', 'CANCELADA');

-- CreateTable
CREATE TABLE "peripheral_pendencies" (
    "id" SERIAL NOT NULL,
    "ticket_id" TEXT,
    "asset_serial_number" TEXT,
    "peripheral_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "motivo" TEXT,
    "status" "PendencyStatus" NOT NULL DEFAULT 'PENDENTE',
    "end_user_name" TEXT,
    "unit_name" TEXT,
    "created_by_user_id" TEXT,
    "created_by_name" TEXT,
    "created_by_role" "Role",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_name" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "peripheral_pendencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "peripheral_pendencies_status_created_at_idx"
  ON "peripheral_pendencies" ("status", "created_at");
