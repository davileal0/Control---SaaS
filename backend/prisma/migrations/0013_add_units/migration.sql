-- Unidades físicas (filiais) + localização do ativo + carimbo por
-- movimentação. Não-destrutivo: cria tabela nova e colunas nullable.

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- AlterTable: unidade atual do ativo (FK) + carimbo no lançamento
ALTER TABLE "assets" ADD COLUMN "current_unit_id" TEXT;
ALTER TABLE "movement_logs" ADD COLUMN "unit_name" TEXT;

-- CreateIndex
CREATE INDEX "assets_current_unit_id_idx" ON "assets"("current_unit_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_current_unit_id_fkey"
  FOREIGN KEY ("current_unit_id") REFERENCES "units"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
