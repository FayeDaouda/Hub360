-- AlterTable
ALTER TABLE "devis" ADD COLUMN     "derniere_relance_le" TIMESTAMP(3),
ADD COLUMN     "dossier_crm_id" TEXT,
ADD COLUMN     "relances_envoyees" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "devis_dossier_crm_id_idx" ON "devis"("dossier_crm_id");

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_dossier_crm_id_fkey" FOREIGN KEY ("dossier_crm_id") REFERENCES "dossiers_crm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

