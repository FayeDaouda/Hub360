-- Matrice des droits, lot 4 (Finances au niveau du groupe, décision du
-- 31/10/2026).
--
-- 1. Le CFO devient un rôle transverse (comme le CEO, le CTO, le CIO) : il
--    travaille pour toutes les sociétés. Même nom, mêmes droits, mêmes
--    titulaires ; seul son rattachement change (Role.societe_id → null).
UPDATE "roles" SET "societe_id" = NULL
WHERE "nom" = 'CFO' AND "societe_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "roles" r WHERE r."nom" = 'CFO' AND r."societe_id" IS NULL);

-- 2. Étape « Finances du groupe » : la vue consolidée de toutes les sociétés.
--    Droits de départ : CEO, CFO et CTO (ils voient déjà toutes les factures).
INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", 'finances.groupe', 'Finances du groupe', 4,
  '{"lecture": "Voit les finances consolidées de toutes les sociétés du groupe (facturé, encaissé, à encaisser)"}'::jsonb
FROM "modules" m WHERE m."cle" = 'finances_factures';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, d."role_id", g."id", true, false, false, false
FROM "droits_roles" d
JOIN "etapes_module" e ON e."id" = d."etape_id" AND e."cle" = 'finances_factures'
JOIN "roles" r ON r."id" = d."role_id"
CROSS JOIN "etapes_module" g
WHERE g."cle" = 'finances.groupe' AND d."lecture"
  AND r."nom" IN ('CEO (transverse)', 'CFO', 'CTO (transverse)');
