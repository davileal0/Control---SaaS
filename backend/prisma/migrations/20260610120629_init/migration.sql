-- RenameForeignKey
ALTER TABLE "movement_log_corrections" RENAME CONSTRAINT "movement_log_corrections_log_fkey" TO "movement_log_corrections_movement_log_id_fkey";

-- RenameForeignKey
ALTER TABLE "movement_logs" RENAME CONSTRAINT "movement_logs_asset_fkey" TO "movement_logs_asset_serial_number_fkey";

-- RenameIndex
ALTER INDEX "mlc_created_idx" RENAME TO "movement_log_corrections_created_at_idx";

-- RenameIndex
ALTER INDEX "mlc_log_created_idx" RENAME TO "movement_log_corrections_movement_log_id_created_at_idx";

-- RenameIndex
ALTER INDEX "movement_logs_asset_timestamp_idx" RENAME TO "movement_logs_asset_serial_number_timestamp_idx";
