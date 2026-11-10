-- Gamme (10/11/2026) : même échelle que le standing, économique / moyen /
-- grand (le potentiel de l'ouvrage en finitions). Valeurs renommées dans
-- l'ordre (décision du 10/11/2026) : les dossiers gardent leur rang.
ALTER TYPE "Gamme" RENAME VALUE 'local' TO 'economique';
ALTER TYPE "Gamme" RENAME VALUE 'importe' TO 'moyen';
ALTER TYPE "Gamme" RENAME VALUE 'sur_mesure_importe' TO 'grand';
