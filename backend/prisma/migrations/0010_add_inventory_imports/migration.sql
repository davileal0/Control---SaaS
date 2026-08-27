-- Importação de inventário (Fase 2): pedido de importação com aprovação.
-- Não-destrutivo: cria enum + tabela novos, não toca no que existe.

-- CreateEnum
CREATE TYPE "InventoryImportStatus" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO');

-- CreateTable
CREATE TABLE "inventory_imports" (
    "id" SERIAL NOT NULL,
    "status" "InventoryImportStatus" NOT NULL DEFAULT 'PENDENTE',
    "autentique_link" TEXT NOT NULL,
    "validated_assets" JSONB NOT NULL,
    "total_assets" INTEGER NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_by_name" TEXT NOT NULL,
    "submitted_by_role" "Role" NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_user_id" TEXT,
    "resolved_by_name" TEXT,
    "resolved_by_role" "Role",
    "resolved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_count" INTEGER,
    "skipped_items" JSONB,

    CONSTRAINT "inventory_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_imports_status_submitted_at_idx" ON "inventory_imports"("status", "submitted_at");
