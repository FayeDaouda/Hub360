-- CreateEnum
CREATE TYPE "StatutDemandeTs" AS ENUM ('a_valider', 'acceptee', 'refusee');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'reglage_gouvernance_modifie';
ALTER TYPE "NotificationType" ADD VALUE 'ts_a_valider';
ALTER TYPE "NotificationType" ADD VALUE 'ts_decide';

-- AlterTable
ALTER TABLE "demandes_absence" ADD COLUMN     "suppleant_id" TEXT;

-- CreateTable
CREATE TABLE "demandes_ts" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "carte_id" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "reprise" TEXT NOT NULL,
    "surface_m2" INTEGER,
    "planches" INTEGER,
    "montant_ht" DECIMAL(14,0) NOT NULL,
    "statut" "StatutDemandeTs" NOT NULL DEFAULT 'a_valider',
    "demande_par_id" TEXT,
    "demande_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decide_par_id" TEXT,
    "decide_le" TIMESTAMP(3),
    "motif_refus" TEXT NOT NULL DEFAULT '',
    "tache_id" TEXT,

    CONSTRAINT "demandes_ts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandes_ts_societe_id_statut_idx" ON "demandes_ts"("societe_id", "statut");

-- AddForeignKey
ALTER TABLE "demandes_ts" ADD CONSTRAINT "demandes_ts_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

