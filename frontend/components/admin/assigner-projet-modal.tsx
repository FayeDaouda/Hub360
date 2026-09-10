'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { assignerProjet } from '@/lib/projets';
import { NIVEAUX_COLLABORATEUR, type Cellule, type ProjetExecution } from '@/lib/types';

type Props = {
  slug: string;
  projet: ProjetExecution;
  cellules: Cellule[];
  onClose: () => void;
  onAssigne: (projet: ProjetExecution) => void;
};

export function AssignerProjetModal({ slug, projet, cellules, onClose, onAssigne }: Props) {
  const [choix, setChoix] = useState<string>(projet.celluleAssignee ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function enregistrer() {
    setErreur(null);
    setEnvoi(true);
    try {
      const maj = await assignerProjet(slug, projet.id, choix || null);
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
            {projet.programme} · une seule cellule prend en charge ce projet.
          </p>

          <ul className="assign-liste">
            {cellules.map((cel) => {
              const actif = choix === cel.id;
              return (
                <li key={cel.id} className={`assign-groupe${actif ? ' is-coche' : ''}`}>
                  <label className="assign-groupe-tete">
                    <input
                      type="radio"
                      name="cellule"
                      checked={actif}
                      onChange={() => setChoix(cel.id)}
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

          {projet.celluleAssignee && (
            <button
              type="button"
              className="assign-retirer"
              onClick={() => setChoix('')}
              disabled={choix === ''}
            >
              Retirer l&rsquo;assignation
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
