-- CreateEnum
CREATE TYPE "TypeApporteur" AS ENUM ('interne', 'externe');

-- AlterTable
ALTER TABLE "dossiers_crm" ADD COLUMN     "apporteur_email" TEXT,
ADD COLUMN     "apporteur_nom" TEXT,
ADD COLUMN     "apporteur_telephone" TEXT,
ADD COLUMN     "apporteur_type" "TypeApporteur",
ADD COLUMN     "apporteur_utilisateur_id" TEXT,
ADD COLUMN     "commission_apporteur" DECIMAL(3,1),
ADD COLUMN     "cree_par_id" TEXT,
ADD COLUMN     "proprietaire_id" TEXT;

-- AddForeignKey
ALTER TABLE "dossiers_crm" ADD CONSTRAINT "dossiers_crm_cree_par_id_fkey" FOREIGN KEY ("cree_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_crm" ADD CONSTRAINT "dossiers_crm_apporteur_utilisateur_id_fkey" FOREIGN KEY ("apporteur_utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_crm" ADD CONSTRAINT "dossiers_crm_proprietaire_id_fkey" FOREIGN KEY ("proprietaire_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Pas fixes validés (3 / 3,5 / 4 / 4,5 / 5 %) — verrouillés aussi en base.
ALTER TABLE "dossiers_crm" ADD CONSTRAINT "dossiers_crm_commission_apporteur_pas"
  CHECK ("commission_apporteur" IS NULL OR "commission_apporteur" IN (3, 3.5, 4, 4.5, 5));
