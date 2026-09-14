-- Sous-checklists de l'avant-projet : passage de "clé fixe (enum)" à "item
-- libre par projet" pour permettre à l'admin d'ajouter/supprimer des items
-- selon le projet. `libelle` est backfillé depuis l'ancien mapping `cle` ->
-- texte (domaine/config.ts) avant de retirer l'enum.

-- 1) Nouvelles colonnes (libelle nullable le temps du backfill).
ALTER TABLE "lignes_checklist_avp" ADD COLUMN "libelle" TEXT;
ALTER TABLE "lignes_checklist_avp" ADD COLUMN "ordre" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "lignes_checklist_avp" ADD COLUMN "supprimee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "lignes_checklist_avp" ADD COLUMN "supprime_le" TIMESTAMP(3);
ALTER TABLE "lignes_checklist_avp" ADD COLUMN "supprime_par_id" TEXT;

-- 2) Backfill : libellé + ordre d'affichage d'origine, par ancienne clé.
UPDATE "lignes_checklist_avp" SET "libelle" = CASE "cle"
  WHEN 'prog_sous_sol' THEN 'Sous-sol (préciser le nombre de niveaux et les aménagements spécifiques)'
  WHEN 'prog_rdc' THEN 'Rez-de-chaussée (préciser les aménagements)'
  WHEN 'prog_etage_courant' THEN 'Étage courant (préciser le nombre de niveaux et les aménagements)'
  WHEN 'prog_terrasse' THEN 'Terrasse (préciser les aménagements et l''accessibilité)'
  WHEN 'prog_standing' THEN 'Standing (économique, moyen ou haut — préciser la différence)'
  WHEN 'prog_gamme' THEN 'Gamme (économique, moyen ou haut — préciser la différence)'
  WHEN 'prog_style' THEN 'Style (ex. moderne)'
  WHEN 'prog_autres_infos' THEN 'Autres informations importantes'
  WHEN 'visite_site' THEN 'Visite sur site'
  WHEN 'plans_terrain' THEN 'Plans (terrain)'
  WHEN 'assainissement' THEN 'Assainissement'
  WHEN 'eau' THEN 'Eau'
  WHEN 'electricite' THEN 'Électricité'
  WHEN 'telephone' THEN 'Téléphone'
  WHEN 'photos_videos' THEN 'Photos et vidéos'
  WHEN 'autres_infos' THEN 'Autres informations'
  WHEN 'plans_cotes' THEN 'Plans avec cotations'
  WHEN 'devis_descriptif' THEN 'Devis descriptif'
  WHEN 'plaquettes_commerciales' THEN 'Plaquettes commerciales'
  WHEN 'dwg_pln' THEN 'DWG (AutoCAD) / PLN (Archicad)'
  WHEN 'skp' THEN 'SKP (SketchUp)'
  WHEN 'source_rendus' THEN 'Fichier source des rendus'
  WHEN 'esquisses' THEN 'Esquisses'
  WHEN 'plans_complets' THEN 'Plans complets (niveaux, axes, superficies, SHOB, plan de masse, coupes)'
  WHEN 'images_3d_facade' THEN 'Images 3D façade (face, gauche, droite, contre-plongée)'
  WHEN 'details_livrables' THEN 'Détails façade / cuisine / salle de bain / escaliers'
  WHEN 'emplacement_gaines' THEN 'Emplacement gaines & locaux techniques (SEN''EAU, SENELEC)'
  WHEN 'validation_client' THEN 'Validation client (email + bon pour accord)'
  WHEN 'mood_board' THEN 'Mood board (matériaux, ambiances)'
END;

UPDATE "lignes_checklist_avp" SET "ordre" = CASE "cle"
  WHEN 'prog_sous_sol' THEN 0
  WHEN 'prog_rdc' THEN 1
  WHEN 'prog_etage_courant' THEN 2
  WHEN 'prog_terrasse' THEN 3
  WHEN 'prog_standing' THEN 4
  WHEN 'prog_gamme' THEN 5
  WHEN 'prog_style' THEN 6
  WHEN 'prog_autres_infos' THEN 7
  WHEN 'visite_site' THEN 0
  WHEN 'plans_terrain' THEN 1
  WHEN 'assainissement' THEN 2
  WHEN 'eau' THEN 3
  WHEN 'electricite' THEN 4
  WHEN 'telephone' THEN 5
  WHEN 'photos_videos' THEN 6
  WHEN 'autres_infos' THEN 7
  WHEN 'plans_cotes' THEN 0
  WHEN 'devis_descriptif' THEN 1
  WHEN 'plaquettes_commerciales' THEN 2
  WHEN 'dwg_pln' THEN 0
  WHEN 'skp' THEN 1
  WHEN 'source_rendus' THEN 2
  WHEN 'esquisses' THEN 0
  WHEN 'plans_complets' THEN 1
  WHEN 'images_3d_facade' THEN 2
  WHEN 'details_livrables' THEN 3
  WHEN 'emplacement_gaines' THEN 4
  WHEN 'validation_client' THEN 5
  WHEN 'mood_board' THEN 6
END;

-- 3) libelle est backfillé pour toutes les lignes existantes : rendre requis.
ALTER TABLE "lignes_checklist_avp" ALTER COLUMN "libelle" SET NOT NULL;

-- 4) Retrait de l'ancien verrou par clé fixe (devenu incompatible avec des
--    items libres/ajoutés par l'admin).
DROP INDEX "lignes_checklist_avp_avant_projet_id_cle_key";
ALTER TABLE "lignes_checklist_avp" DROP COLUMN "cle";
DROP TYPE "CleChecklistAvp";

-- 5) Traçabilité de la suppression (soft-delete), comme ImageProjet/FichierProjet.
ALTER TABLE "lignes_checklist_avp" ADD CONSTRAINT "lignes_checklist_avp_supprime_par_id_fkey" FOREIGN KEY ("supprime_par_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
