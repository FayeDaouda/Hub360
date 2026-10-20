-- CreateEnum
CREATE TYPE "MotifSalaire" AS ENUM ('embauche', 'augmentation', 'promotion', 'fin_essai', 'correction');

-- CreateEnum
CREATE TYPE "StatutSalaire" AS ENUM ('a_valider', 'valide', 'refuse');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionPaie" ADD VALUE 'salaire_propose';
ALTER TYPE "ActionPaie" ADD VALUE 'salaire_refuse';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'salaire_a_valider';
ALTER TYPE "NotificationType" ADD VALUE 'salaire_decide';

-- CreateTable
CREATE TABLE "changements_salaire" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "date_effet" TEXT,
    "motif" "MotifSalaire" NOT NULL,
    "statut" "StatutSalaire" NOT NULL DEFAULT 'a_valider',
    "propose_par_id" TEXT,
    "propose_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decide_par_id" TEXT,
    "decide_le" TIMESTAMP(3),
    "motif_refus" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "changements_salaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "changements_salaire_dossier_id_statut_idx" ON "changements_salaire"("dossier_id", "statut");

-- AddForeignKey
ALTER TABLE "changements_salaire" ADD CONSTRAINT "changements_salaire_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise (revue RH validée 20/10/2026) : chaque salaire déjà saisi devient
-- un changement VALIDÉ, motif « embauche », en vigueur depuis la date
-- d'entrée (date inconnue si elle n'est pas renseignée).
INSERT INTO "changements_salaire" ("id", "dossier_id", "montant", "date_effet", "motif", "statut", "decide_le")
SELECT gen_random_uuid()::text, "id", "salaire_base", "date_entree", 'embauche', 'valide', CURRENT_TIMESTAMP
FROM "dossiers_personnel"
WHERE "salaire_base" IS NOT NULL;

-- AlterTable
ALTER TABLE "dossiers_personnel" DROP COLUMN "salaire_base";
