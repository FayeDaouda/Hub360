'use client';

import { useState } from 'react';
import { remettreTache } from '@/lib/mon-espace';
import type { CorpsRemise } from '@/lib/projets-ouverts';
import type { StatsPerformances, TacheMonEspace } from '@/lib/types';
import { ConfirmModal } from '@/components/admin/confirm-modal';
import { ChampsRemise, corpsRemise, SAISIE_REMISE_VIDE, type SaisieRemise } from '@/components/projets-ouverts/champs-remise';

type MesTaches = { taches: TacheMonEspace[]; stats: StatsPerformances };

// Remise d'une tâche au N+1 (fichiers et commentaire facultatifs) — même
// fenêtre depuis « Mes tâches » et « Mon espace › Mes performances ».
// Deux modes : envoi immédiat (onRemise reçoit la réponse), ou envoi confié à
// l'appelant (onEnvoyer reçoit le corps — « Mes tâches » le diffère de
// quelques secondes pour proposer « Annuler »).
export function RemiseModal({
  slug,
  tache,
  piecesInitiales,
  onRemise,
  onEnvoyer,
  onClose,
}: {
  slug: string;
  tache: TacheMonEspace;
  // Fichiers glissés sur la ligne de la tâche (« Mes tâches »).
  piecesInitiales?: SaisieRemise['pieces'];
  onRemise?: (r: MesTaches) => void;
  onEnvoyer?: (corps: CorpsRemise) => void;
  onClose: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieRemise>({ ...SAISIE_REMISE_VIDE, pieces: piecesInitiales ?? [] });
  return (
    <ConfirmModal
      titre="Déposer la tâche"
      message={
        <>
          « {tache.libelle} » ({tache.projetCode}) part en validation chez votre chef de team (ou l’Architecte DPLG). Vous ne pourrez
          plus la déposer à nouveau tant qu’elle n’est pas validée ou renvoyée en reprise.
          <ChampsRemise id={`remise-${tache.id}`} valeur={saisie} onChange={setSaisie} />
        </>
      }
      confirmer="Déposer"
      onConfirm={async () => {
        if (onEnvoyer) onEnvoyer(corpsRemise(saisie));
        else onRemise?.(await remettreTache(slug, tache, corpsRemise(saisie)));
        onClose(); // ConfirmModal ne se ferme pas seule après succès
      }}
      onClose={onClose}
    />
  );
}
