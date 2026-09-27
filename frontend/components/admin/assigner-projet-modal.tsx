'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { assignerCellules } from '@/lib/projets';
import { NIVEAUX_COLLABORATEUR, type Cellule, type ProjetExecution } from '@/lib/types';

type Props = {
  slug: string;
  projet: ProjetExecution;
  cellules: Cellule[];
  onClose: () => void;
  onAssigne: (projet: ProjetExecution) => void;
};

export function AssignerProjetModal({ slug, projet, cellules, onClose, onAssigne }: Props) {
  const [choix, setChoix] = useState<Set<string>>(new Set(projet.cellules));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function basculer(celluleId: string) {
    setChoix((actuel) => {
      const suivant = new Set(actuel);
      if (suivant.has(celluleId)) suivant.delete(celluleId);
      else suivant.add(celluleId);
      return suivant;
    });
  }

  async function enregistrer() {
    setErreur(null);
    setEnvoi(true);
    try {
      const maj = await assignerCellules(slug, projet.id, [...choix]);
      onAssigne(maj);
      onClose();
    } catch {
      setErreur("L'assignation a échoué. Réessaie.");
      setEnvoi(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="assign-titre">Assigner — {projet.code}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          <p className="assign-intro">
            {projet.programme} · une ou plusieurs cellules peuvent prendre en charge ce projet.
          </p>

          <ul className="assign-liste">
            {cellules.map((cel) => {
              const actif = choix.has(cel.id);
              return (
                <li key={cel.id} className={`assign-groupe${actif ? ' is-coche' : ''}`}>
                  <label className="assign-groupe-tete">
                    <input
                      type="checkbox"
                      checked={actif}
                      onChange={() => basculer(cel.id)}
                    />
                    <span className="assign-groupe-nom">{cel.nom}</span>
                    <span className="assign-groupe-compte">
                      {cel.collaborateurs.length} pers.
                    </span>
                  </label>
                  <ul className="assign-collabs">
                    {cel.collaborateurs.map((c) => (
                      <li key={c.id}>
                        <span className="assign-collab-nom">
                          {c.prenom} {c.nom}
                        </span>
                        <span className="assign-collab-role">
                          {c.role} · {NIVEAUX_COLLABORATEUR[c.niveau]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          {choix.size > 0 && (
            <button
              type="button"
              className="assign-retirer"
              onClick={() => setChoix(new Set())}
            >
              Retirer toutes les assignations
            </button>
          )}

          {erreur && <p className="field-erreur">{erreur}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={enregistrer} disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
