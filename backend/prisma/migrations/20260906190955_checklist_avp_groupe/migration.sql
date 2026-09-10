/*
  Warnings:

  - Added the required column `groupe` to the `lignes_checklist_avp` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "lignes_checklist_avp" ADD COLUMN     "groupe" "GroupeChecklistAvp" NOT NULL;
