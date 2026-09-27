-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "sigle" TEXT;


-- Quartiers d'usage ajoutés au référentiel (validés, sept. 2026) : un studio
-- raisonne en quartiers reconnus, pas en communes. Codes fournis par la
-- direction, vérifiés sans collision avec les 143 lignes existantes. Commune
-- renseignée seulement quand le fichier source l'atteste (nom de la commune) ;
-- les autres restent à compléter par la direction depuis Paramètres.
INSERT INTO "localites" ("id", "code", "nom", "zone", "region", "arrondissement", "commune", "ordre") VALUES
  (gen_random_uuid()::text, 'POI', 'Point E', 'dakar', 'Dakar', 'Dakar-Plateau', 'Fann-Point E-Amitié', 46),
  (gen_random_uuid()::text, 'SAC', 'Sacré-Cœur', 'dakar', 'Dakar', 'Almadies', 'Mermoz-Sacré-Cœur', 47),
  (gen_random_uuid()::text, 'OUE', 'Ouest Foire', 'dakar', 'Dakar', NULL, NULL, 48),
  (gen_random_uuid()::text, 'MAM', 'Mamelles', 'dakar', 'Dakar', NULL, NULL, 49),
  (gen_random_uuid()::text, 'LIB', 'Liberté 6', 'dakar', 'Dakar', NULL, NULL, 50),
  (gen_random_uuid()::text, 'SIC', 'Sicap Baobab', 'dakar', 'Dakar', NULL, NULL, 51),
  (gen_random_uuid()::text, 'VDN', 'VDN', 'dakar', 'Dakar', NULL, NULL, 52);
