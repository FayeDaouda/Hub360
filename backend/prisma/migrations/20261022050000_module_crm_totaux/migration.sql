-- Revue COO (22/10/2026) : montants du pipeline en totaux HT par étape, sans
-- le détail des offres. Nouveau module de la matrice ; les niveaux par rôle
-- se règlent dans la matrice (journal des droits), pas ici.
INSERT INTO "modules" ("id", "nom", "cle", "description")
VALUES ('6f1c2a7e-4b8d-4e0a-9c3f-2d5b7a1e9c04', 'CRM — Totaux HT', 'crm_totaux', 'Montants HT du pipeline par étape, sans le détail des offres')
ON CONFLICT ("cle") DO NOTHING;
