-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('projet_assigne', 'phase_changee');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "destinataire_id" TEXT NOT NULL,
    "societe_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "projet_id" TEXT,
    "titre" TEXT NOT NULL,
    "par_id" TEXT,
    "lu_le" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_destinataire_id_lu_le_idx" ON "notifications"("destinataire_id", "lu_le");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_destinataire_id_fkey" FOREIGN KEY ("destinataire_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_projet_id_fkey" FOREIGN KEY ("projet_id") REFERENCES "projets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
