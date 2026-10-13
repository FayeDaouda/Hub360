-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "emise_par_id" TEXT;

-- AlterTable
ALTER TABLE "paiements" ADD COLUMN     "cree_par_id" TEXT;

-- CreateTable
CREATE TABLE "paiements_supprimes" (
    "id" TEXT NOT NULL,
    "paiement_id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "montant" DECIMAL(14,0) NOT NULL,
    "mode" "ModePaiement",
    "reference" TEXT NOT NULL DEFAULT '',
    "cree_le" TIMESTAMP(3) NOT NULL,
    "cree_par_id" TEXT,
    "supprime_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supprime_par_id" TEXT NOT NULL,

    CONSTRAINT "paiements_supprimes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paiements_supprimes_facture_id_idx" ON "paiements_supprimes"("facture_id");
