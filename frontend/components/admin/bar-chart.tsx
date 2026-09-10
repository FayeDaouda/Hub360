import type { Histogramme } from '@/lib/types';

// Histogramme vertical, sans dépendance (CSS flex). Les hauteurs sont
// forcément inline : elles proviennent des données, pas d'une classe figée.
export function BarChart({ data }: { data: Histogramme }) {
  const max = Math.max(...data.points.map((p) => p.valeur), 1);

  return (
    <div className="barchart">
      <div className="barchart-bars">
        {data.points.map((point) => (
          <div className="barchart-col" key={point.libelle}>
            <span className="barchart-val">{point.valeur}</span>
            <div
              className={`barchart-bar${point.actif ? ' barchart-bar--actif' : ''}`}
              style={{ height: `${Math.max((point.valeur / max) * 100, 1.5)}%` }}
            />
            <span className="barchart-label">{point.libelle}</span>
          </div>
        ))}
      </div>
      <p className="barchart-unite">{data.unite}</p>
    </div>
  );
}
