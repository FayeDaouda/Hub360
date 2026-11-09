-- Fiche CRM modifiable après la soumission au CFO (09/11/2026) :
--  · étape de la matrice « Modifier une fiche figée » (Écriture seulement),
--    accordée à PERSONNE au départ — le CIO et l'Administrateur HUB (carte
--    blanche) la donnent aux rôles qu'ils choisissent ;
--  · notification « dossier_modifie » aux personnes concernées.

ALTER TYPE "NotificationType" ADD VALUE 'dossier_modifie';

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", 'crm.fiche_figee', 'Modifier une fiche figée', 5,
  '{"ecriture": "Modifie la fiche d’un dossier après sa soumission au CFO (fiche Programme, standing, gamme) ; les champs qui fixent le prix de l’offre restent figés"}'::jsonb
FROM "modules" m
WHERE m."cle" = 'crm'
  AND NOT EXISTS (SELECT 1 FROM "etapes_module" WHERE "cle" = 'crm.fiche_figee');
