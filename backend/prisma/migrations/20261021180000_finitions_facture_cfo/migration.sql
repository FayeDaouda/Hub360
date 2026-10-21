-- CGV complètes en annexe : sur la première facture d'un projet par défaut
-- (revue CFO du 21/10/2026), sur toutes, ou jamais.
CREATE TYPE "AnnexeCgv" AS ENUM ('premiere_facture', 'toujours', 'jamais');
ALTER TABLE "profils_facturation" ADD COLUMN "cgv_annexe" "AnnexeCgv" NOT NULL DEFAULT 'premiere_facture',
ADD COLUMN "confirmation" TEXT;
UPDATE "profils_facturation" SET "cgv_annexe" = 'jamais' WHERE "joindre_cgv" = false;
ALTER TABLE "profils_facturation" DROP COLUMN "joindre_cgv";

-- Échéance toujours explicite : une facture émise sans échéance est payable
-- à réception, donc à sa date d'émission (pénalités et balance âgée).
UPDATE "factures" SET "echeance_le" = to_char("emise_le", 'YYYY-MM-DD')
WHERE "emise_le" IS NOT NULL AND "echeance_le" IS NULL AND NOT "est_avoir";

-- Désignation lisible par le client des tranches de conception encore en
-- brouillon (les factures émises gardent leur texte) :
-- « CO2 — Fin de l'APD (40 %) » → « Honoraires de conception, catégorie CO2 ·
-- 2ᵉ tranche : fin de l’APD (40 %) ».
UPDATE "factures" SET "libelle" =
  'Honoraires de conception, catégorie ' || substring("libelle" from '^(CO\d+) — ') || ' · ' ||
  CASE "jalon"
    WHEN 'signature' THEN '1ʳᵉ tranche : acompte à la signature du contrat'
    WHEN 'avant_projet' THEN '2ᵉ tranche : fin de l’APD'
    ELSE '3ᵉ tranche : livraison des plans d’exécution'
  END || ' (' || substring("libelle" from '\((\d+) %\)$') || ' %)'
WHERE "statut" = 'brouillon' AND NOT "est_avoir" AND "jalon" IS NOT NULL AND "libelle" ~ '^CO\d+ — .*\(\d+ %\)$';
