-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "devis_echeancier_id" TEXT,
ADD COLUMN     "ligne_devis_id" TEXT;

-- CreateIndex
CREATE INDEX "factures_ligne_devis_id_idx" ON "factures"("ligne_devis_id");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_devis_echeancier_id_fkey" FOREIGN KEY ("devis_echeancier_id") REFERENCES "devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_ligne_devis_id_fkey" FOREIGN KEY ("ligne_devis_id") REFERENCES "lignes_devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

