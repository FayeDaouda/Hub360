-- CreateEnum
CREATE TYPE "StatutDemandeDroit" AS ENUM ('en_attente', 'acceptee', 'refusee');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'droits_modifies';
ALTER TYPE "NotificationType" ADD VALUE 'demande_droit_a_valider';
ALTER TYPE "NotificationType" ADD VALUE 'demande_droit_decidee';

-- AlterTable
ALTER TABLE "journal_droits" ADD COLUMN     "valide_par_id" TEXT;

-- CreateTable
CREATE TABLE "demandes_droit" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "role_nom" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "avant" "NiveauPermission",
    "apres" "NiveauPermission" NOT NULL,
    "demande_par_id" TEXT,
    "statut" "StatutDemandeDroit" NOT NULL DEFAULT 'en_attente',
    "decide_par_id" TEXT,
    "decide_le" TIMESTAMP(3),
    "motif" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demandes_droit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandes_droit_societe_id_statut_idx" ON "demandes_droit"("societe_id", "statut");

