-- AlterTable
ALTER TABLE "lignes_checklist_avp" ADD COLUMN     "fait" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "lignes_unbord" ADD COLUMN     "fait" BOOLEAN NOT NULL DEFAULT false;


-- Backfill : les lignes qui ont déjà un fichier rattaché passent à fait=true
-- (sinon elles retomberaient en_attente maintenant que `fait` est la seule
-- source de la dérivation du statut, alors qu'avant fichiers.length > 0
-- suffisait à les afficher « fait »).
UPDATE lignes_checklist_avp SET fait = true
WHERE id IN (
  SELECT ligne_checklist_avp_id FROM images_projet WHERE ligne_checklist_avp_id IS NOT NULL AND supprimee = false
  UNION
  SELECT ligne_checklist_avp_id FROM fichiers_projet WHERE ligne_checklist_avp_id IS NOT NULL AND supprimee = false
);

UPDATE lignes_unbord SET fait = true
WHERE id IN (
  SELECT ligne_unbord_id FROM images_projet WHERE ligne_unbord_id IS NOT NULL AND supprimee = false
  UNION
  SELECT ligne_unbord_id FROM fichiers_projet WHERE ligne_unbord_id IS NOT NULL AND supprimee = false
);
