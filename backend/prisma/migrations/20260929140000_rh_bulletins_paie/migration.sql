-- CreateTable
CREATE TABLE "bulletins_paie" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "mois" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "depose_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletins_paie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_paie_dossier_id_mois_key" ON "bulletins_paie"("dossier_id", "mois");

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

