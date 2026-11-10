-- CO0 et SU0 (09/11/2026) : conception au tarif au m² saisi sur l'offre, et
-- son suivi de chantier au prix saisi (CO0 → SU0). Ajoutés à chaque société
-- qui a déjà le catalogue réel (CO1), comme l'import (prisma/catalogue.ts).
INSERT INTO "produits_services" (
  "id", "societe_id", "code", "famille", "unite", "mode_calcul", "prix_modifiable",
  "co_associe", "designation", "prix_unitaire", "taux_tva", "description", "supprime"
)
SELECT gen_random_uuid()::text, c."societe_id", v.code, v.famille, v.unite, v.mode::"ModeCalculProduit", true,
  v.co_associe, v.designation, NULL, c."taux_tva", v.description, false
FROM "produits_services" c
CROSS JOIN (VALUES
  ('CO0', 'CO', 'm2', 'surface_planches', NULL,
   'CO0 — Conception',
   'Conception dont le tarif au m² se fixe à la main sur l''offre (ajout HUB du 09/11/2026, hors catalogue fourni).'),
  ('SU0', 'SU', 'mois', 'quantite', 'CO0',
   'SU0 — Suivi de chantier',
   'Suivi de chantier d''un projet en CO0 : prix mensuel fixé à la main sur l''offre (ajout HUB du 09/11/2026, hors catalogue fourni).')
) AS v(code, famille, unite, mode, co_associe, designation, description)
WHERE c."code" = 'CO1'
ON CONFLICT ("societe_id", "code") DO NOTHING;
