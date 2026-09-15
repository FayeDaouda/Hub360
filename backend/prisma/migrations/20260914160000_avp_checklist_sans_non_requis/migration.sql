-- Retrait du statut "non requis" (N/A) sur les items de checklist
-- avant-projet : un item qui ne concerne pas un projet se supprime
-- désormais (l'admin peut retirer une ligne, sept. 2026) plutôt que de
-- rester coché "non applicable" — une seule façon de dire "ne compte pas".
ALTER TABLE "lignes_checklist_avp" DROP COLUMN "non_requis";
