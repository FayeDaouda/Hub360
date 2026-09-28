-- CreateEnum
CREATE TYPE "TypeAbsence" AS ENUM ('conge_paye', 'maladie', 'permission_exceptionnelle', 'autre');

-- CreateEnum
CREATE TYPE "StatutAbsence" AS ENUM ('attente_n1', 'autres_dates', 'accord_n1', 'validee', 'refusee', 'retiree');

-- CreateEnum
CREATE TYPE "DecisionN1" AS ENUM ('valider', 'sous_conditions', 'autres_dates', 'refuser');

-- CreateEnum
CREATE TYPE "MotifRefusAbsence" AS ENUM ('periode_critique', 'effectif_insuffisant', 'solde_insuffisant', 'autre');

-- CreateEnum
CREATE TYPE "CategorieSoins" AS ENUM ('pharmacie', 'consultation', 'analyses_imagerie', 'hospitalisation', 'dentaire_optique', 'autre');

-- CreateEnum
CREATE TYPE "BeneficiaireSoins" AS ENUM ('moi', 'conjoint', 'enfant');

-- CreateEnum
CREATE TYPE "StatutRemboursement" AS ENUM ('soumise', 'transmise', 'remboursee', 'rejetee');

-- CreateTable
CREATE TABLE "demandes_absence" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "type" "TypeAbsence" NOT NULL,
    "date_debut" TEXT NOT NULL,
    "date_fin" TEXT NOT NULL,
    "jours" INTEGER NOT NULL,
    "commentaire" TEXT NOT NULL DEFAULT '',
    "justificatif_nom" TEXT,
    "justificatif_cle" TEXT,
    "statut" "StatutAbsence" NOT NULL DEFAULT 'attente_n1',
    "n1_collaborateur_id" TEXT,
    "n1_role" TEXT,
    "decision_n1" "DecisionN1",
    "decision_n1_par_id" TEXT,
    "decision_n1_le" TIMESTAMP(3),
    "motif_refus" "MotifRefusAbsence",
    "commentaire_refus" TEXT NOT NULL DEFAULT '',
    "dates_proposees_debut" TEXT,
    "dates_proposees_fin" TEXT,
    "traitement_livrables" JSONB,
    "valide_rh_par_id" TEXT,
    "valide_rh_le" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demandes_absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandes_remboursement" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "categorie" "CategorieSoins" NOT NULL,
    "beneficiaire" "BeneficiaireSoins" NOT NULL DEFAULT 'moi',
    "date_soins" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "montant_rembourse" INTEGER,
    "statut" "StatutRemboursement" NOT NULL DEFAULT 'soumise',
    "motif_rejet" TEXT NOT NULL DEFAULT '',
    "transmise_le" TIMESTAMP(3),
    "traite_le" TIMESTAMP(3),
    "traite_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demandes_remboursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "justificatifs_remboursement" (
    "id" TEXT NOT NULL,
    "demande_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "justificatifs_remboursement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandes_absence_dossier_id_idx" ON "demandes_absence"("dossier_id");

-- CreateIndex
CREATE INDEX "demandes_absence_statut_idx" ON "demandes_absence"("statut");

-- CreateIndex
CREATE INDEX "demandes_remboursement_dossier_id_idx" ON "demandes_remboursement"("dossier_id");

-- AddForeignKey
ALTER TABLE "demandes_absence" ADD CONSTRAINT "demandes_absence_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_remboursement" ADD CONSTRAINT "demandes_remboursement_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "justificatifs_remboursement" ADD CONSTRAINT "justificatifs_remboursement_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demandes_remboursement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

