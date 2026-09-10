-- CreateEnum
CREATE TYPE "FactureType" AS ENUM ('honoraires', 'vente');

-- CreateEnum
CREATE TYPE "FactureStatut" AS ENUM ('brouillon', 'emise', 'annulee');

-- CreateEnum
CREATE TYPE "JalonFacture" AS ENUM ('signature', 'avant_projet', 'livraison');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('virement', 'cheque', 'especes', 'mobile_money');

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "numero" INTEGER,
    "type" "FactureType" NOT NULL,
    "statut" "FactureStatut" NOT NULL DEFAULT 'brouillon',
    "jalon" "JalonFacture",
    "libelle" TEXT NOT NULL DEFAULT '',
    "montant_ht" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "taux_tva" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "echeance_le" TEXT,
    "est_avoir" BOOLEAN NOT NULL DEFAULT false,
    "facture_origine_id" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emise_le" TIMESTAMP(3),
    "annulee_le" TIMESTAMP(3),

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "montant" DECIMAL(14,0) NOT NULL,
    "mode" "ModePaiement",
    "reference" TEXT NOT NULL DEFAULT '',
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "factures_projet_id_idx" ON "factures"("projet_id");

-- CreateIndex
CREATE UNIQUE INDEX "factures_societe_id_numero_key" ON "factures"("societe_id", "numero");

-- CreateIndex
CREATE INDEX "paiements_facture_id_idx" ON "paiements"("facture_id");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_facture_origine_id_fkey" FOREIGN KEY ("facture_origine_id") REFERENCES "factures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
