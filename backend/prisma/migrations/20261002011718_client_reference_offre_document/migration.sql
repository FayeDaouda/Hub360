-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "adresse" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "numero" INTEGER;

-- AlterTable
ALTER TABLE "devis" ADD COLUMN     "delais_echeancier" JSONB,
ADD COLUMN     "message_introduction" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clients_societe_id_numero_key" ON "clients"("societe_id", "numero");


-- Clients existants : référence attribuée dans l'ordre de création, par société.
UPDATE "clients" c SET "numero" = r.rang
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY "societe_id" ORDER BY "created_at", id) AS rang FROM "clients") r
WHERE c.id = r.id;
