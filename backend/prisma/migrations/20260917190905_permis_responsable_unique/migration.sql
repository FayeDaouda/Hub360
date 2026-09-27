-- Un seul responsable pour tout le module Permis (remplace l'assignation ligne par ligne)
ALTER TABLE "permis" ADD COLUMN "responsable_permis_id" TEXT;
ALTER TABLE "permis" ADD CONSTRAINT "permis_responsable_permis_id_fkey" FOREIGN KEY ("responsable_permis_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Retrait de l'assignation par ligne (donnée de test uniquement à ce stade)
ALTER TABLE "lignes_checklist_permis" DROP CONSTRAINT "lignes_checklist_permis_collaborateur_id_fkey";
ALTER TABLE "lignes_checklist_permis" DROP COLUMN "collaborateur_id";

-- Rattachement d'une image/d'un fichier à un item précis de la checklist Permis
ALTER TABLE "images_projet" ADD COLUMN "ligne_checklist_permis_id" TEXT;
ALTER TABLE "images_projet" ADD CONSTRAINT "images_projet_ligne_checklist_permis_id_fkey" FOREIGN KEY ("ligne_checklist_permis_id") REFERENCES "lignes_checklist_permis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fichiers_projet" ADD COLUMN "ligne_checklist_permis_id" TEXT;
ALTER TABLE "fichiers_projet" ADD CONSTRAINT "fichiers_projet_ligne_checklist_permis_id_fkey" FOREIGN KEY ("ligne_checklist_permis_id") REFERENCES "lignes_checklist_permis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
