-- Verrou d'émission des factures (ADR 0003) : une ligne par société et par
-- année, mise à jour en tête de chaque transaction d'émission pour les
-- sérialiser. Les lignes sont créées à la première émission de l'année.
-- CreateTable
CREATE TABLE "verrous_numerotation" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "derniere_emission_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verrous_numerotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verrous_numerotation_societe_id_annee_key" ON "verrous_numerotation"("societe_id", "annee");

-- AddForeignKey
ALTER TABLE "verrous_numerotation" ADD CONSTRAINT "verrous_numerotation_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

