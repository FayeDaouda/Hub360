-- CreateTable
CREATE TABLE "blocs_unbord" (
    "projet_id" TEXT NOT NULL,
    "groupe" "GroupeUnbord" NOT NULL,
    "responsable_id" TEXT,

    CONSTRAINT "blocs_unbord_pkey" PRIMARY KEY ("projet_id","groupe")
);

-- AddForeignKey
ALTER TABLE "blocs_unbord" ADD CONSTRAINT "blocs_unbord_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs_unbord" ADD CONSTRAINT "blocs_unbord_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "collaborateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

