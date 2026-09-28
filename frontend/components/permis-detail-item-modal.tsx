'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Fichier rattaché à un item — même forme pour FichierLigneChecklistPermis et
// FichierLigneChecklistExecution (cf. lib/types.ts), typé structurellement
// ici pour rester réutilisable entre les deux modules sans import croisé.
type FichierLigne = { id: string; nom: string; url: string; estImage: boolean; ajouteLe: string };

type Props = {
  libelle: string;
  noteInitiale: string;
  fichiers: FichierLigne[];
  onEnregistrerNote: (note: string) => Promise<void>;
  onClose: () => void;
  // Rôle en lecture seule sur le projet : note consultable, pas modifiable.
  lectureSeule?: boolean;
};

// Détail d'un item de checklist (Permis / Exécution) — remplace le champ note
// affiché en permanence dans la liste (trop de bruit sur 25+ lignes) : la
// note et les fichiers déjà joints vivent ici, ouverts à la demande (demande
// explicite du 2026-09-17). L'upload lui-même reste sur le bouton « Joindre »
// de la ligne.
export function DetailItemModal({
  libelle,
  noteInitiale,
  fichiers,
  onEnregistrerNote,
  lectureSeule = false,
  onClose,
}: Props) {
  const [note, setNote] = useState(noteInitiale);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enCours]);

  async function enregistrer() {
    if (note === noteInitiale) {
      onClose();
      return;
    }
    setEnCours(true);
    try {
      await onEnregistrerNote(note);
      onClose();
    } catch {
      setEnCours(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !enCours && onClose()}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-item-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="detail-item-titre">{libelle}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
            disabled={enCours}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span className="field-label">Fichiers joints</span>
            {fichiers.length === 0 ? (
              <p className="permis-detail-vide">Aucun fichier — utilise « Joindre » sur la ligne.</p>
            ) : (
              <ul className="permis-detail-fichiers">
                {fichiers.map((f) => (
                  <li key={f.id}>
                    <a href={f.url} target="_blank" rel="noreferrer" title={f.nom}>
                      {f.estImage && <img src={f.url} alt="" />}
                      <span>{f.nom}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </label>

          <label className="field">
            <span className="field-label">Note (optionnel)</span>
            <textarea
              className="field-input"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={lectureSeule ? '' : 'Précision, motif, contexte…'}
              readOnly={lectureSeule}
              autoFocus={!lectureSeule}
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
              {lectureSeule ? 'Fermer' : 'Annuler'}
            </button>
            {!lectureSeule && (
              <button type="button" className="btn-primary" onClick={enregistrer} disabled={enCours}>
                {enCours ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
