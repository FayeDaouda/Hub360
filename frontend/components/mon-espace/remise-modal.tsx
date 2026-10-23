'use client';

import { useState } from 'react';
import { remettreTache } from '@/lib/mon-espace';
import type { CorpsRemise } from '@/lib/projets-ouverts';
import type { StatsPerformances, TacheMonEspace } from '@/lib/types';
import { ConfirmModal } from '@/components/admin/confirm-modal';
import { corpsRemise, depotPret, SAISIE_REMISE_VIDE, type SaisieRemise } from '@/components/projets-ouverts/champs-remise';
import { FormulaireDepot } from '@/components/projets-ouverts/formulaire-depot';

type MesTaches = { taches: TacheMonEspace[]; stats: StatsPerformances };

// Remise d'une tâche au N+1 — même formulaire (FormulaireDepot) depuis « Mes
// tâches », « Mon espace › Mes performances » et le panneau de la tâche.
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
          <span className="depot-tache">
            « {tache.libelle} » · {tache.projetCode}
          </span>
          <FormulaireDepot
            id={`remise-${tache.id}`}
            nommage={{ code: tache.projetCode, etapeNumero: tache.etapeNumero, tache: tache.libelle, version: tache.version + 1 }}
            validateur={tache.validateur}
            parDepot={tache.parDepot}
            obligatoire={tache.fichierObligatoire}
            avertissement
            valeur={saisie}
            onChange={setSaisie}
          />
        </>
      }
      confirmer="Déposer"
      confirmerDesactive={!depotPret(saisie, tache.fichierObligatoire)}
      onConfirm={async () => {
        if (onEnvoyer) onEnvoyer(corpsRemise(saisie));
        else onRemise?.(await remettreTache(slug, tache, corpsRemise(saisie)));
        onClose(); // ConfirmModal ne se ferme pas seule après succès
      }}
      onClose={onClose}
    />
  );
}
