-- CreateEnum
CREATE TYPE "ModeCommission" AS ENUM ('encaisse_prorata', 'signature_contrat');

-- CreateEnum
CREATE TYPE "StatutCommission" AS ENUM ('a_payer', 'payee');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'commission_a_payer';
ALTER TYPE "NotificationType" ADD VALUE 'commission_payee';
ALTER TYPE "NotificationType" ADD VALUE 'coordonnees_apporteur_modifiees';

-- AlterTable
ALTER TABLE "profils_facturation" ADD COLUMN     "mode_commission" "ModeCommission" NOT NULL DEFAULT 'encaisse_prorata';

-- CreateTable
CREATE TABLE "commissions_apporteur" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "dossier_crm_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "paiement_id" TEXT,
    "base_ht" DECIMAL(14,0) NOT NULL,
    "taux" DECIMAL(3,1) NOT NULL,
    "montant" DECIMAL(14,0) NOT NULL,
    "exigible_le" TEXT NOT NULL,
    "statut" "StatutCommission" NOT NULL DEFAULT 'a_payer',
    "payee_le" TEXT,
    "payee_par_id" TEXT,
    "mode_paiement" "ModePaiement",
    "reference" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissions_apporteur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordonnees_apporteur" (
    "id" TEXT NOT NULL,
    "dossier_crm_id" TEXT NOT NULL,
    "banque" TEXT NOT NULL DEFAULT '',
    "rib" TEXT NOT NULL DEFAULT '',
    "wave" TEXT NOT NULL DEFAULT '',
    "orange_money" TEXT NOT NULL DEFAULT '',
    "confirmation" TEXT,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordonnees_apporteur_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commissions_apporteur_dossier_crm_id_idx" ON "commissions_apporteur"("dossier_crm_id");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_apporteur_societe_id_cle_key" ON "commissions_apporteur"("societe_id", "cle");

-- CreateIndex
CREATE INDEX "coordonnees_apporteur_dossier_crm_id_created_at_idx" ON "coordonnees_apporteur"("dossier_crm_id", "created_at");

-- AddForeignKey
ALTER TABLE "commissions_apporteur" ADD CONSTRAINT "commissions_apporteur_dossier_crm_id_fkey" FOREIGN KEY ("dossier_crm_id") REFERENCES "dossiers_crm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordonnees_apporteur" ADD CONSTRAINT "coordonnees_apporteur_dossier_crm_id_fkey" FOREIGN KEY ("dossier_crm_id") REFERENCES "dossiers_crm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

