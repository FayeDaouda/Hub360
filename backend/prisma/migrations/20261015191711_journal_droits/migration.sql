-- CreateTable
CREATE TABLE "journal_droits" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "role_nom" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "avant" "NiveauPermission",
    "apres" "NiveauPermission" NOT NULL,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_droits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_droits_societe_id_created_at_idx" ON "journal_droits"("societe_id", "created_at");

-- AddForeignKey
ALTER TABLE "journal_droits" ADD CONSTRAINT "journal_droits_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

