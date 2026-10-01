-- Fiche apporteur (maquette « Nouveau projet », oct. 2026) : structure /
-- relation de l'apporteur externe (« Notaire, partenaire… »), facultative.
ALTER TABLE "dossiers_crm" ADD COLUMN "apporteur_structure" TEXT;
