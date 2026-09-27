-- CreateEnum
CREATE TYPE "GroupeUnbord" AS ENUM ('documents', 'releve_existant');

-- CreateEnum
CREATE TYPE "TypeUnbord" AS ENUM ('plan_cadastral', 'droit_reel', 'piece_identite', 'ninea', 'plan_geometre', 'rapport_expertise', 'visite_site', 'plans_terrain', 'assainissement', 'eau', 'electricite', 'telephone', 'photos_videos', 'autres_infos');

-- AlterTable
ALTER TABLE "fichiers_projet" ADD COLUMN     "ligne_unbord_id" TEXT;

-- AlterTable
ALTER TABLE "images_projet" ADD COLUMN     "ligne_unbord_id" TEXT;

-- CreateTable
CREATE TABLE "lignes_unbord" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "groupe" "GroupeUnbord" NOT NULL,
    "type" "TypeUnbord" NOT NULL,
    "non_requise" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lignes_unbord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lignes_unbord_projet_id_type_key" ON "lignes_unbord"("projet_id", "type");

-- AddForeignKey
ALTER TABLE "lignes_unbord" ADD CONSTRAINT "lignes_unbord_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_ligne_unbord_id_fkey" FOREIGN KEY ("ligne_unbord_id") REFERENCES "lignes_unbord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_ligne_unbord_id_fkey" FOREIGN KEY ("ligne_unbord_id") REFERENCES "lignes_unbord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
