-- Matrice des droits, lot 5 (Projets, décision du 31/10/2026). L'étape
-- « projets » garde sa clé (Projets et cartes) ; chaque geste du circuit a
-- son étape. Le circuit reste une règle d'organisation (01/11/2026) : la
-- personne assignée remet, le chef d'équipe agit sur son équipe sans case, le
-- CTO prend le travail d'un Dir. GC. Droits de départ = comportement actuel :
--   assignation       Écriture : qui écrivait dans Projets (Dir. GC, CTO en suppléance, administration) ;
--   validation        Validation : Dir. GC, CTO, administration ;
--   visa              Validation : Dir. GC, administration ;
--   prolongations     Validation : Dir. GC, CTO, administration ;
--   ts                Écriture : Dir. GC, CTO, administration ; Validation : CTO, administration ;
--   fils              Écriture : qui écrivait dans Projets, CEO, CFO, Salarié ;
--   production        Lecture : Dir. GC, CTO, CEO, administration.

UPDATE "etapes_module" SET "nom" = 'Projets et cartes', "libelles" =
  '{"lecture": "Voit les projets, leurs cartes, leurs tâches et leur avancement", "ecriture": "Coche un élément, joint un fichier, marque « non nécessaire »"}'::jsonb
WHERE "cle" = 'projets';
-- Validation et Suppression sans objet sur l'étape principale (aucune route ne les lit).
UPDATE "droits_roles" d SET "validation" = false, "suppression" = false
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'projets';

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
CROSS JOIN (VALUES
  ('projets.assignation', 'Assignation des tâches', 1, '{"ecriture": "Assigne une tâche ou un bloc à un collaborateur (le chef d’équipe assigne ses membres sans case)"}'),
  ('projets.validation', 'Validation des remises', 2, '{"validation": "Valide ou renvoie une remise (le chef d’équipe valide son équipe ; le CTO le travail d’un Dir. GC)"}'),
  ('projets.visa', 'Visa DPLG', 3, '{"validation": "Appose le visa de l’architecte sur une tâche validée"}'),
  ('projets.prolongations', 'Prolongations', 4, '{"validation": "Accorde ou refuse un délai (le CTO quand la livraison du projet recule)"}'),
  ('projets.ts', 'Travaux supplémentaires', 5, '{"ecriture": "Ajoute un TS jusqu’au seuil des Réglages, le demande au-delà", "validation": "Accorde un TS au-delà du seuil (ou l’ajoute d’emblée)"}'),
  ('projets.fils', 'Fils de discussion', 6, '{"ecriture": "Écrit et mentionne dans les fils (le Salarié, sur les projets de son périmètre)"}'),
  ('projets.production', 'Tableau de production', 7, '{"lecture": "Voit le tableau de production (le Dir. GC : les projets qu’il porte)"}')
) AS v(cle, nom, ordre, libelles)
WHERE m."cle" = 'projets';

CREATE TEMP TABLE proj_avant AS
SELECT r."id" AS role_id, r."nom",
  COALESCE(bool_or(e."cle" = 'projets' AND d."ecriture"), false) AS ecrit
FROM "roles" r
LEFT JOIN "droits_roles" d ON d."role_id" = r."id"
LEFT JOIN "etapes_module" e ON e."id" = d."etape_id"
GROUP BY r."id", r."nom";

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, a.role_id, e."id", v.l, v.e, v.v, false
FROM proj_avant a
CROSS JOIN LATERAL (VALUES
  ('projets.assignation', false, a.ecrit, false),
  ('projets.validation', false, false, a."nom" IN ('Dir. GC', 'CTO (transverse)', 'societe_admin')),
  ('projets.visa', false, false, a."nom" IN ('Dir. GC', 'societe_admin')),
  ('projets.prolongations', false, false, a."nom" IN ('Dir. GC', 'CTO (transverse)', 'societe_admin')),
  ('projets.ts', false, a."nom" IN ('Dir. GC', 'CTO (transverse)', 'societe_admin'), a."nom" IN ('CTO (transverse)', 'societe_admin')),
  ('projets.fils', false, a.ecrit OR a."nom" IN ('CEO (transverse)', 'CFO', 'Salarié'), false),
  ('projets.production', a."nom" IN ('Dir. GC', 'CTO (transverse)', 'CEO (transverse)', 'societe_admin'), false, false)
) AS v(cle, l, e, v)
JOIN "etapes_module" e ON e."cle" = v.cle
WHERE v.l OR v.e OR v.v;

DROP TABLE proj_avant;
