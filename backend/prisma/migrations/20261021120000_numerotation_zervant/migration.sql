-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "ref_annee" INTEGER,
ADD COLUMN     "ref_prefixe" TEXT,
ADD COLUMN     "ref_sequence" INTEGER,
ADD COLUMN     "reference" TEXT;

-- CreateTable
CREATE TABLE "numerotation_factures" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "prefixe" TEXT NOT NULL,
    "format_annee" TEXT NOT NULL,
    "separateur" TEXT NOT NULL,
    "chiffres" INTEGER NOT NULL,
    "numero_depart" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "numerotation_factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profils_facturation" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "raison_sociale" TEXT NOT NULL,
    "adresse" TEXT NOT NULL DEFAULT '',
    "ninea" TEXT NOT NULL DEFAULT '',
    "rccm" TEXT NOT NULL DEFAULT '',
    "telephone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "banque" TEXT NOT NULL DEFAULT '',
    "rib" TEXT NOT NULL DEFAULT '',
    "wave" TEXT NOT NULL DEFAULT '',
    "orange_money" TEXT NOT NULL DEFAULT '',
    "conditions_paiement" TEXT NOT NULL DEFAULT '',
    "mentions_pied" TEXT NOT NULL DEFAULT '',
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profils_facturation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "numerotation_factures_societe_id_created_at_idx" ON "numerotation_factures"("societe_id", "created_at");

-- CreateIndex
CREATE INDEX "profils_facturation_societe_id_created_at_idx" ON "profils_facturation"("societe_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "factures_societe_id_ref_prefixe_ref_annee_ref_sequence_key" ON "factures"("societe_id", "ref_prefixe", "ref_annee", "ref_sequence");

