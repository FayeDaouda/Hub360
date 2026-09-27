-- CreateEnum
CREATE TYPE "StatutDevis" AS ENUM ('brouillon', 'envoye', 'accepte', 'refuse', 'transforme');

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "devis_origine_id" TEXT,
ALTER COLUMN "projet_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "devis" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "projet_id" TEXT,
    "client_id" TEXT NOT NULL,
    "numero" INTEGER,
    "statut" "StatutDevis" NOT NULL DEFAULT 'brouillon',
    "objet" TEXT NOT NULL DEFAULT '',
    "date_validite" TEXT,
    "date_envoi" TIMESTAMP(3),
    "date_reponse" TIMESTAMP(3),
    "token_public_hash" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_devis" (
    "id" TEXT NOT NULL,
    "devis_id" TEXT NOT NULL,
    "produit_service_id" TEXT,
    "designation" TEXT NOT NULL,
    "quantite" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "prix_unitaire" DECIMAL(14,0) NOT NULL,
    "taux_tva" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produits_services" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "prix_unitaire" DECIMAL(14,0),
    "taux_tva" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "description" TEXT NOT NULL DEFAULT '',
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "supprime_le" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produits_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devis_token_public_hash_key" ON "devis"("token_public_hash");

-- CreateIndex
CREATE INDEX "devis_projet_id_idx" ON "devis"("projet_id");

-- CreateIndex
CREATE INDEX "devis_client_id_idx" ON "devis"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "devis_societe_id_numero_key" ON "devis"("societe_id", "numero");

-- CreateIndex
CREATE INDEX "lignes_devis_devis_id_idx" ON "lignes_devis"("devis_id");

-- CreateIndex
CREATE INDEX "produits_services_societe_id_supprime_idx" ON "produits_services"("societe_id", "supprime");

-- CreateIndex
CREATE UNIQUE INDEX "factures_devis_origine_id_key" ON "factures"("devis_origine_id");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_devis_origine_id_fkey" FOREIGN KEY ("devis_origine_id") REFERENCES "devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_devis" ADD CONSTRAINT "lignes_devis_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_devis" ADD CONSTRAINT "lignes_devis_produit_service_id_fkey" FOREIGN KEY ("produit_service_id") REFERENCES "produits_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produits_services" ADD CONSTRAINT "produits_services_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

