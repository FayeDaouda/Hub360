-- CreateEnum
CREATE TYPE "TypeCanal" AS ENUM ('cellule', 'general', 'direct');

-- CreateTable
CREATE TABLE "canaux" (
    "id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "type" "TypeCanal" NOT NULL,
    "cellule_id" TEXT,
    "participant1_id" TEXT,
    "participant2_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canaux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "canal_id" TEXT NOT NULL,
    "auteur_id" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectures_canal" (
    "utilisateur_id" TEXT NOT NULL,
    "canal_id" TEXT NOT NULL,
    "dernier_lu_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lectures_canal_pkey" PRIMARY KEY ("utilisateur_id","canal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canaux_cellule_id_key" ON "canaux"("cellule_id");

-- CreateIndex
CREATE UNIQUE INDEX "canaux_participant1_id_participant2_id_key" ON "canaux"("participant1_id", "participant2_id");

-- CreateIndex
CREATE INDEX "messages_canal_id_created_at_idx" ON "messages"("canal_id", "created_at");

-- AddForeignKey
ALTER TABLE "canaux" ADD CONSTRAINT "canaux_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canaux" ADD CONSTRAINT "canaux_cellule_id_fkey" FOREIGN KEY ("cellule_id") REFERENCES "cellules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canaux" ADD CONSTRAINT "canaux_participant1_id_fkey" FOREIGN KEY ("participant1_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canaux" ADD CONSTRAINT "canaux_participant2_id_fkey" FOREIGN KEY ("participant2_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canaux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures_canal" ADD CONSTRAINT "lectures_canal_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures_canal" ADD CONSTRAINT "lectures_canal_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canaux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (partiel — un seul canal Général par société ; Prisma ne gère pas
-- les index partiels dans le schéma, posé ici à la main)
CREATE UNIQUE INDEX "canaux_general_par_societe_key" ON "canaux" ("societe_id") WHERE "type" = 'general';
