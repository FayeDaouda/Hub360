-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'reporting_question';
ALTER TYPE "NotificationType" ADD VALUE 'reporting_reponse';

-- CreateTable
CREATE TABLE "lectures_reporting" (
    "id" TEXT NOT NULL,
    "reporting_id" TEXT NOT NULL,
    "lecteur_id" TEXT NOT NULL,
    "version" TIMESTAMP(3) NOT NULL,
    "lu_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lectures_reporting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions_reporting" (
    "id" TEXT NOT NULL,
    "reporting_id" TEXT NOT NULL,
    "auteur_id" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reponse" TEXT,
    "repondu_par_id" TEXT,
    "repondu_le" TIMESTAMP(3),

    CONSTRAINT "questions_reporting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lectures_reporting_reporting_id_lecteur_id_key" ON "lectures_reporting"("reporting_id", "lecteur_id");

-- CreateIndex
CREATE INDEX "questions_reporting_reporting_id_idx" ON "questions_reporting"("reporting_id");

-- AddForeignKey
ALTER TABLE "lectures_reporting" ADD CONSTRAINT "lectures_reporting_reporting_id_fkey" FOREIGN KEY ("reporting_id") REFERENCES "reportings_mensuels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions_reporting" ADD CONSTRAINT "questions_reporting_reporting_id_fkey" FOREIGN KEY ("reporting_id") REFERENCES "reportings_mensuels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

