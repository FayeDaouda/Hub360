-- Échéance + responsable remontent au niveau du bloc (groupe), plus au niveau
-- du module entier ni de l'item — cf. mémoire du 2026-09-17.

-- Retrait du responsable unique du module (remplacé par un responsable par bloc)
ALTER TABLE "permis" DROP CONSTRAINT "permis_responsable_permis_id_fkey";
ALTER TABLE "permis" DROP COLUMN "responsable_permis_id";

-- Retrait de l'échéance/prolongation par item (données de test uniquement à ce stade)
ALTER TABLE "lignes_checklist_permis" DROP COLUMN "echeance";
ALTER TABLE "lignes_checklist_permis" DROP COLUMN "prolongation_demandee_le";
ALTER TABLE "lignes_checklist_permis" DROP COLUMN "prolongation_echeance";
ALTER TABLE "lignes_checklist_permis" DROP COLUMN "prolongation_motif";

-- Les 3 blocs fixes (dossier_permis / depot_urbanisme / procedure) : échéance +
-- responsable + prolongation, un par (permis_id, groupe).
CREATE TABLE "blocs_permis" (
    "permis_id" TEXT NOT NULL,
    "groupe" "GroupeChecklistPermis" NOT NULL,
    "echeance" TEXT,
    "responsable_id" TEXT,
    "prolongation_demandee_le" TIMESTAMP(3),
    "prolongation_echeance" TEXT,
    "prolongation_motif" TEXT,

    CONSTRAINT "blocs_permis_pkey" PRIMARY KEY ("permis_id", "groupe")
);

ALTER TABLE "blocs_permis" ADD CONSTRAINT "blocs_permis_permis_id_fkey" FOREIGN KEY ("permis_id") REFERENCES "permis"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocs_permis" ADD CONSTRAINT "blocs_permis_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
