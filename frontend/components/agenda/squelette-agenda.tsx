// Premier chargement de l'Agenda (U5, 23/11/2026) : la forme de la grille
// (en-tête des jours, lignes des heures, quelques blocs) plutôt qu'un bloc
// gris — la page ne « saute » pas quand les rendez-vous arrivent.
const BLOCS = [
  { col: 1, haut: 1, h: 2 },
  { col: 2, haut: 3, h: 1 },
  { col: 4, haut: 0, h: 3 },
  { col: 5, haut: 4, h: 2 },
  { col: 6, haut: 2, h: 1 },
];

export function SqueletteAgenda() {
  return (
    <div className="agenda-squelette" role="status">
      <span className="sr-only">Chargement de l’agenda…</span>
      <div className="agenda-squelette-tete" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="agenda-squelette-corps" aria-hidden>
        {BLOCS.map((b, i) => (
          <span
            key={i}
            className="agenda-squelette-bloc"
            style={{ gridColumn: b.col + 1, gridRow: `${b.haut + 1} / span ${b.h}` }}
          />
        ))}
      </div>
    </div>
  );
}
