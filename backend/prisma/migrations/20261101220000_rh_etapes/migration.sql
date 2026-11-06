-- Matrice des droits, lot 7 (RH, décision du 31/10/2026). L'étape « rh »
-- garde sa clé (Dossiers du personnel) ; salaires, bulletins, feuilles de
-- temps, intégration et demandes ont leur étape. Les circuits restent des
-- règles (01/11/2026) : N+1, validation finale par la RH (le CEO pour une
-- demande de la RH), salaire du CFO validé par le CEO. Droits de départ =
-- comportement actuel :
--   rh               Lecture : qui lisait la RH ; Écriture, Validation (moyen de
--                    paiement), Suppression (archiver) : qui écrivait dans la RH ;
--   salaires         Lecture : qui lisait la RH ; Écriture et Suppression : qui
--                    écrivait (la RH propose) ; Validation : CFO et CEO ;
--   bulletins, intégration, temps, demandes : Lecture pour qui lisait la RH,
--                    gestes pour qui y écrivait.

UPDATE "etapes_module" SET "nom" = 'Dossiers du personnel', "libelles" =
  '{"lecture": "Voit les dossiers, contrats, pièces, alertes et bulletins", "ecriture": "Crée ou modifie un dossier, dépose une pièce", "validation": "Valide un changement de moyen de paiement demandé par un salarié", "suppression": "Archive un dossier (départ), ou le rouvre"}'::jsonb
WHERE "cle" = 'rh';
-- La Validation suit désormais l'écriture (geste écrit avant : POST en écriture).
UPDATE "droits_roles" d SET "validation" = d."ecriture"
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'rh';

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
CROSS JOIN (VALUES
  ('rh.salaires', 'Salaires', 1, '{"lecture": "Voit les salaires et la masse salariale", "ecriture": "Propose un changement de salaire", "validation": "Valide un changement de salaire (le CEO pour celui du CFO)", "suppression": "Retire une proposition pas encore décidée"}'),
  ('rh.bulletins', 'Bulletins de paie', 2, '{"ecriture": "Dépose ou remplace un bulletin de paie", "suppression": "Retire un bulletin"}'),
  ('rh.temps', 'Feuilles de temps', 3, '{"lecture": "Voit les feuilles de temps de chacun", "ecriture": "Traite un écart signalé par un salarié", "validation": "Contrôle une feuille de temps du mois"}'),
  ('rh.integration', 'Intégration des arrivées', 4, '{"lecture": "Voit les arrivées en cours", "ecriture": "Coche les étapes de l’intégration, confirme la période d’essai"}'),
  ('rh.demandes', 'Demandes des salariés', 5, '{"lecture": "Voit les demandes (congés, remboursements, attestations)", "ecriture": "Délivre une attestation, traite un remboursement", "validation": "Valide en dernier une absence, après le N+1 (le CEO pour la RH)"}')
) AS v(cle, nom, ordre, libelles)
WHERE m."cle" = 'rh';

CREATE TEMP TABLE rh_avant AS
SELECT r."id" AS role_id, r."nom",
  COALESCE(bool_or(e."cle" = 'rh' AND d."lecture"), false) AS lit,
  COALESCE(bool_or(e."cle" = 'rh' AND d."ecriture"), false) AS ecrit
FROM "roles" r
LEFT JOIN "droits_roles" d ON d."role_id" = r."id"
LEFT JOIN "etapes_module" e ON e."id" = d."etape_id"
GROUP BY r."id", r."nom";

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, a.role_id, e."id", v.l, v.e, v.v, v.s
FROM rh_avant a
CROSS JOIN LATERAL (VALUES
  ('rh.salaires', a.lit, a.ecrit, a."nom" IN ('CFO', 'CEO (transverse)'), a.ecrit),
  ('rh.bulletins', false, a.ecrit, false, a.ecrit),
  ('rh.temps', a.lit, a.ecrit, a.ecrit, false),
  ('rh.integration', a.lit, a.ecrit, false, false),
  ('rh.demandes', a.lit, a.ecrit, a.ecrit, false)
) AS v(cle, l, e, v, s)
JOIN "etapes_module" e ON e."cle" = v.cle
WHERE v.l OR v.e OR v.v OR v.s;

DROP TABLE rh_avant;
