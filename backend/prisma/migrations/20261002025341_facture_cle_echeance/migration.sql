-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "cle_echeance" TEXT;


-- Factures d'échéancier existantes : clé retrouvée depuis le jalon (conception)
-- ou le libellé posé par le plan de facturation (permis, images, autres).
UPDATE "factures" SET "cle_echeance" = CASE "jalon"
    WHEN 'signature' THEN 'CO:F1' WHEN 'avant_projet' THEN 'CO:F2' WHEN 'livraison' THEN 'CO:F3' END
  WHERE "devis_echeancier_id" IS NOT NULL AND "jalon" IS NOT NULL;
UPDATE "factures" SET "cle_echeance" = split_part("libelle", ' — ', 1) || ':avance'
  WHERE "devis_echeancier_id" IS NOT NULL AND "jalon" IS NULL AND "libelle" LIKE '% — Avance à la commande (50 \%)';
UPDATE "factures" SET "cle_echeance" = split_part("libelle", ' — ', 1) || ':solde'
  WHERE "devis_echeancier_id" IS NOT NULL AND "jalon" IS NULL AND "libelle" LIKE '% — Solde à la remise du livrable (50 \%)';
UPDATE "factures" SET "cle_echeance" = 'IM:' || ("taux_tva"::float8)::text
  WHERE "devis_echeancier_id" IS NOT NULL AND "jalon" IS NULL AND "libelle" LIKE 'Images intérieures — %';
UPDATE "factures" SET "cle_echeance" = 'AUTRES:' || ("taux_tva"::float8)::text
  WHERE "devis_echeancier_id" IS NOT NULL AND "jalon" IS NULL AND "libelle" LIKE 'Autres prestations de l’offre — %';
