-- Restructuration Avant-projet (sept. 2026) : retire la section « Programme »
-- (formulaire) et le verrou « Validation » (valideLe/validePar et les 4
-- booléens macro) — plus de lecture seule automatique, la phase avance via
-- changerPhase (mécanisme générique, déjà indépendant de ceci). La checklist
-- opérationnelle passe au modèle Foncier/Unbord (statut dérivé des fichiers
-- joints, plus de case "fait"/note manuelles) avec assignation PAR BLOC
-- (BlocChecklistAvp, un responsable par groupe, même motif que
-- BlocPermis/BlocExecution) au lieu de par ligne. Les lignes existantes des
-- groupes programme/releve_existant sont soft-deletées ci-dessous — les
-- valeurs d'enum restent en base (même motif que dossier_final avant elles).

-- DropForeignKey
ALTER TABLE "avant_projets" DROP CONSTRAINT "avant_projets_valide_par_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_avp" DROP CONSTRAINT "lignes_checklist_avp_collaborateur_id_fkey";

-- DropForeignKey
ALTER TABLE "lignes_checklist_avp" DROP CONSTRAINT "lignes_checklist_avp_fait_par_id_fkey";

-- AlterTable
ALTER TABLE "avant_projets" DROP COLUMN "besoin_surface",
DROP COLUMN "budget_cible_client",
DROP COLUMN "budget_valide",
DROP COLUMN "contraintes",
DROP COLUMN "delai_souhaite",
DROP COLUMN "engagement_valide",
DROP COLUMN "esquisse_validee",
DROP COLUMN "nb_lots",
DROP COLUMN "niveau_finition",
DROP COLUMN "piece_validation",
DROP COLUMN "programme_valide",
DROP COLUMN "references",
DROP COLUMN "usages",
DROP COLUMN "valide_le",
DROP COLUMN "valide_par";

-- AlterTable
ALTER TABLE "fichiers_projet" ADD COLUMN     "ligne_checklist_avp_id" TEXT;

-- AlterTable
ALTER TABLE "images_projet" ADD COLUMN     "ligne_checklist_avp_id" TEXT;

-- AlterTable
ALTER TABLE "lignes_checklist_avp" DROP COLUMN "collaborateur_id",
DROP COLUMN "echeance",
DROP COLUMN "fait",
DROP COLUMN "fait_le",
DROP COLUMN "fait_par_id",
DROP COLUMN "note",
DROP COLUMN "prolongation_demandee_le",
DROP COLUMN "prolongation_echeance",
DROP COLUMN "prolongation_motif",
ADD COLUMN     "non_requise" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "blocs_checklist_avp" (
    "avant_projet_id" TEXT NOT NULL,
    "groupe" "GroupeChecklistAvp" NOT NULL,
    "echeance" TEXT,
    "responsable_id" TEXT,
    "prolongation_demandee_le" TIMESTAMP(3),
    "prolongation_echeance" TEXT,
    "prolongation_motif" TEXT,

    CONSTRAINT "blocs_checklist_avp_pkey" PRIMARY KEY ("avant_projet_id","groupe")
);

-- AddForeignKey
ALTER TABLE "blocs_checklist_avp" ADD CONSTRAINT "blocs_checklist_avp_avant_projet_id_fkey" FOREIGN KEY ("avant_projet_id") REFERENCES "avant_projets"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs_checklist_avp" ADD CONSTRAINT "blocs_checklist_avp_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_ligne_checklist_avp_id_fkey" FOREIGN KEY ("ligne_checklist_avp_id") REFERENCES "lignes_checklist_avp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_ligne_checklist_avp_id_fkey" FOREIGN KEY ("ligne_checklist_avp_id") REFERENCES "lignes_checklist_avp"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Suppression douce des lignes déjà seedées sur les groupes retirés — rien
-- n'est perdu, juste masqué (même convention que dossier_final).
UPDATE "lignes_checklist_avp"
SET "supprimee" = true, "supprime_le" = now()
WHERE "groupe" IN ('programme', 'releve_existant') AND "supprimee" = false;
