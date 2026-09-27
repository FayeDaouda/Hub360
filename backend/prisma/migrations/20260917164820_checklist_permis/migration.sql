-- CreateEnum
CREATE TYPE "GroupeChecklistPermis" AS ENUM ('dossier_permis', 'depot_urbanisme', 'procedure');

-- CreateTable
CREATE TABLE "lignes_checklist_permis" (
    "id" TEXT NOT NULL,
    "permis_id" TEXT NOT NULL,
    "groupe" "GroupeChecklistPermis" NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "fait" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "collaborateur_id" TEXT,
    "echeance" TEXT,
    "fait_le" TIMESTAMP(3),
    "fait_par_id" TEXT,
    "prolongation_demandee_le" TIMESTAMP(3),
    "prolongation_echeance" TEXT,
    "prolongation_motif" TEXT,
    "supprimee" BOOLEAN NOT NULL DEFAULT false,
    "supprime_le" TIMESTAMP(3),
    "supprime_par_id" TEXT,

    CONSTRAINT "lignes_checklist_permis_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "lignes_checklist_permis" ADD CONSTRAINT "lignes_checklist_permis_permis_id_fkey" FOREIGN KEY ("permis_id") REFERENCES "permis"("projet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_checklist_permis" ADD CONSTRAINT "lignes_checklist_permis_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_checklist_permis" ADD CONSTRAINT "lignes_checklist_permis_fait_par_id_fkey" FOREIGN KEY ("fait_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_checklist_permis" ADD CONSTRAINT "lignes_checklist_permis_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
