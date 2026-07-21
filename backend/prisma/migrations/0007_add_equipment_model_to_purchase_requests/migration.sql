-- S.C. de equipamento agora informa o modelo específico na abertura.
-- Nullable: periférico não usa (targetValue já é o modelo).
ALTER TABLE "purchase_requests" ADD COLUMN "equipment_model" TEXT;
