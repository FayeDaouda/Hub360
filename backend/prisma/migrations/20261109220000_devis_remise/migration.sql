-- Remise sur toute l'offre (09/11/2026) : 5, 10, 15, 20 ou 25 % ; null = aucune.
ALTER TABLE "devis" ADD COLUMN "remise_pct" INTEGER;
ALTER TABLE "devis" ADD CONSTRAINT "devis_remise_pct_check"
  CHECK ("remise_pct" IS NULL OR "remise_pct" IN (5, 10, 15, 20, 25));
