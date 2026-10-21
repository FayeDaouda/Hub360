-- Le code fiscal COFI s'imprime à côté du NINEA (comme dans les CGV) : ce
-- n'était pas un « centre fiscal ». Les valeurs saisies sont gardées.
ALTER TABLE "profils_facturation" RENAME COLUMN "centre_fiscal" TO "cofi";

-- CGV jointes en annexe des factures, par défaut (demande du CEO).
ALTER TABLE "profils_facturation" ADD COLUMN "joindre_cgv" BOOLEAN NOT NULL DEFAULT true;
