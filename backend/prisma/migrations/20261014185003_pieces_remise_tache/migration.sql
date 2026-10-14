-- CreateTable
CREATE TABLE "pieces_remise_tache" (
    "id" TEXT NOT NULL,
    "tache_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "ajoute_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_remise_tache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pieces_remise_tache_tache_id_version_idx" ON "pieces_remise_tache"("tache_id", "version");

-- AddForeignKey
ALTER TABLE "pieces_remise_tache" ADD CONSTRAINT "pieces_remise_tache_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "taches_projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

