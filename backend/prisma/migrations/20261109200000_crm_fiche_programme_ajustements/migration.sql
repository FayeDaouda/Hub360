-- Type de projet et usage de la Fiche Programme (09/11/2026) : le type
-- (Résidentiel, Commercial, Industriel… Mixte) fixe la liste des usages ;
-- Mixte se décrit à la main. Les anciens usages deviennent des types :
--   residentiel → Résidentiel, usage à choisir
--   commercial  → Commercial, usage à choisir
--   bureau      → Commercial, usage « bureaux »
--   mixte       → Mixte, usage à écrire
-- Données seulement (JSON du dossier), aucune colonne ne change.
UPDATE "dossiers_crm"
SET "fiche_programme" = jsonb_set(
  jsonb_set("fiche_programme"::jsonb, '{typeProjet}',
    CASE "fiche_programme"->>'usage' WHEN 'bureau' THEN '"commercial"'::jsonb
      ELSE to_jsonb("fiche_programme"->>'usage') END),
  '{usage}',
  CASE "fiche_programme"->>'usage' WHEN 'bureau' THEN '"bureaux"'::jsonb ELSE 'null'::jsonb END)
WHERE "fiche_programme" IS NOT NULL
  AND "fiche_programme"->>'usage' IN ('residentiel', 'commercial', 'bureau', 'mixte');

-- Le résumé stocké (« programme ») fait la complétude de la fiche : un dossier
-- encore en « Nouveau projet » dont l'usage est à choisir redevient incomplet
-- (il ne se soumet pas au CFO sans usage). Les dossiers déjà soumis gardent le
-- leur : leur offre en dépend.
UPDATE "dossiers_crm"
SET "programme" = ''
WHERE "statut" = 'nouveau_projet'
  AND "fiche_programme" IS NOT NULL
  AND "fiche_programme"->>'typeProjet' IS NOT NULL
  AND "fiche_programme"->'usage' = 'null'::jsonb;

-- Commodités (09/11/2026) : « Pré-installation climatisation » et
-- « Climatisation centralisée » deviennent une seule « Climatisation ».
UPDATE "dossiers_crm"
SET "fiche_programme" = jsonb_set(
  "fiche_programme",
  '{commodites}',
  (SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
     FROM jsonb_array_elements_text("fiche_programme"->'commodites') AS e
    WHERE e NOT IN ('pre_climatisation', 'climatisation_centralisee', 'climatisation'))
  || '["climatisation"]'::jsonb)
WHERE jsonb_typeof("fiche_programme"->'commodites') = 'array'
  AND ("fiche_programme"->'commodites' ? 'pre_climatisation'
    OR "fiche_programme"->'commodites' ? 'climatisation_centralisee');
