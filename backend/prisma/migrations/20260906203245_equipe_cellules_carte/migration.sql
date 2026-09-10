/*
  Warnings:

  - You are about to drop the column `dessinateur` on the `avant_projets` table. All the data in the column will be lost.
  - You are about to drop the column `responsable_3d` on the `avant_projets` table. All the data in the column will be lost.
  - You are about to drop the column `sous_groupe_id` on the `collaborateurs` table. All the data in the column will be lost.
  - You are about to drop the column `sous_groupe_id` on the `projets` table. All the data in the column will be lost.
  - You are about to drop the `sous_groupes` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `prenom` to the `collaborateurs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `societe_id` to the `collaborateurs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NiveauCollaborateur" AS ENUM ('stagiaire', 'junior', 'confirme', 'senior', 'lead');

-- DropForeignKey
ALTER TABLE "collaborateurs" DROP CONSTRAINT "collaborateurs_sous_groupe_id_fkey";

-- DropForeignKey
ALTER TABLE "projets" DROP CONSTRAINT "projets_sous_groupe_id_fkey";

-- DropForeignKey
ALTER TABLE "sous_groupes" DROP CONSTRAINT "sous_groupes_societe_id_fkey";

-- AlterTable
ALTER TABLE "avant_projets" DROP COLUMN "dessinateur",
DROP COLUMN "responsable_3d",
ADD COLUMN     "dessinateur_id" TEXT,
ADD COLUMN     "responsable_3d_id" TEXT;

-- AlterTable
ALTER TABLE "collaborateurs" DROP COLUMN "sous_groupe_id",
ADD COLUMN     "cellule_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "niveau" "NiveauCollaborateur" NOT NULL DEFAULT 'confirme',
ADD COLUMN     "photo_cle" TEXT,
ADD COLUMN     "prenom" TEXT NOT NULL,
ADD COLUMN     "societe_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "dossiers_crm" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "projets" DROP COLUMN "sous_groupe_id",
ADD COLUMN     "cellule_id" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- DropTable
DROP TABLE "sous_groupes";

-- CreateTable
CREATE TABLE "cellules" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cellules_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "projets" ADD CONSTRAINT "projets_cellule_id_fkey" FOREIGN KEY ("cellule_id") REFERENCES "cellules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cellules" ADD CONSTRAINT "cellules_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborateurs" ADD CONSTRAINT "collaborateurs_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborateurs" ADD CONSTRAINT "collaborateurs_cellule_id_fkey" FOREIGN KEY ("cellule_id") REFERENCES "cellules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avant_projets" ADD CONSTRAINT "avant_projets_dessinateur_id_fkey" FOREIGN KEY ("dessinateur_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avant_projets" ADD CONSTRAINT "avant_projets_responsable_3d_id_fkey" FOREIGN KEY ("responsable_3d_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
