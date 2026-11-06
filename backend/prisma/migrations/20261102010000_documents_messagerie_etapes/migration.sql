-- Matrice des droits, lot 9 (Documents et Communication, décision du
-- 31/10/2026) : phrases claires pour ces deux étapes. « documents » n'est lu
-- par aucun écran pour l'instant (module à venir) ; la messagerie ne se sert
-- que de Lecture et d'Écriture — la Validation et la Suppression, sans objet,
-- sont effacées (aucune route ne les lit).

UPDATE "etapes_module" SET "nom" = 'Documents partagés', "libelles" =
  '{"lecture": "Voit et télécharge les documents partagés (aucun écran pour l’instant : module à venir)", "ecriture": "Ajoute ou remplace un document partagé", "suppression": "Supprime un document partagé"}'::jsonb
WHERE "cle" = 'documents';
UPDATE "droits_roles" d SET "validation" = false
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'documents';

UPDATE "etapes_module" SET "nom" = 'Messagerie', "libelles" =
  '{"lecture": "Lit le fil général, celui de son équipe et ses messages directs", "ecriture": "Écrit, ouvre une conversation directe"}'::jsonb
WHERE "cle" = 'communication';
UPDATE "droits_roles" d SET "validation" = false, "suppression" = false
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'communication';
