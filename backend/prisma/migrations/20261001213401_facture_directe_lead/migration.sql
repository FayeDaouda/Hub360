-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "dossier_crm_id" TEXT;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_dossier_crm_id_fkey" FOREIGN KEY ("dossier_crm_id") REFERENCES "dossiers_crm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

