-- CreateEnum
CREATE TYPE "MotifAvoir" AS ENUM ('erreur_facturation', 'remise_commerciale', 'litige_client', 'annulation_prestation', 'autre');

-- CreateEnum
CREATE TYPE "StatutDemandeAvoir" AS ENUM ('a_valider', 'valide', 'refuse');

-- CreateEnum
CREATE TYPE "ActionCloture" AS ENUM ('cloture', 'reouverture');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'avoir_emis';
ALTER TYPE "NotificationType" ADD VALUE 'avoir_a_valider';
ALTER TYPE "NotificationType" ADD VALUE 'avoir_decide';
ALTER TYPE "NotificationType" ADD VALUE 'cloture_a_faire';

-- CreateTable
CREATE TABLE "demandes_avoir" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "motif" "MotifAvoir" NOT NULL,
    "commentaire" TEXT NOT NULL,
    "montant_ttc" DECIMAL(14,0) NOT NULL,
    "statut" "StatutDemandeAvoir" NOT NULL DEFAULT 'a_valider',
    "demande_par_id" TEXT,
    "demande_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decide_par_id" TEXT,
    "decide_le" TIMESTAMP(3),
    "motif_refus" TEXT NOT NULL DEFAULT '',
    "avoir_id" TEXT,

    CONSTRAINT "demandes_avoir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_clotures" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "mois" TEXT NOT NULL,
    "action" "ActionCloture" NOT NULL,
    "motif" TEXT NOT NULL DEFAULT '',
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_clotures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandes_avoir_societe_id_statut_idx" ON "demandes_avoir"("societe_id", "statut");

-- CreateIndex
CREATE INDEX "demandes_avoir_facture_id_idx" ON "demandes_avoir"("facture_id");

-- CreateIndex
CREATE INDEX "journal_clotures_societe_id_mois_idx" ON "journal_clotures"("societe_id", "mois");

-- AddForeignKey
ALTER TABLE "demandes_avoir" ADD CONSTRAINT "demandes_avoir_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

