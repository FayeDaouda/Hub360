-- CreateEnum
CREATE TYPE "ActionPaie" AS ENUM ('salaire_consulte', 'salaire_modifie', 'bulletin_consulte', 'bulletin_depose', 'bulletin_retire');

-- CreateTable
CREATE TABLE "journal_paie" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "action" "ActionPaie" NOT NULL,
    "mois" TEXT,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_paie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_paie_dossier_id_created_at_idx" ON "journal_paie"("dossier_id", "created_at");

-- CreateIndex
CREATE INDEX "journal_paie_created_at_idx" ON "journal_paie"("created_at");

-- AddForeignKey
ALTER TABLE "journal_paie" ADD CONSTRAINT "journal_paie_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

