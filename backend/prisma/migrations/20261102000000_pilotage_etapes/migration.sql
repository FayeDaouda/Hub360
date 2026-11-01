-- Matrice des droits, lot 8 (Pilotage, décision du 31/10/2026). L'étape
-- « pilotage » garde sa clé (Indicateurs et reportings) ; les reportings
-- suivent leur circuit par fonction. Droits de départ = comportement actuel :
--   registre     Écriture : CTO, CEO, administration ;
--   décisions    Écriture (proposer) : CTO, COO ; Validation (trancher) : CEO, administration ;
--   synthèse     Lecture : CEO, CFO, administration ; Écriture (commenter) : CFO ;
--   délégation   Lecture : CEO, administration ; Validation : CEO ;
--   journal      Lecture : CEO, administration (le CIO par sa carte blanche).

UPDATE "etapes_module" SET "nom" = 'Indicateurs et reportings', "libelles" =
  '{"lecture": "Voit les indicateurs de sa fonction et les reportings qui le concernent"}'::jsonb
WHERE "cle" = 'pilotage';
UPDATE "droits_roles" d SET "ecriture" = false, "validation" = false, "suppression" = false
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'pilotage';

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
CROSS JOIN (VALUES
  ('pilotage.registre', 'Registre des décisions', 1, '{"ecriture": "Inscrit une décision des instances au registre, la clôture"}'),
  ('pilotage.decisions', 'Décisions proposées', 2, '{"ecriture": "Propose une décision au CEO", "validation": "Accepte, modifie ou refuse une décision proposée"}'),
  ('pilotage.synthese', 'Synthèse mensuelle', 3, '{"lecture": "Lit la synthèse du mois", "ecriture": "Commente la synthèse"}'),
  ('pilotage.delegation', 'Délégation du CEO', 4, '{"lecture": "Voit toutes les délégations en cours et à venir", "validation": "Délègue les décisions du CEO à un délégataire, ou révoque"}'),
  ('pilotage.journal', 'Journal d’audit', 5, '{"lecture": "Lit le journal d’audit : comptes, droits, finances, réglages"}')
) AS v(cle, nom, ordre, libelles)
WHERE m."cle" = 'pilotage';

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, r."id", e."id", v.l, v.e, v.v, false
FROM "roles" r
CROSS JOIN LATERAL (VALUES
  ('pilotage.registre', false, r."nom" IN ('CTO (transverse)', 'CEO (transverse)', 'societe_admin'), false),
  ('pilotage.decisions', false, r."nom" IN ('CTO (transverse)', 'COO'), r."nom" IN ('CEO (transverse)', 'societe_admin')),
  ('pilotage.synthese', r."nom" IN ('CEO (transverse)', 'CFO', 'societe_admin'), r."nom" = 'CFO', false),
  ('pilotage.delegation', r."nom" IN ('CEO (transverse)', 'societe_admin'), false, r."nom" = 'CEO (transverse)'),
  ('pilotage.journal', r."nom" IN ('CEO (transverse)', 'societe_admin'), false, false)
) AS v(cle, l, e, v)
JOIN "etapes_module" e ON e."cle" = v.cle
WHERE r."supprime_le" IS NULL AND (v.l OR v.e OR v.v);
