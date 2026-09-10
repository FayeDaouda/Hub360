-- CreateEnum
CREATE TYPE "StatutNicad" AS ENUM ('a_demander', 'demande', 'obtenu');

-- CreateEnum
CREATE TYPE "StatutPermis" AS ENUM ('a_deposer', 'depose', 'instruction', 'observations', 'obtenu', 'refuse');

-- CreateEnum
CREATE TYPE "VoieDepot" AS ENUM ('teledac', 'mairie');

-- CreateEnum
CREATE TYPE "TypeEtude" AS ENUM ('geotechnique', 'topographie', 'structure', 'fluides', 'electricite', 'vrd');

-- CreateEnum
CREATE TYPE "StatutEtude" AS ENUM ('a_lancer', 'en_cours', 'remise', 'validee', 'non_requise');

-- CreateEnum
CREATE TYPE "TypeLot" AS ENUM ('gros_oeuvre', 'second_oeuvre', 'lots_techniques', 'vrd', 'fournitures_mobilier', 'travaux_amenagement');

-- CreateEnum
CREATE TYPE "StatutLot" AS ENUM ('a_consulter', 'consulte', 'attribue', 'en_cours', 'termine');

-- CreateEnum
CREATE TYPE "StatutReserve" AS ENUM ('ouverte', 'levee');

-- CreateEnum
CREATE TYPE "JournalContexte" AS ENUM ('permis', 'chantier');

-- CreateEnum
CREATE TYPE "UsageImage" AS ENUM ('travail', 'portfolio');

-- CreateTable
CREATE TABLE "permis" (
    "projet_id" TEXT NOT NULL,
    "nicad" "StatutNicad" NOT NULL DEFAULT 'a_demander',
    "nicad_numero" TEXT NOT NULL DEFAULT '',
    "plan_bornage" BOOLEAN NOT NULL DEFAULT false,
    "titre_propriete" BOOLEAN NOT NULL DEFAULT false,
    "plan_cadastral_vise" BOOLEAN NOT NULL DEFAULT false,
    "plans_apd" BOOLEAN NOT NULL DEFAULT false,
    "devis" BOOLEAN NOT NULL DEFAULT false,
    "timbre_fiscal" BOOLEAN NOT NULL DEFAULT false,
    "statut" "StatutPermis" NOT NULL DEFAULT 'a_deposer',
    "voie" "VoieDepot",
    "date_depot" TIMESTAMP(3),
    "numero_recepisse" TEXT NOT NULL DEFAULT '',
    "date_obtention" TIMESTAMP(3),
    "date_refus" TIMESTAMP(3),
    "certificat_conformite" BOOLEAN NOT NULL DEFAULT false,
    "date_certificat" TIMESTAMP(3),

    CONSTRAINT "permis_pkey" PRIMARY KEY ("projet_id")
);

-- CreateTable
CREATE TABLE "entrees_journal" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "contexte" "JournalContexte" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "texte" TEXT NOT NULL,
    "auteur_id" TEXT,

    CONSTRAINT "entrees_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etudes" (
    "projet_id" TEXT NOT NULL,
    "dce_constitue" BOOLEAN NOT NULL DEFAULT false,
    "dce_le" TIMESTAMP(3),

    CONSTRAINT "etudes_pkey" PRIMARY KEY ("projet_id")
);

-- CreateTable
CREATE TABLE "lignes_etude" (
    "id" TEXT NOT NULL,
    "etudes_id" TEXT NOT NULL,
    "type" "TypeEtude" NOT NULL,
    "statut" "StatutEtude" NOT NULL DEFAULT 'a_lancer',
    "bet" TEXT NOT NULL DEFAULT '',
    "date_remise_prevue" TEXT,
    "date_remise_reelle" TEXT,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "lignes_etude_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "projet_id" TEXT NOT NULL,
    "reception_provisoire" TEXT,
    "levee_reserves" TEXT,
    "reception_definitive" TEXT,
    "validation_client" BOOLEAN NOT NULL DEFAULT false,
    "date_validation_client" TEXT,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("projet_id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "type" "TypeLot" NOT NULL,
    "statut" "StatutLot" NOT NULL DEFAULT 'a_consulter',
    "entreprises_consultees" TEXT[],
    "entreprise_retenue" TEXT NOT NULL DEFAULT '',
    "montant_marche" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "date_attribution" TEXT,
    "avancement" INTEGER NOT NULL DEFAULT 0,
    "date_debut" TEXT,
    "date_fin_prevue" TEXT,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offres_entreprise" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "entreprise" TEXT NOT NULL,
    "montant" DECIMAL(14,0) NOT NULL,
    "delai_jours" INTEGER,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offres_entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "situations_paiement" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "avancement_cumule" INTEGER NOT NULL,
    "montant_situation" DECIMAL(14,0) NOT NULL,
    "retenue_garantie" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "montant_verse" DECIMAL(14,0) NOT NULL,

    CONSTRAINT "situations_paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserves" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "statut" "StatutReserve" NOT NULL DEFAULT 'ouverte',
    "date_levee" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images_projet" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type_mime" TEXT NOT NULL DEFAULT '',
    "usage" "UsageImage" NOT NULL DEFAULT 'travail',
    "phase" "Phase",
    "legende" TEXT NOT NULL DEFAULT '',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "ajoute_par_id" TEXT,
    "ajoute_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supprimee" BOOLEAN NOT NULL DEFAULT false,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "images_projet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entrees_journal_projet_id_contexte_idx" ON "entrees_journal"("projet_id", "contexte");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_etude_etudes_id_type_key" ON "lignes_etude"("etudes_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "lots_execution_id_type_key" ON "lots"("execution_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "situations_paiement_lot_id_numero_key" ON "situations_paiement"("lot_id", "numero");

-- CreateIndex
CREATE INDEX "images_projet_projet_id_supprimee_idx" ON "images_projet"("projet_id", "supprimee");

-- AddForeignKey
ALTER TABLE "permis" ADD CONSTRAINT "permis_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrees_journal" ADD CONSTRAINT "entrees_journal_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrees_journal" ADD CONSTRAINT "entrees_journal_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etudes" ADD CONSTRAINT "etudes_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_etude" ADD CONSTRAINT "lignes_etude_etudes_id_fkey" FOREIGN KEY ("etudes_id") REFERENCES "etudes"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offres_entreprise" ADD CONSTRAINT "offres_entreprise_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "situations_paiement" ADD CONSTRAINT "situations_paiement_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserves" ADD CONSTRAINT "reserves_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_ajoute_par_id_fkey" FOREIGN KEY ("ajoute_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
