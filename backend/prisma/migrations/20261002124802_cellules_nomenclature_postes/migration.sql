-- CreateEnum
CREATE TYPE "ProcessusCellule" AS ENUM ('DIR', 'ARC', 'INT', 'ETU');

-- CreateEnum
CREATE TYPE "ClienteleCellule" AS ENUM ('externes', 'holding', 'tous', 'sans_objet');

-- CreateEnum
CREATE TYPE "StatutCellule" AS ENUM ('active', 'a_constituer', 'reportee');

-- CreateEnum
CREATE TYPE "EtatPosteCellule" AS ENUM ('occupe', 'ouvert', 'reporte', 'a_recruter', 'externe');

-- AlterTable : colonnes ajoutées vides, renseignées pour les cellules
-- existantes, puis rendues obligatoires.
ALTER TABLE "cellules" ADD COLUMN     "clientele" "ClienteleCellule" NOT NULL DEFAULT 'externes',
ADD COLUMN     "code" TEXT,
ADD COLUMN     "numero" INTEGER,
ADD COLUMN     "processus" "ProcessusCellule",
ADD COLUMN     "statut" "StatutCellule" NOT NULL DEFAULT 'active';

-- Processus déduit du nom d'usage, rang dans l'ordre de création, code
-- SOCIÉTÉ-PROCESSUS-NN (initiales de la société : « Grey Concrete » → GC).
UPDATE "cellules" SET "processus" = (CASE
    WHEN "nom" ILIKE '%direction%' THEN 'DIR'
    WHEN "nom" ILIKE '%intérieur%' OR "nom" ILIKE '%interieur%' THEN 'INT'
    WHEN "nom" ILIKE '%étude%' OR "nom" ILIKE '%etude%' THEN 'ETU'
    ELSE 'ARC' END)::"ProcessusCellule";
UPDATE "cellules" c SET "numero" = r.n
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY "societe_id", "processus" ORDER BY "created_at", "nom") AS n FROM "cellules") r
WHERE c.id = r.id;
UPDATE "cellules" c SET "code" = upper(regexp_replace(initcap(s."nom"), '[^A-Z]', '', 'g')) || '-' || c."processus" || '-' || lpad(c."numero"::text, 2, '0')
FROM "societes" s WHERE s.id = c."societe_id";

ALTER TABLE "cellules" ALTER COLUMN "code" SET NOT NULL,
ALTER COLUMN "numero" SET NOT NULL,
ALTER COLUMN "processus" SET NOT NULL;

-- CreateTable
CREATE TABLE "postes_cellule" (
    "id" TEXT NOT NULL,
    "cellule_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "etat" "EtatPosteCellule" NOT NULL DEFAULT 'ouvert',
    "titulaire_id" TEXT,

    CONSTRAINT "postes_cellule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compteurs_cellule" (
    "societe_id" TEXT NOT NULL,
    "processus" "ProcessusCellule" NOT NULL,
    "dernier" INTEGER NOT NULL,

    CONSTRAINT "compteurs_cellule_pkey" PRIMARY KEY ("societe_id","processus")
);

-- CreateIndex
CREATE INDEX "postes_cellule_cellule_id_idx" ON "postes_cellule"("cellule_id");

-- CreateIndex
CREATE INDEX "postes_cellule_titulaire_id_idx" ON "postes_cellule"("titulaire_id");

-- CreateIndex
CREATE UNIQUE INDEX "cellules_societe_id_code_key" ON "cellules"("societe_id", "code");

-- AddForeignKey
ALTER TABLE "postes_cellule" ADD CONSTRAINT "postes_cellule_cellule_id_fkey" FOREIGN KEY ("cellule_id") REFERENCES "cellules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postes_cellule" ADD CONSTRAINT "postes_cellule_titulaire_id_fkey" FOREIGN KEY ("titulaire_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compteurs_cellule" ADD CONSTRAINT "compteurs_cellule_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compteurs : dernier numéro déjà attribué par société et processus.
INSERT INTO "compteurs_cellule" ("societe_id", "processus", "dernier")
SELECT "societe_id", "processus", max("numero") FROM "cellules" GROUP BY "societe_id", "processus";
