-- CreateEnum
CREATE TYPE "TypePhotoImage" AS ENUM ('facade', 'interieur', 'chantier', 'existant');

-- AlterTable
ALTER TABLE "images_projet" ADD COLUMN     "type_photo" "TypePhotoImage";
