-- AlterTable
ALTER TABLE "lignes_checklist_avp" ADD COLUMN     "collaborateur_id" TEXT,
ADD COLUMN     "echeance" TEXT,
ADD COLUMN     "fait_le" TIMESTAMP(3),
ADD COLUMN     "fait_par_id" TEXT;

-- AddForeignKey
ALTER TABLE "lignes_checklist_avp" ADD CONSTRAINT "lignes_checklist_avp_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_checklist_avp" ADD CONSTRAINT "lignes_checklist_avp_fait_par_id_fkey" FOREIGN KEY ("fait_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
