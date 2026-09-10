-- CreateEnum
CREATE TYPE "NatureDossier" AS ENUM ('mandat_client', 'promotion_interne');

-- CreateEnum
CREATE TYPE "Categorie" AS ENUM ('conception', 'amenagement');

-- CreateEnum
CREATE TYPE "StatutCrm" AS ENUM ('nouveau', 'devis_contrat', 'valide', 'annule');

-- CreateEnum
CREATE TYPE "StatutProjet" AS ENUM ('a_assigner', 'assigne', 'en_cours', 'livre');

-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('avant_projet', 'permis', 'etudes', 'chantier', 'livre');

-- CreateEnum
CREATE TYPE "EtapePreBilan" AS ENUM ('esq', 'aps', 'apd', 'estimation', 'definitif');

-- CreateEnum
CREATE TYPE "TypeBien" AS ENUM ('villa', 'immeuble', 'lotissement', 'bureaux', 'commerce', 'mixte');

-- CreateEnum
CREATE TYPE "Standing" AS ENUM ('economique', 'moyen', 'haut', 'grand');

-- CreateEnum
CREATE TYPE "Gamme" AS ENUM ('entree', 'milieu', 'premium', 'luxe');

-- CreateEnum
CREATE TYPE "NiveauFinition" AS ENUM ('standard', 'soigne', 'haut_de_gamme');

-- CreateEnum
CREATE TYPE "TypeClient" AS ENUM ('particulier', 'sci', 'entreprise', 'institution');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeClient" NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossiers_crm" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nature" "NatureDossier" NOT NULL,
    "categorie" "Categorie" NOT NULL,
    "localisation" TEXT NOT NULL,
    "type" "TypeBien" NOT NULL,
    "nb_planches" INTEGER NOT NULL DEFAULT 0,
    "surface_terrain" INTEGER NOT NULL,
    "standing" "Standing" NOT NULL,
    "gamme" "Gamme" NOT NULL,
    "programme" TEXT NOT NULL,
    "statut" "StatutCrm" NOT NULL DEFAULT 'nouveau',
    "client_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dossiers_crm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projets" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "dossier_crm_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nature" "NatureDossier" NOT NULL,
    "categorie" "Categorie" NOT NULL,
    "programme" TEXT NOT NULL,
    "localisation" TEXT NOT NULL,
    "type" "TypeBien" NOT NULL,
    "client_id" TEXT NOT NULL,
    "sous_groupe_id" TEXT,
    "statut" "StatutProjet" NOT NULL DEFAULT 'a_assigner',
    "phase" "Phase" NOT NULL DEFAULT 'avant_projet',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sous_groupes" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sous_groupes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborateurs" (
    "id" TEXT NOT NULL,
    "sous_groupe_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "utilisateur_id" TEXT,

    CONSTRAINT "collaborateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avant_projets" (
    "projet_id" TEXT NOT NULL,
    "besoin_surface" INTEGER,
    "nb_lots" INTEGER,
    "usages" TEXT NOT NULL DEFAULT '',
    "niveau_finition" "NiveauFinition" NOT NULL DEFAULT 'standard',
    "budget_cible_client" DECIMAL(14,0),
    "delai_souhaite" TEXT NOT NULL DEFAULT '',
    "contraintes" TEXT NOT NULL DEFAULT '',
    "references" TEXT NOT NULL DEFAULT '',
    "programme_valide" BOOLEAN NOT NULL DEFAULT false,
    "budget_valide" BOOLEAN NOT NULL DEFAULT false,
    "esquisse_validee" BOOLEAN NOT NULL DEFAULT false,
    "engagement_valide" BOOLEAN NOT NULL DEFAULT false,
    "piece_validation" TEXT,
    "valide_le" TIMESTAMP(3),
    "valide_par" TEXT,

    CONSTRAINT "avant_projets_pkey" PRIMARY KEY ("projet_id")
);

-- CreateTable
CREATE TABLE "versions_pre_bilan" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "etape" "EtapePreBilan" NOT NULL,
    "couts" JSONB NOT NULL DEFAULT '{}',
    "prix_vente_estime" DECIMAL(14,0),
    "creee_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "figee_le" TIMESTAMP(3),

    CONSTRAINT "versions_pre_bilan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_crm_societe_id_code_key" ON "dossiers_crm"("societe_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "projets_dossier_crm_id_key" ON "projets"("dossier_crm_id");

-- CreateIndex
CREATE UNIQUE INDEX "versions_pre_bilan_projet_id_etape_key" ON "versions_pre_bilan"("projet_id", "etape");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_crm" ADD CONSTRAINT "dossiers_crm_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_crm" ADD CONSTRAINT "dossiers_crm_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projets" ADD CONSTRAINT "projets_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projets" ADD CONSTRAINT "projets_dossier_crm_id_fkey" FOREIGN KEY ("dossier_crm_id") REFERENCES "dossiers_crm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projets" ADD CONSTRAINT "projets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projets" ADD CONSTRAINT "projets_sous_groupe_id_fkey" FOREIGN KEY ("sous_groupe_id") REFERENCES "sous_groupes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sous_groupes" ADD CONSTRAINT "sous_groupes_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborateurs" ADD CONSTRAINT "collaborateurs_sous_groupe_id_fkey" FOREIGN KEY ("sous_groupe_id") REFERENCES "sous_groupes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborateurs" ADD CONSTRAINT "collaborateurs_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avant_projets" ADD CONSTRAINT "avant_projets_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avant_projets" ADD CONSTRAINT "avant_projets_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versions_pre_bilan" ADD CONSTRAINT "versions_pre_bilan_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
