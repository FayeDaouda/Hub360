-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EvenementCompteType" ADD VALUE 'role_modifie';
ALTER TYPE "EvenementCompteType" ADD VALUE 'salaire_modifie';

-- CreateTable
CREATE TABLE "remunerations" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "salaire_brut_mensuel" INTEGER NOT NULL,
    "maj_par_id" TEXT,
    "maj_le" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remunerations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remunerations_utilisateur_id_key" ON "remunerations"("utilisateur_id");

-- AddForeignKey
ALTER TABLE "remunerations" ADD CONSTRAINT "remunerations_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

