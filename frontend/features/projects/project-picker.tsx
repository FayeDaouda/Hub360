import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';
import type { OpenProjectSummary, OpenProjectsBoard } from './types';

type Props = {
  board: OpenProjectsBoard | null;
  projectId: string | null;
  onSelect: (id: string) => void;
  // Moins de 3 projets : un sélecteur en ligne, le dossier prend la largeur.
  compact: boolean;
};

// État d'un projet dans la liste : livraison dépassée, retards, ou dans les délais.
function ProjectHealth({ project: p }: { project: OpenProjectSummary }) {
  return (
    <Pill className={`pill--${p.livraisonDepassee || p.enRetard ? 'risque' : 'succes'}`}>
      {p.livraisonDepassee ? 'Livraison dépassée' : p.enRetard ? `${p.enRetard} en retard` : 'Dans les délais'}
    </Pill>
  );
}

// Projets ouverts : liste (colonne de gauche) ou sélecteur en ligne.
export function ProjectPicker({ board, projectId, onSelect, compact }: Props) {
  if (compact && board) {
    return (
      <div className="po-projets-ligne" role="group" aria-label="Projets ouverts">
        {board.projets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`po-projet po-projet--ligne${p.id === projectId ? ' is-actif' : ''}`}
            aria-pressed={p.id === projectId}
            onClick={() => onSelect(p.id)}
          >
            <span className="po-code">{p.code}</span>
            <span className="po-projet-client">{p.client}</span>
            <ProjectHealth project={p} />
          </button>
        ))}
      </div>
    );
  }
  return (
    <section className="panel glass-panel po-liste" aria-label="Projets ouverts">
      <h2 className="po-liste-titre">Projets ouverts</h2>
      {!board ? (
        <Skeleton />
      ) : (
        <ul>
          {board.projets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`po-projet${p.id === projectId ? ' is-actif' : ''}`}
                aria-pressed={p.id === projectId}
                onClick={() => onSelect(p.id)}
              >
                <span className="po-projet-tete">
                  <span className="po-code">{p.code}</span>
                  <ProjectHealth project={p} />
                </span>
                <span className="po-projet-client">{p.client}</span>
                <span className="po-barre" aria-hidden>
                  <span style={{ width: `${p.total ? Math.round((p.faites / p.total) * 100) : 0}%` }} />
                </span>
                <span className="po-aide">
                  {p.cellule ?? 'Cellule à assigner'} · J{p.jour} / {p.horizon} · {p.faites}/{p.total} tâches
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
