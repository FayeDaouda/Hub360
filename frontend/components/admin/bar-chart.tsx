import type { Histogramme } from '@/lib/types';

// Histogramme vertical, sans dépendance (CSS flex). Les hauteurs sont
// forcément inline : elles proviennent des données, pas d'une classe figée.
export function BarChart({ data }: { data: Histogramme }) {
  if (data.points.length === 0) {
    return <p className="barchart-vide">Pas de données sur la période.</p>;
  }

  const max = Math.max(...data.points.map((p) => p.valeur), 1);

  return (
    <div className="barchart">
      <div className="barchart-bars">
        {data.points.map((point) => {
          const vide = point.valeur === 0;
          return (
            <div className="barchart-col" key={point.libelle}>
              <span className={`barchart-val${vide ? ' barchart-val--vide' : ''}`}>
                {point.valeur}
              </span>
              <div
                className={`barchart-bar${point.actif ? ' barchart-bar--actif' : ''}${
                  vide ? ' barchart-bar--vide' : ''
                }`}
                style={{ height: `${Math.max((point.valeur / max) * 100, 2)}%` }}
              />
              <span className="barchart-label">{point.libelle}</span>
            </div>
          );
        })}
      </div>
      <p className="barchart-unite">{data.unite}</p>
    </div>
  );
}
