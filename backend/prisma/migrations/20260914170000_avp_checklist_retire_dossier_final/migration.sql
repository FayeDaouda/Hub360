-- Le groupe de checklist « Dossier final (PDF & images) » est retiré (déc.
-- produit, sept. 2026) : son contenu fait double emploi avec les vrais
-- fichiers déjà suivis dans les sections Images / Documents de chaque
-- projet. Suppression douce des lignes déjà seedées sur les avant-projets
-- existants — même convention que le reste (rien n'est perdu, juste
-- masqué). La valeur d'enum `dossier_final` reste en base (coûteux à
-- retirer d'un type Postgres, sans utilité) mais n'est plus produite par
-- le gabarit (domaine/config.ts).
UPDATE "lignes_checklist_avp"
SET "supprimee" = true, "supprime_le" = now()
WHERE "groupe" = 'dossier_final' AND "supprimee" = false;
