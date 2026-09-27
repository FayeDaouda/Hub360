'use client';

import { useEffect, useRef, useState } from 'react';
import type { Histogramme } from '@/lib/types';

// Courbe lissée + aire, sans dépendance (SVG + interpolation cubique
// monotone faite main — pas de d3). Monotone plutôt que Catmull-Rom : avec
// des données creuses (des mois à 0 puis un pic), une spline classique
// « dépasse » sous la ligne de base juste avant le pic — la monotone garantit
// qu'on ne dépasse jamais la valeur des points voisins.
function cheminMonotone(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return '';
  if (n === 1) return `M ${xs[0]} ${ys[0]}`;

  const dx: number[] = [];
  const pente: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    pente[i] = (ys[i + 1] - ys[i]) / dx[i];
  }

  const tangente: number[] = [pente[0]];
  for (let i = 1; i < n - 1; i++) {
    tangente[i] = pente[i - 1] * pente[i] <= 0 ? 0 : (pente[i - 1] + pente[i]) / 2;
  }
  tangente[n - 1] = pente[n - 2];

  // Limiteur de Fritsch-Carlson : ramène les tangentes dans la zone qui
  // garantit la monotonie du segment (pas de dépassement local).
  for (let i = 0; i < n - 1; i++) {
    if (pente[i] === 0) {
      tangente[i] = 0;
      tangente[i + 1] = 0;
      continue;
    }
    const a = tangente[i] / pente[i];
    const b = tangente[i + 1] / pente[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangente[i] = t * a * pente[i];
      tangente[i + 1] = t * b * pente[i];
    }
  }

  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const cp1x = xs[i] + h / 3;
    const cp1y = ys[i] + (tangente[i] * h) / 3;
    const cp2x = xs[i + 1] - h / 3;
    const cp2y = ys[i + 1] - (tangente[i + 1] * h) / 3;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${xs[i + 1]} ${ys[i + 1]}`;
  }
  return d;
}

const HAUTEUR = 190;
const MARGE_HAUT = 28; // laisse la place à l'étiquette de valeur au-dessus du point actif
const MARGE_BAS = 10;
// Marge horizontale : l'étiquette (bulle centrée sur le point) déborderait du
// panneau si le premier/dernier point touchait le bord — vu en mobile étroit.
const MARGE_X = 36;

export function AreaChart({ data }: { data: Histogramme }) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(600);
  const [survol, setSurvol] = useState<number | null>(null);

  useEffect(() => {
    const el = conteneurRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setLargeur(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (data.points.length === 0) {
    return <p className="barchart-vide">Pas de données sur la période.</p>;
  }

  const n = data.points.length;
  const max = Math.max(...data.points.map((p) => p.valeur), 1);
  const largeurUtile = Math.max(largeur - 2 * MARGE_X, 0);
  const pasX = n > 1 ? largeurUtile / (n - 1) : 0;
  const xs = data.points.map((_, i) => (n > 1 ? MARGE_X + i * pasX : largeur / 2));
  const ys = data.points.map((p) => {
    const zoneUtile = HAUTEUR - MARGE_HAUT - MARGE_BAS;
    return MARGE_HAUT + zoneUtile * (1 - p.valeur / max);
  });

  const ligne = cheminMonotone(xs, ys);
  const aire = `${ligne} L ${xs[n - 1]} ${HAUTEUR - MARGE_BAS} L ${xs[0]} ${HAUTEUR - MARGE_BAS} Z`;

  const indexActif = data.points.findIndex((p) => p.actif);
  const indexEtiquette = survol ?? (indexActif >= 0 ? indexActif : n - 1);
  const pointEtiquette = data.points[indexEtiquette];

  return (
    <div className="areachart">
      <div className="areachart-plot" ref={conteneurRef} style={{ height: HAUTEUR }}>
        <svg
          className="areachart-svg"
          width="100%"
          height={HAUTEUR}
          viewBox={`0 0 ${largeur} ${HAUTEUR}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="areachart-degrade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--argile)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--argile)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={aire} fill="url(#areachart-degrade)" />
          <path d={ligne} className="areachart-ligne" />
          {survol !== null && (
            <line
              className="areachart-mire"
              x1={xs[survol]}
              x2={xs[survol]}
              y1={MARGE_HAUT - 12}
              y2={HAUTEUR - MARGE_BAS}
            />
          )}
          <circle
            className="areachart-point"
            cx={xs[indexEtiquette]}
            cy={ys[indexEtiquette]}
            r={5}
          />
        </svg>

        {/* Cible de survol/focus par mois — plus large que le trait pour rester
            facile à viser (au clavier comme à la souris). */}
        <div className="areachart-cibles">
          {data.points.map((point, i) => (
            <button
              key={point.libelle}
              type="button"
              className="areachart-cible"
              onMouseEnter={() => setSurvol(i)}
              onFocus={() => setSurvol(i)}
              onMouseLeave={() => setSurvol(null)}
              onBlur={() => setSurvol(null)}
              aria-label={`${point.libelle} : ${point.valeur} ${data.unite}`}
            />
          ))}
        </div>

        <div
          className={`areachart-etiquette${survol === null ? ' areachart-etiquette--fixe' : ''}`}
          style={{
            left: xs[indexEtiquette],
            top: ys[indexEtiquette],
          }}
        >
          <strong>{pointEtiquette.valeur}</strong>
          <span>{pointEtiquette.libelle}</span>
        </div>
      </div>

      <div className="areachart-labels">
        {data.points.map((point, i) => (
          <span
            key={point.libelle}
            className={`areachart-label${i === indexEtiquette ? ' areachart-label--actif' : ''}`}
          >
            {point.libelle}
          </span>
        ))}
      </div>
      <p className="barchart-unite">{data.unite}</p>
    </div>
  );
}
