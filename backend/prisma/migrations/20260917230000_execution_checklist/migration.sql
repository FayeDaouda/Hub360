-- Remplacement complet du module Exécution (lots/offres/situations/réception/
-- réserves + son journal de chantier) par une checklist en 8 blocs, miroir
-- Trello Grey Concrete — même motif que Permis (BlocPermis/LigneChecklistPermis).
-- Toutes les données existantes ici sont des données de seed/démo (cf.
-- vérification avant migration) — décision boss, sept. 2026, cf. mémoire.

-- DropForeignKey / DropTable (ordre : enfants avant parents)
DROP TABLE "offres_entreprise";
DROP TABLE "situations_paiement";
DROP TABLE "lots";
DROP TABLE "reserves";
DROP TABLE "executions";
DROP TABLE "entrees_journal";

-- DropEnum
DROP TYPE "TypeLot";
DROP TYPE "StatutLot";
DROP TYPE "StatutReserve";
DROP TYPE "JournalContexte";

-- CreateEnum
CREATE TYPE "GroupeChecklistExecution" AS ENUM ('etudes', 'plans', 'viabilite', 'locaux_technique', 'amenagements', 'menuiserie', 'details', 'cctp');

-- CreateTable
CREATE TABLE "blocs_execution" (
    "projet_id" TEXT NOT NULL,
    "groupe" "GroupeChecklistExecution" NOT NULL,
    "echeance" TEXT,
    "responsable_id" TEXT,
    "prolongation_demandee_le" TIMESTAMP(3),
    "prolongation_echeance" TEXT,
    "prolongation_motif" TEXT,

    CONSTRAINT "blocs_execution_pkey" PRIMARY KEY ("projet_id", "groupe")
);

-- CreateTable
CREATE TABLE "lignes_checklist_execution" (
    "id" TEXT NOT NULL,
    "projet_id" TEXT NOT NULL,
    "groupe" "GroupeChecklistExecution" NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "fait" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "fait_le" TIMESTAMP(3),
    "fait_par_id" TEXT,
    "supprimee" BOOLEAN NOT NULL DEFAULT false,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "lignes_checklist_execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (empêche le double-amorçage du gabarit sur requêtes concurrentes)
CREATE UNIQUE INDEX "lignes_checklist_execution_projet_id_groupe_ordre_key" ON "lignes_checklist_execution"("projet_id", "groupe", "ordre");

-- AddForeignKey
ALTER TABLE "blocs_execution" ADD CONSTRAINT "blocs_execution_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs_execution" ADD CONSTRAINT "blocs_execution_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_checklist_execution" ADD CONSTRAINT "lignes_checklist_execution_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_checklist_execution" ADD CONSTRAINT "lignes_checklist_execution_fait_par_id_fkey" FOREIGN KEY ("fait_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_checklist_execution" ADD CONSTRAINT "lignes_checklist_execution_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rattachement d'une image/d'un fichier à un item précis de la checklist Exécution
ALTER TABLE "images_projet" ADD COLUMN "ligne_checklist_execution_id" TEXT;
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_ligne_checklist_execution_id_fkey" FOREIGN KEY ("ligne_checklist_execution_id") REFERENCES "lignes_checklist_execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fichiers_projet" ADD COLUMN "ligne_checklist_execution_id" TEXT;
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_ligne_checklist_execution_id_fkey" FOREIGN KEY ("ligne_checklist_execution_id") REFERENCES "lignes_checklist_execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
