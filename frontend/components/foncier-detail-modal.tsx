'use client';

import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import type { FichierItemFoncier } from '@/lib/types';

type Props = {
  libelle: string;
  fichiers: FichierItemFoncier[];
  onTelecharger: (fichier: FichierItemFoncier) => void;
  onClose: () => void;
};

// Popup « Détails » d'un item Foncier — historique complet des fichiers
// joints (un item peut en recevoir plusieurs dans le temps, ex. plusieurs
// versions du plan cadastral) — demande explicite du 2026-09-25. Pas de note
// ici contrairement à DetailItemModal (Permis/Exécution) : ItemFoncier n'a
// pas ce champ. Réutilise .permis-detail-fichiers (déjà générique malgré le
// nom) plutôt qu'une nouvelle feuille de style.
export function FoncierDetailModal({ libelle, fichiers, onTelecharger, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="foncier-detail-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="foncier-detail-titre">{libelle}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span className="field-label">Fichiers joints</span>
            {fichiers.length === 0 ? (
              <p className="permis-detail-vide">Aucun fichier — utilise « Ajouter » sur l’item.</p>
            ) : (
              <ul className="permis-detail-fichiers">
                {fichiers.map((f) => (
                  <li key={f.id}>
                    <a
                      href={f.url}
                      onClick={(e) => {
                        e.preventDefault();
                        onTelecharger(f);
                      }}
                      title={f.nom}
                    >
                      {f.estImage && <img src={f.url} alt="" />}
                      <span>{f.nom}</span>
                      <Download size={13} strokeWidth={2} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </label>
        </div>
      </div>
    </div>
  );
}
