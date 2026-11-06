-- Matrice des droits, lot 6 (Équipe, décision du 31/10/2026). L'étape
-- « equipe » garde sa clé (Équipes et collaborateurs) ; l'affectation des
-- équipes à un projet devient son étape. Droits de départ = comportement
-- actuel : qui écrivait dans Équipe affecte les équipes des projets.

UPDATE "etapes_module" SET "nom" = 'Équipes et collaborateurs', "libelles" =
  '{"lecture": "Voit les collaborateurs, les équipes et leur charge", "ecriture": "Modifie une fiche, crée une équipe, change ses membres, désigne le chef", "suppression": "Supprime une équipe sans membres"}'::jsonb
WHERE "cle" = 'equipe';
-- Validation sans objet (aucune route ne la lit).
UPDATE "droits_roles" d SET "validation" = false
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'equipe';

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", 'equipe.projets', 'Équipes des projets', 1,
  '{"ecriture": "Affecte une équipe à un projet, ou la retire"}'::jsonb
FROM "modules" m WHERE m."cle" = 'equipe';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, d."role_id", p."id", false, true, false, false
FROM "droits_roles" d
JOIN "etapes_module" e ON e."id" = d."etape_id" AND e."cle" = 'equipe'
CROSS JOIN "etapes_module" p
WHERE p."cle" = 'equipe.projets' AND d."ecriture";
