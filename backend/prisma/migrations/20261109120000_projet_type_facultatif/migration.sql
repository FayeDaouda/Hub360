-- Type de projet facultatif (09/11/2026) : la fiche CRM ne le demande plus,
-- la forme bâtie de la Fiche Programme le remplace. Valeurs existantes gardées.
ALTER TABLE "projets" ALTER COLUMN "type" DROP NOT NULL;
