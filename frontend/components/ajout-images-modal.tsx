'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { TYPES_PHOTO_IMAGE, type TypePhotoImage } from '@/lib/types';

type Props = {
  nbFichiers: number;
  onConfirmer: (typePhoto: TypePhotoImage) => void | Promise<void>;
  onClose: () => void;
};

// Popup déclenchée après le choix des fichiers (avant l'upload) — le type de
// photo devient une étape obligatoire du geste d'ajout, plutôt qu'un réglage
// à côté qu'on oublie et qu'on doit rattraper après coup en rouvrant chaque
// image (demande explicite du 2026-09-17 : « c'est pas pro »).
export function AjoutImagesModal({ nbFichiers, onConfirmer, onClose }: Props) {
  const [typePhoto, setTypePhoto] = useState<TypePhotoImage | ''>('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enCours]);

  async function lancer() {
    if (!typePhoto) return;
    setEnCours(true);
    await onConfirmer(typePhoto);
  }

  return (
    <div className="modal-backdrop" onClick={() => !enCours && onClose()}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ajout-images-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="ajout-images-titre">
            Ajouter {nbFichiers} photo{nbFichiers > 1 ? 's' : ''}
          </h2>
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
            <span className="field-label">Type de photo</span>
            <select
              className="field-input"
              value={typePhoto}
              onChange={(e) =>
                setTypePhoto(e.target.value as TypePhotoImage | '')
              }
              autoFocus
            >
              <option value="" disabled>
                Choisir…
              </option>
              {(Object.keys(TYPES_PHOTO_IMAGE) as TypePhotoImage[]).map((t) => (
                <option key={t} value={t}>
                  {TYPES_PHOTO_IMAGE[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={enCours}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={lancer}
              disabled={enCours || !typePhoto}
            >
              {enCours ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
