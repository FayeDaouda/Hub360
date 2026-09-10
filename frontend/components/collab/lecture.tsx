import type { ReactNode } from 'react';

// Primitives d'affichage lecture seule pour les sections projet côté
// collaborateur. Présentation (libellés + valeurs), jamais de formulaire.
// Consomment les mêmes lib/* que l'admin — GET autorisé par AccesProjetGuard
// pour les projets suivis par la cellule.

export function BlocLecture({
  titre,
  aside,
  children,
}: {
  titre: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="lecture-tete">
        <h3 className="panel-title" style={{ margin: 0 }}>
          {titre}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Champs({ children }: { children: ReactNode }) {
  return <dl className="lecture-champs">{children}</dl>;
}

export function Champ({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  const vide = children == null || children === '';
  return (
    <div className="lecture-champ">
      <dt>{label}</dt>
      <dd>{vide ? '—' : children}</dd>
    </div>
  );
}

export function Coche({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`lecture-coche${ok ? ' is-ok' : ''}`}>
      <span aria-hidden>{ok ? '✓' : '○'}</span>
      {children}
    </span>
  );
}

export function ListeCoches({ children }: { children: ReactNode }) {
  return <div className="lecture-coches">{children}</div>;
}

// Journal / fil d'événements (permis, chantier).
export function Journal({
  entrees,
}: {
  entrees: { id: string; date: string; texte: string; auteur: string }[];
}) {
  if (entrees.length === 0) {
    return <p className="empty-state">Aucune entrée.</p>;
  }
  return (
    <ul className="lecture-journal">
      {entrees.map((e) => (
        <li key={e.id}>
          <span className="lecture-journal-date">
            {new Date(e.date).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
          <span className="lecture-journal-txt">{e.texte}</span>
          <span className="lecture-journal-auteur">{e.auteur}</span>
        </li>
      ))}
    </ul>
  );
}
