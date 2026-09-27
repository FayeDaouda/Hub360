-- Morceau 1 de l'étape H : documents conformes aux CGV Grey Concrete.

-- Mentions du pied de document, portées par la société.
ALTER TABLE "societes" ADD COLUMN "mentions_legales" TEXT,
ADD COLUMN "coordonnees" TEXT,
ADD COLUMN "penalite_retard_mensuelle" DECIMAL(4,2);

-- Valeurs réelles de Grey Concrete : catalogue JSON (mentions légales) et
-- pied des CGV 2026 (coordonnées, art. 13 pénalités). Sans effet si la
-- société n'existe pas encore (base neuve : le seed les pose).
UPDATE "societes" SET
  "mentions_legales" = 'GREY CONCRETE SARL — NINEA 009429483 — COFI 292 — RCCM SN DKR 2022 B 17567 — Capital 1 000 000 FCFA',
  "coordonnees" = 'VDN, Cité CPI, Lot 57, Immeuble Miroir, 3ᵉ étage, Dakar, Sénégal · +221 33 823 61 94 · finances@greyconcrete.group',
  "penalite_retard_mensuelle" = 1.5
WHERE "slug" = 'grey-concrete';

-- Mobile money distingué en Wave / Orange Money. Aucun paiement n'utilisait
-- « mobile_money » à la date de la migration : renommage sans ambiguïté.
ALTER TYPE "ModePaiement" RENAME VALUE 'mobile_money' TO 'wave';
ALTER TYPE "ModePaiement" ADD VALUE 'orange_money' AFTER 'wave';
