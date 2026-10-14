-- Phase 1, lot 6, étape 4 (14/10/2026) : retrait des tables de l'ancien
-- système (checklists Foncier/Avant-projet/Permis/Exécution, images et
-- documents de projet, pré-bilan, gabarits Foncier/Études, durées standard).
-- Données de démo, supprimées sans migration (décision Q1).

-- DropForeignKey
ALTER TABLE "avant_projets" DROP CONSTRAINT "avant_projets_dessinateur_id_fkey";

-- DropForeignKey
ALTER TABLE "avant_projets" DROP CONSTRAINT "avant_projets_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "avant_projets" DROP CONSTRAINT "avant_projets_responsable_3d_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_checklist_avp" DROP CONSTRAINT "blocs_checklist_avp_avant_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_checklist_avp" DROP CONSTRAINT "blocs_checklist_avp_responsable_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_etude" DROP CONSTRAINT "blocs_etude_bloc_etude_gabarit_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_etude_gabarit" DROP CONSTRAINT "blocs_etude_gabarit_societe_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_etude_gabarit" DROP CONSTRAINT "blocs_etude_gabarit_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_execution" DROP CONSTRAINT "blocs_execution_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_execution" DROP CONSTRAINT "blocs_execution_responsable_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_permis" DROP CONSTRAINT "blocs_permis_permis_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_permis" DROP CONSTRAINT "blocs_permis_responsable_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_unbord" DROP CONSTRAINT "blocs_unbord_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "blocs_unbord" DROP CONSTRAINT "blocs_unbord_responsable_id_fkey";

-- DropForeignKey
ALTER TABLE "durees_standard_taches" DROP CONSTRAINT "durees_standard_taches_societe_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_ajoute_par_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_bloc_permis_permis_id_bloc_permis_groupe_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_item_etude_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_ligne_checklist_avp_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_ligne_checklist_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_ligne_checklist_permis_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_ligne_unbord_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "fichiers_projet" DROP CONSTRAINT "fichiers_projet_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_ajoute_par_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_bloc_permis_permis_id_bloc_permis_groupe_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_item_etude_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_ligne_checklist_avp_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_ligne_checklist_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_ligne_checklist_permis_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_ligne_unbord_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "images_projet" DROP CONSTRAINT "images_projet_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "items_etude" DROP CONSTRAINT "items_etude_bloc_etude_id_fkey";

-- DropForeignKey
ALTER TABLE "items_etude" DROP CONSTRAINT "items_etude_ligne_etude_gabarit_id_fkey";

-- DropForeignKey
ALTER TABLE "items_etude" DROP CONSTRAINT "items_etude_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_avp" DROP CONSTRAINT "lignes_checklist_avp_avant_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_avp" DROP CONSTRAINT "lignes_checklist_avp_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_execution" DROP CONSTRAINT "lignes_checklist_execution_fait_par_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_execution" DROP CONSTRAINT "lignes_checklist_execution_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_execution" DROP CONSTRAINT "lignes_checklist_execution_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_permis" DROP CONSTRAINT "lignes_checklist_permis_fait_par_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_permis" DROP CONSTRAINT "lignes_checklist_permis_permis_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_permis" DROP CONSTRAINT "lignes_checklist_permis_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_etude" DROP CONSTRAINT "lignes_etude_etudes_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_etude_gabarit" DROP CONSTRAINT "lignes_etude_gabarit_bloc_etude_gabarit_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_etude_gabarit" DROP CONSTRAINT "lignes_etude_gabarit_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_unbord" DROP CONSTRAINT "lignes_unbord_gabarit_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_unbord" DROP CONSTRAINT "lignes_unbord_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_unbord_gabarit" DROP CONSTRAINT "lignes_unbord_gabarit_societe_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_unbord_gabarit" DROP CONSTRAINT "lignes_unbord_gabarit_supprime_par_id_fkey";

-- DropForeignKey
ALTER TABLE "permis" DROP CONSTRAINT "permis_projet_id_fkey";

-- DropForeignKey
ALTER TABLE "versions_pre_bilan" DROP CONSTRAINT "versions_pre_bilan_projet_id_fkey";

-- DropIndex
DROP INDEX "blocs_etude_projet_id_bloc_etude_gabarit_id_key";

-- AlterTable
ALTER TABLE "blocs_etude" DROP COLUMN "bloc_etude_gabarit_id";

-- DropTable
DROP TABLE "avant_projets";

-- DropTable
DROP TABLE "blocs_checklist_avp";

-- DropTable
DROP TABLE "blocs_etude_gabarit";

-- DropTable
DROP TABLE "blocs_execution";

-- DropTable
DROP TABLE "blocs_permis";

-- DropTable
DROP TABLE "blocs_unbord";

-- DropTable
DROP TABLE "durees_standard_taches";

-- DropTable
DROP TABLE "fichiers_projet";

-- DropTable
DROP TABLE "images_projet";

-- DropTable
DROP TABLE "items_etude";

-- DropTable
DROP TABLE "lignes_checklist_avp";

-- DropTable
DROP TABLE "lignes_checklist_execution";

-- DropTable
DROP TABLE "lignes_checklist_permis";

-- DropTable
DROP TABLE "lignes_etude";

-- DropTable
DROP TABLE "lignes_etude_gabarit";

-- DropTable
DROP TABLE "lignes_unbord";

-- DropTable
DROP TABLE "lignes_unbord_gabarit";

-- DropTable
DROP TABLE "permis";

-- DropTable
DROP TABLE "versions_pre_bilan";

-- DropEnum
DROP TYPE "EtapePreBilan";

-- DropEnum
DROP TYPE "GroupeChecklistAvp";

-- DropEnum
DROP TYPE "GroupeChecklistExecution";

-- DropEnum
DROP TYPE "GroupeChecklistPermis";

-- DropEnum
DROP TYPE "GroupeUnbord";

-- DropEnum
DROP TYPE "NiveauFinition";

-- DropEnum
DROP TYPE "StatutPermis";

-- DropEnum
DROP TYPE "TypeFichier";

-- DropEnum
DROP TYPE "TypePhotoImage";

-- DropEnum
DROP TYPE "UsageImage";

