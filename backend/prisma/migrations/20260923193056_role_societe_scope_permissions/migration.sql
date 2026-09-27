-- CreateEnum
CREATE TYPE "NiveauPermission" AS ENUM ('aucun', 'lecture', 'ecriture', 'validation');

-- DropIndex
DROP INDEX "roles_nom_key";

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "societe_id" TEXT,
ADD COLUMN     "supprime_le" TIMESTAMP(3),
ADD COLUMN     "supprime_par_id" TEXT;

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "niveau" "NiveauPermission" NOT NULL DEFAULT 'aucun',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_module_id_key" ON "role_permissions"("role_id", "module_id");

-- CreateIndex
CREATE INDEX "roles_societe_id_idx" ON "roles"("societe_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_societe_id_nom_key" ON "roles"("societe_id", "nom");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

