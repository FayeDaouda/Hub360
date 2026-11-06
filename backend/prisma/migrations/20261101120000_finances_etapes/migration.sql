-- Matrice des droits, lot 3 (Finances, décision du 31/10/2026). Les quatre
-- étapes historiques (finances_devis, finances_factures, finances_marges,
-- finances_charges) gardent leur clé et prennent leur vrai nom ; les règles
-- écrites dans le code deviennent des étapes. Droits de départ = comportement
-- actuel :
--   contresignature    Validation : le CEO (seul au-delà du seuil, jamais en deçà) ;
--   catalogue          Lecture des offres ; Écriture et Suppression : CEO et administration ;
--   encaissements      Lecture des factures ; Validation et Suppression : qui validait les factures ;
--   clôture            Lecture des factures ; Validation : qui validait les factures ;
--                      Suppression (rouvrir) : le CEO ;
--   paramètres         Lecture des factures ; Écriture : le CFO ;
--   rentabilité détail Lecture : CFO et CEO (montants, coût par salarié) ; Écriture : le CFO ;
--   commissions        Lecture : COO, CFO, administration et qui voyait les charges ;
--                      Écriture (coordonnées) : le COO ; Validation (payer) : CFO et administration.

UPDATE "etapes_module" SET "nom" = v.nom, "ordre" = 0, "libelles" = v.libelles::jsonb
FROM (VALUES
  ('finances_devis', 'Offres et devis',
   '{"lecture": "Voit les offres, les devis et leurs montants", "ecriture": "Rédige et modifie une offre, enregistre la réponse du client, relance", "validation": "Valide ou renvoie une offre soumise, l’envoie au client", "suppression": "Supprime une offre ou un devis en brouillon"}'),
  ('finances_factures', 'Factures',
   '{"lecture": "Voit les factures, les échéanciers et les relances", "ecriture": "Prépare une facture, un échéancier, des mensualités, relance un client", "validation": "Émet une facture (numéro définitif) ou un avoir", "suppression": "Supprime une facture en brouillon"}'),
  ('finances_marges', 'Marges et rentabilité',
   '{"lecture": "Voit la rentabilité des projets (taux) et la feuille de temps chiffrée"}'),
  ('finances_charges', 'Charges',
   '{"lecture": "Voit les charges et les bureaux d’études à régler", "validation": "Règle un bureau d’études"}')
) AS v(cle, nom, libelles)
WHERE "etapes_module"."cle" = v.cle;

-- Droits sans objet pour ces étapes : jamais lus par une route, effacés.
UPDATE "droits_roles" d SET "ecriture" = false, "validation" = false, "suppression" = false
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'finances_marges';
UPDATE "droits_roles" d SET "ecriture" = false, "suppression" = false
FROM "etapes_module" e WHERE e."id" = d."etape_id" AND e."cle" = 'finances_charges';

INSERT INTO "etapes_module" ("id", "module_id", "cle", "nom", "ordre", "libelles")
SELECT gen_random_uuid()::text, m."id", v.cle, v.nom, v.ordre, v.libelles::jsonb
FROM "modules" m
JOIN (VALUES
  ('finances_devis', 'finances.contresignature', 'Contresignature au-delà du seuil', 1,
   '{"validation": "Valide seul les offres, devis et factures au-delà du seuil de contresignature (et seulement celles-là), décide des avoirs"}'),
  ('finances_devis', 'finances.catalogue', 'Catalogue produits et services', 2,
   '{"lecture": "Voit les prestations et leurs tarifs", "ecriture": "Ajoute ou modifie une prestation et ses tarifs", "suppression": "Retire une prestation du catalogue"}'),
  ('finances_factures', 'finances.encaissements', 'Encaissements', 1,
   '{"lecture": "Voit les paiements reçus", "validation": "Enregistre un paiement reçu", "suppression": "Annule un paiement enregistré"}'),
  ('finances_factures', 'finances.cloture', 'Clôture du mois', 2,
   '{"lecture": "Voit les mois clôturés", "validation": "Clôture un mois terminé : ses factures et paiements sont figés", "suppression": "Rouvre un mois clôturé, avec un motif"}'),
  ('finances_factures', 'finances.parametres', 'Paramètres de facturation', 3,
   '{"lecture": "Voit la numérotation et le profil de facturation", "ecriture": "Modifie la numérotation des factures et le profil de facturation"}'),
  ('finances_marges', 'finances.rentabilite_detail', 'Rentabilité en montants', 1,
   '{"lecture": "Voit les montants (pas seulement le taux) et le coût par salarié", "ecriture": "Modifie les paramètres de rentabilité"}'),
  ('finances_charges', 'finances.commissions', 'Commissions des apporteurs', 1,
   '{"lecture": "Voit les commissions dues et versées", "ecriture": "Saisit ou modifie les coordonnées de paiement d’un apporteur", "validation": "Paie une commission"}')
) AS v(module, cle, nom, ordre, libelles) ON v.module = m."cle";

-- Droits actuels par rôle sur les quatre étapes historiques.
CREATE TEMP TABLE fin_avant AS
SELECT r."id" AS role_id, r."nom",
  COALESCE(bool_or(e."cle" = 'finances_devis' AND d."lecture"), false) AS devis_l,
  COALESCE(bool_or(e."cle" = 'finances_factures' AND d."lecture"), false) AS fact_l,
  COALESCE(bool_or(e."cle" = 'finances_factures' AND d."validation"), false) AS fact_v,
  COALESCE(bool_or(e."cle" = 'finances_marges' AND d."lecture"), false) AS marges_l,
  COALESCE(bool_or(e."cle" = 'finances_charges' AND d."lecture"), false) AS charges_l
FROM "roles" r
LEFT JOIN "droits_roles" d ON d."role_id" = r."id"
LEFT JOIN "etapes_module" e ON e."id" = d."etape_id"
GROUP BY r."id", r."nom";

INSERT INTO "droits_roles" ("id", "role_id", "etape_id", "lecture", "ecriture", "validation", "suppression")
SELECT gen_random_uuid()::text, a.role_id, e."id", v.l, v.e, v.v, v.s
FROM fin_avant a
CROSS JOIN LATERAL (VALUES
  ('finances.contresignature', false, false, a."nom" = 'CEO (transverse)', false),
  ('finances.catalogue', a.devis_l, a."nom" IN ('CEO (transverse)', 'societe_admin'), false, a."nom" IN ('CEO (transverse)', 'societe_admin')),
  ('finances.encaissements', a.fact_l, false, a.fact_v, a.fact_v),
  ('finances.cloture', a.fact_l, false, a.fact_v, a."nom" = 'CEO (transverse)'),
  ('finances.parametres', a.fact_l, a."nom" = 'CFO', false, false),
  ('finances.rentabilite_detail', a.marges_l AND a."nom" IN ('CFO', 'CEO (transverse)'), a.marges_l AND a."nom" = 'CFO', false, false),
  ('finances.commissions', a."nom" IN ('COO', 'CFO', 'societe_admin') OR a.charges_l, a."nom" = 'COO', a."nom" IN ('CFO', 'societe_admin'), false)
) AS v(cle, l, e, v, s)
JOIN "etapes_module" e ON e."cle" = v.cle
WHERE v.l OR v.e OR v.v OR v.s;

DROP TABLE fin_avant;
