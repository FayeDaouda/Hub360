-- Dispatcher par cellule (décision boss, sept. 2026) : un collaborateur
-- désigné par l'admin, habilité à répartir les tâches à ses coéquipiers.
-- Additive — aucune donnée existante à migrer.

-- AlterTable
ALTER TABLE "cellules" ADD COLUMN     "dispatcher_id" TEXT;

-- AddForeignKey
ALTER TABLE "cellules" ADD CONSTRAINT "cellules_dispatcher_id_fkey" FOREIGN KEY ("dispatcher_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
