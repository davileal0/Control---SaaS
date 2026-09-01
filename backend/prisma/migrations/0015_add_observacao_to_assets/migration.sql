-- Observação livre do ativo. Não-destrutivo: coluna nullable.
-- Usada pela carga em massa do Uniit pra guardar contexto do host
-- (hostname, responsável, SO, último logon).

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "observacao" TEXT;
