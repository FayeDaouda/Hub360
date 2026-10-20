'use client';

import { useState } from 'react';
import { Camera, Paperclip, X } from 'lucide-react';
import { lireFichier } from '@/lib/fichiers';

// Nombre de fichiers par remise (même plafond que le serveur).
const MAX_PIECES = 5;

export type SaisieRemise = { pieces: { nom: string; url: string }[]; commentaire: string };
export const SAISIE_REMISE_VIDE: SaisieRemise = { pieces: [], commentaire: '' };

// Fichiers et commentaire d'une remise, tous deux facultatifs : une visite ou
// une réunion ne produit pas de fichier ; le valideur voit « sans fichier
// joint ». Balisage en <span> : utilisable dans le message d'une ConfirmModal.
export function ChampsRemise({ valeur, onChange, id }: { valeur: SaisieRemise; onChange: (v: SaisieRemise) => void; id: string }) {
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setErreur(null);
    try {
      const lus = await Promise.all([...fichiers].map((f) => lireFichier(f)));
      const pieces = [...valeur.pieces, ...lus.map(({ nom, url }) => ({ nom, url }))];
      if (pieces.length > MAX_PIECES) setErreur(`${MAX_PIECES} fichiers au plus par remise.`);
      onChange({ ...valeur, pieces: pieces.slice(0, MAX_PIECES) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    }
  }

  return (
    <span className="po-remise-champs">
      <span className="po-panneau-label">Fichiers (facultatif)</span>
      {/* Boutons du HUB plutôt que le champ natif (« Choose Files » selon la
          langue du navigateur) ; la photo n'apparaît que sur écran tactile. */}
      <span className="po-remise-boutons">
        <label className={`btn-ghost btn-ghost--sm po-remise-joindre${valeur.pieces.length >= MAX_PIECES ? ' is-desactive' : ''}`}>
          <Paperclip size={15} aria-hidden /> Joindre des fichiers
          <input
            id={`${id}-fichiers`}
            type="file"
            multiple
            className="sr-only"
            disabled={valeur.pieces.length >= MAX_PIECES}
            onChange={(e) => {
              void ajouter(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <label className={`btn-ghost btn-ghost--sm po-remise-photo${valeur.pieces.length >= MAX_PIECES ? ' is-desactive' : ''}`}>
          <Camera size={15} aria-hidden /> Prendre une photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={valeur.pieces.length >= MAX_PIECES}
            onChange={(e) => {
              void ajouter(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </span>
      {valeur.pieces.length === 0 && <span className="po-aide">Aucun fichier joint · {MAX_PIECES} au plus</span>}
      {valeur.pieces.length > 0 && (
        <span className="po-remise-fichiers">
          {valeur.pieces.map((f, i) => (
            <span key={`${f.nom}-${i}`} className="pill pill--neutre">
              {f.nom}
              <button
                type="button"
                className="po-remise-retirer"
                aria-label={`Retirer ${f.nom}`}
                onClick={() => onChange({ ...valeur, pieces: valeur.pieces.filter((_, j) => j !== i) })}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
        </span>
      )}
      {erreur && <span className="field-erreur">{erreur}</span>}
      <label className="po-panneau-label" htmlFor={`${id}-commentaire`}>
        Commentaire (facultatif)
      </label>
      <textarea
        id={`${id}-commentaire`}
        className="field-input"
        rows={2}
        maxLength={500}
        value={valeur.commentaire}
        onChange={(e) => onChange({ ...valeur, commentaire: e.target.value })}
      />
    </span>
  );
}

// Corps envoyé au serveur (commentaire vide omis).
export function corpsRemise(v: SaisieRemise) {
  const commentaire = v.commentaire.trim();
  return { pieces: v.pieces, ...(commentaire ? { commentaire } : {}) };
}
