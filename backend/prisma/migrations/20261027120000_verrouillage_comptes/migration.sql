-- Verrouillage des comptes (lot C, décision du 28/10/2026) : essais de
-- connexion infructueux, fin du verrouillage en cours, verrouillages subis
-- depuis la dernière connexion réussie ; journal du verrouillage et du
-- déblocage par l'administration du HUB.
ALTER TABLE "utilisateurs" ADD COLUMN "echecs_connexion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "utilisateurs" ADD COLUMN "verrouille_jusquau" TIMESTAMP(3);
ALTER TABLE "utilisateurs" ADD COLUMN "verrouillages" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "EvenementCompteType" ADD VALUE 'compte_verrouille';
ALTER TYPE "EvenementCompteType" ADD VALUE 'compte_debloque';
