-- IMEI de celulares: identificador secundário (além do SN). Não-destrutivo:
-- coluna nullable + índice unique (Postgres permite vários NULL num unique).

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "imei" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assets_imei_key" ON "assets"("imei");
