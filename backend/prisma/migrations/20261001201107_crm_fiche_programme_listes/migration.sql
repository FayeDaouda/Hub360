-- AlterEnum
ALTER TYPE "Categorie" ADD VALUE 'developpement';

-- AlterEnum
BEGIN;
CREATE TYPE "Gamme_new" AS ENUM ('local', 'importe', 'sur_mesure_importe');
ALTER TABLE "dossiers_crm" ALTER COLUMN "gamme" TYPE "Gamme_new" USING ("gamme"::text::"Gamme_new");
ALTER TYPE "Gamme" RENAME TO "Gamme_old";
ALTER TYPE "Gamme_new" RENAME TO "Gamme";
DROP TYPE "Gamme_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Standing_new" AS ENUM ('economique', 'moyen', 'grand');
ALTER TABLE "dossiers_crm" ALTER COLUMN "standing" TYPE "Standing_new" USING ("standing"::text::"Standing_new");
ALTER TYPE "Standing" RENAME TO "Standing_old";
ALTER TYPE "Standing_new" RENAME TO "Standing";
DROP TYPE "Standing_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TypeBien_new" AS ENUM ('villa', 'immeuble_residentiel', 'immeuble_mixte', 'immeuble_bureaux', 'local_commercial', 'hotelier', 'equipement');
ALTER TABLE "dossiers_crm" ALTER COLUMN "type" TYPE "TypeBien_new" USING ("type"::text::"TypeBien_new");
ALTER TABLE "projets" ALTER COLUMN "type" TYPE "TypeBien_new" USING ("type"::text::"TypeBien_new");
ALTER TYPE "TypeBien" RENAME TO "TypeBien_old";
ALTER TYPE "TypeBien_new" RENAME TO "TypeBien";
DROP TYPE "TypeBien_old";
COMMIT;

-- AlterTable
ALTER TABLE "dossiers_crm" ADD COLUMN     "fiche_programme" JSONB;

