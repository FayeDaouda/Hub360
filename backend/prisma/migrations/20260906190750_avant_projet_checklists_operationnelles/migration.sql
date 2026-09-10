-- CreateEnum
CREATE TYPE "GroupeChecklistAvp" AS ENUM ('releve_existant', 'taches_complementaires', 'fichiers_produits', 'dossier_final');

-- CreateEnum
CREATE TYPE "CleChecklistAvp" AS ENUM ('visite_site', 'plans_terrain', 'assainissement', 'eau', 'electricite', 'telephone', 'photos_videos', 'autres_infos', 'plans_cotes', 'devis_descriptif', 'plaquettes_commerciales', 'dwg_pln', 'skp', 'source_rendus', 'esquisses', 'plans_complets', 'images_3d_facade', 'details_livrables', 'emplacement_gaines', 'validation_client', 'mood_board');

-- AlterTable
ALTER TABLE "avant_projets" ADD COLUMN     "date_debut" TEXT,
ADD COLUMN     "date_fin" TEXT,
ADD COLUMN     "dessinateur" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsable_3d" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "lignes_checklist_avp" (
    "id" TEXT NOT NULL,
    "avant_projet_id" TEXT NOT NULL,
    "cle" "CleChecklistAvp" NOT NULL,
    "fait" BOOLEAN NOT NULL DEFAULT false,
    "non_requis" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "lignes_checklist_avp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lignes_checklist_avp_avant_projet_id_cle_key" ON "lignes_checklist_avp"("avant_projet_id", "cle");

-- AddForeignKey
ALTER TABLE "lignes_checklist_avp" ADD CONSTRAINT "lignes_checklist_avp_avant_projet_id_fkey" FOREIGN KEY ("avant_projet_id") REFERENCES "avant_projets"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;
