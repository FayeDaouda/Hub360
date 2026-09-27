-- Restructuration Permis (sept. 2026) : « Dossier de permis de construire »
-- renommé « Constitution » et collapsé à 1 item (les 12 pièces deviennent de
-- simples fichiers joints, plusieurs par ligne — statut n'y change rien
-- schéma-wise, juste le contenu du gabarit dans domaine/config.ts). Dépôt
-- urbanisme / Procédure gardent leurs items individuels mais perdent le
-- bouton « joindre » par item, remplacé par UN point d'upload partagé par
-- bloc — d'où la nouvelle FK composite blocPermisPermisId/blocPermisGroupe
-- sur ImageProjet/FichierProjet ci-dessous.
-- AlterTable
ALTER TABLE "fichiers_projet" ADD COLUMN     "bloc_permis_groupe" "GroupeChecklistPermis",
ADD COLUMN     "bloc_permis_permis_id" TEXT;

-- AlterTable
ALTER TABLE "images_projet" ADD COLUMN     "bloc_permis_groupe" "GroupeChecklistPermis",
ADD COLUMN     "bloc_permis_permis_id" TEXT;

-- AddForeignKey
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_bloc_permis_permis_id_bloc_permis_groupe_fkey" FOREIGN KEY ("bloc_permis_permis_id", "bloc_permis_groupe") REFERENCES "blocs_permis"("permis_id", "groupe") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_bloc_permis_permis_id_bloc_permis_groupe_fkey" FOREIGN KEY ("bloc_permis_permis_id", "bloc_permis_groupe") REFERENCES "blocs_permis"("permis_id", "groupe") ON DELETE SET NULL ON UPDATE CASCADE;

