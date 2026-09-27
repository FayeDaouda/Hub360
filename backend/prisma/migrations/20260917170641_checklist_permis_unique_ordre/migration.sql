-- AddUniqueConstraint (empêche le double-amorçage du gabarit sur requêtes concurrentes)
CREATE UNIQUE INDEX "lignes_checklist_permis_permis_id_groupe_ordre_key" ON "lignes_checklist_permis"("permis_id", "groupe", "ordre");
