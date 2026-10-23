-- Profil de l'utilisateur (menu du compte) : nom affiché, photo, connexions.
ALTER TABLE "utilisateurs" ADD COLUMN "nom_affiche" TEXT;
ALTER TABLE "utilisateurs" ADD COLUMN "photo" BYTEA;
ALTER TABLE "utilisateurs" ADD COLUMN "photo_type" TEXT;
ALTER TABLE "utilisateurs" ADD COLUMN "photo_cle" TEXT;
ALTER TABLE "utilisateurs" ADD COLUMN "derniere_connexion_le" TIMESTAMP(3);
ALTER TABLE "utilisateurs" ADD COLUMN "connexion_precedente_le" TIMESTAMP(3);
CREATE UNIQUE INDEX "utilisateurs_photo_cle_key" ON "utilisateurs"("photo_cle");
ALTER TYPE "EvenementCompteType" ADD VALUE 'deconnexion_partout';
