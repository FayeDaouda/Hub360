-- Matrice des droits, lot 2 (CRM, décision du 31/10/2026) : l'étape unique
-- « crm » se découpe en cinq étapes, et le module à part « crm_totaux »
-- devient l'étape « crm.totaux ». Les règles écrites dans le code (« seul le
-- COO modifie l'apporteur », « seuls les titulaires Dir. GC réassignent et
-- archivent ») deviennent des cases. Droits de départ = comportement actuel :
--   crm.dossiers     Lecture / Écriture de « crm » ; Suppression (archiver)
--                    seulement pour ceux qui archivent aujourd'hui (Dir. GC,
--                    societe_admin) ;
--   crm.soumission   Écriture = Écriture de « crm » ;
--   crm.proprietaire Lecture de « crm » ; Écriture (réassigner) pour Dir. GC
--                    et societe_admin ;
--   crm.apporteur    Lecture de « crm » ; Écriture pour le COO ;
--   crm.totaux       Lecture pour qui voyait les montants : « crm_totaux »
--                    ou les offres (« finances_devis ») en lecture.
-- Le CIO et l'Administrateur HUB ont carte blanche (hors matrice).

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
CROSS JOIN (VALUES
  ('crm.dossiers', 'Dossiers et leads', 0,
   '{"lecture": "Voit le registre des dossiers et leurs fiches", "ecriture": "Crée un lead, complète sa fiche, refait une offre, déclare un dossier perdu", "suppression": "Archive ou désarchive un lead encore en « Nouveau projet »"}'),
  ('crm.soumission', 'Soumission au CFO', 1,
   '{"ecriture": "Soumet un dossier au CFO pour validation de l’offre ; la fiche se fige"}'),
  ('crm.proprietaire', 'Propriétaire du dossier', 2,
   '{"lecture": "Voit qui suit chaque dossier", "ecriture": "Réassigne un dossier à un autre Dir. GC"}'),
  ('crm.apporteur', 'Fiche apporteur', 3,
   '{"lecture": "Voit l’apporteur d’affaire et sa commission", "ecriture": "Modifie la fiche apporteur après la création du dossier"}'),
  ('crm.totaux', 'Totaux du pipeline', 4,
   '{"lecture": "Voit les montants HT par étape du pipeline, sans le détail des offres"}')
) AS v(cle, nom, ordre, libelles)
WHERE m."cle" = 'crm';

-- Droits de l'ancienne étape « crm », par rôle.
CREATE TEMP TABLE crm_avant AS
SELECT d."role_id", r."nom", d."lecture", d."ecriture"
FROM "droits_roles" d
JOIN "etapes_module" e ON e."id" = d."etape_id" AND e."cle" = 'crm'
JOIN "roles" r ON r."id" = d."role_id";

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, a."role_id", e."id", a."lecture", a."ecriture", false,
  a."ecriture" AND a."nom" IN ('Dir. GC', 'societe_admin')
FROM crm_avant a, "etapes_module" e WHERE e."cle" = 'crm.dossiers';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, a."role_id", e."id", false, a."ecriture", false, false
FROM crm_avant a, "etapes_module" e WHERE e."cle" = 'crm.soumission';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, a."role_id", e."id", a."lecture",
  a."lecture" AND a."nom" IN ('Dir. GC', 'societe_admin'), false, false
FROM crm_avant a, "etapes_module" e WHERE e."cle" = 'crm.proprietaire';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, a."role_id", e."id", a."lecture", a."ecriture" AND a."nom" = 'COO', false, false
FROM crm_avant a, "etapes_module" e WHERE e."cle" = 'crm.apporteur';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, r."id", e."id", true, false, false, false
FROM "roles" r, "etapes_module" e
WHERE e."cle" = 'crm.totaux'
  AND EXISTS (
    SELECT 1 FROM "droits_roles" d
    JOIN "etapes_module" x ON x."id" = d."etape_id" AND x."cle" IN ('crm_totaux', 'finances_devis')
    WHERE d."role_id" = r."id" AND d."lecture"
  );

DROP TABLE crm_avant;

-- L'ancienne étape et l'ancien module (leurs droits partent avec eux). Un
-- interrupteur posé sur « crm_totaux » n'a plus d'objet : le CRM se coupe en
-- entier.
DELETE FROM "etapes_module" WHERE "cle" = 'crm';
DELETE FROM "modules_desactives" WHERE "module_cle" = 'crm_totaux';
DELETE FROM "modules" WHERE "cle" = 'crm_totaux';
