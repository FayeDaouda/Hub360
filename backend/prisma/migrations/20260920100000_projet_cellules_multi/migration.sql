-- Plusieurs équipes par projet (décision boss, sept. 2026 — remplace « 1
-- projet = 1 cellule »). Ordre important : créer la table de liaison et y
-- recopier les affectations existantes AVANT de supprimer la colonne
-- projets.cellule_id, pour ne perdre aucune donnée déjà en base.

-- CreateTable
CREATE TABLE "projet_cellules" (
    "projet_id" TEXT NOT NULL,
    "cellule_id" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projet_cellules_pkey" PRIMARY KEY ("projet_id","cellule_id")
);

-- AddForeignKey
ALTER TABLE "projet_cellules" ADD CONSTRAINT "projet_cellules_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projet_cellules" ADD CONSTRAINT "projet_cellules_cellule_id_fkey" FOREIGN KEY ("cellule_id") REFERENCES "cellules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill : une ligne par projet déjà assigné à une cellule.
INSERT INTO "projet_cellules" ("projet_id", "cellule_id")
SELECT "id", "cellule_id" FROM "projets" WHERE "cellule_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "projets" DROP CONSTRAINT "projets_cellule_id_fkey";

-- AlterTable
ALTER TABLE "projets" DROP COLUMN "cellule_id";
