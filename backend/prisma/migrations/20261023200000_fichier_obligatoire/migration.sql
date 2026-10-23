-- Fichier obligatoire au dépôt d'une tâche (case du gabarit, cochée par
-- défaut). Les tâches déjà instanciées gardent l'ancien comportement
-- (facultatif) ; les nouvelles le reçoivent du gabarit (défaut : oui).
ALTER TABLE "taches_projet" ADD COLUMN "fichier_obligatoire" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "taches_projet" ALTER COLUMN "fichier_obligatoire" SET DEFAULT true;
