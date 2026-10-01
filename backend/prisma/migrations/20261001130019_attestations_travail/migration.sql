-- CreateTable
CREATE TABLE "demandes_attestation" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "demande_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivree_le" TIMESTAMP(3),
    "delivree_par_id" TEXT,
    "nom" TEXT,
    "cle" TEXT,

    CONSTRAINT "demandes_attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandes_attestation_dossier_id_idx" ON "demandes_attestation"("dossier_id");

-- AddForeignKey
ALTER TABLE "demandes_attestation" ADD CONSTRAINT "demandes_attestation_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossiers_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

