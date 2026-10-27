'use client';

import { ChampsRemise, type SaisieRemise } from './champs-remise';

// Formulaire de dépôt d'une tâche — LE même depuis la liste « Mes tâches »
// (modale), « Mes performances » et le panneau de la tâche (lot F,
// 23/10/2026) : qui valide (nommé), fichiers (zone de dépôt, nom final),
// commentaire. Les boutons restent à l'appelant (modale ou panneau).
// Balisage en <span> : utilisable dans le message d'une ConfirmModal.
export function FormulaireDepot({
  id,
  nomDepot,
  validateur,
  parDepot,
  obligatoire,
  avertissement = false,
  valeur,
  onChange,
}: {
  id: string;
  // Base du nom des fichiers du prochain dépôt, fournie par le serveur.
  nomDepot: string;
  // « Cheikh Fall (Architecte DPLG) » ; null : personne n'est encore désigné.
  validateur: string | null;
  parDepot: boolean; // sans temps atelier : le dépôt du justificatif vaut validation
  obligatoire: boolean;
  // Rappel « plus de nouveau dépôt avant la réponse » (modale de la liste).
  avertissement?: boolean;
  valeur: SaisieRemise;
  onChange: (v: SaisieRemise) => void;
}) {
  return (
    <span className="depot">
      <span className="depot-message">
        {parDepot ? (
          'Le dépôt du justificatif vaut validation.'
        ) : (
          <>
            Part en validation chez <strong>{validateur ?? 'un validateur à désigner'}</strong>.
          </>
        )}
        {avertissement &&
          !parDepot &&
          ' Vous ne pourrez plus la déposer à nouveau tant qu’elle n’est pas validée ou renvoyée en reprise.'}
      </span>
      <ChampsRemise id={id} valeur={valeur} onChange={onChange} obligatoire={obligatoire} nomDepot={nomDepot} />
    </span>
  );
}
