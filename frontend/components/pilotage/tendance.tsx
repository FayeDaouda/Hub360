import type { IndicateurPilotage } from '@/lib/types';
import { formatMonthYear } from '@/lib/dates';

const L = 240; // largeur du tracé (viewBox)
const H = 64;
const MARGE = { haut: 8, bas: 16, cote: 6 };
const moisCourt = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }).replace('.', '');

// Courbe des 6 derniers mois d'un indicateur : une série (pas de légende, le
// titre de la carte la nomme), objectif en repère discret (ligne ou zone),
// dernier point marqué et chiffré ; chaque point garde sa valeur au survol.
// Le mois en cours est partiel : pointillé jusqu'à lui.
export function Tendance({ indicateur: i, unite }: { indicateur: IndicateurPilotage; unite: string }) {
  const points = i.tendance ?? [];
  const valeurs = points.map((p) => p.valeur).filter((v): v is number => v !== null);
  if (valeurs.length < 2) return null;
  const o = i.objectif;
  const reperes = o ? (o.type === 'zone' ? [o.de, o.a] : [o.valeur]).filter((v): v is number => v !== null) : [];
  const haut = Math.max(...valeurs, ...reperes, unite === '%' ? 100 : 1) * 1.1;
  const x = (k: number) => MARGE.cote + (k * (L - 2 * MARGE.cote)) / (points.length - 1);
  const y = (v: number) => MARGE.haut + (1 - v / haut) * (H - MARGE.haut - MARGE.bas);
  const definis = points
    .map((p, k) => ({ ...p, k }))
    .filter((p): p is { mois: string; valeur: number; k: number } => p.valeur !== null);
  const dernier = definis[definis.length - 1];
  // Segments clos en trait plein ; le dernier (vers le mois en cours) en pointillé.
  const trace = (pts: typeof definis) =>
    pts.map((p, n) => `${n ? 'L' : 'M'}${x(p.k).toFixed(1)},${y(p.valeur).toFixed(1)}`).join(' ');
  const enCours = dernier.k === points.length - 1;
  const clos = enCours ? definis.slice(0, -1) : definis;
  const resume = points
    .map(
      (p) =>
        `${formatMonthYear(p.mois)} : ${p.valeur === null ? 'sans donnée' : `${p.valeur}${unite === '%' ? ' %' : ''}`}`,
    )
    .join(' ; ');

  return (
    <figure className="pi-tendance">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`Tendance sur 6 mois — ${resume}`}>
        {o?.type === 'zone' && o.de !== null && o.a !== null && (
          <rect
            className="pi-tendance-zone"
            x={MARGE.cote}
            width={L - 2 * MARGE.cote}
            y={y(o.a)}
            height={y(o.de) - y(o.a)}
          />
        )}
        {o && o.type !== 'zone' && o.valeur !== null && (
          <line
            className="pi-tendance-objectif"
            x1={MARGE.cote}
            x2={L - MARGE.cote}
            y1={y(o.valeur)}
            y2={y(o.valeur)}
          />
        )}
        {clos.length > 1 && <path className="pi-tendance-ligne" d={trace(clos)} />}
        {enCours && definis.length > 1 && (
          <path className="pi-tendance-ligne pi-tendance-ligne--partiel" d={trace(definis.slice(-2))} />
        )}
        {definis.map((p) => (
          <g key={p.mois}>
            <circle className="pi-tendance-cible" cx={x(p.k)} cy={y(p.valeur)} r={9}>
              <title>{`${formatMonthYear(p.mois)}${p.k === points.length - 1 ? ' (en cours)' : ''} : ${p.valeur}${unite === '%' ? ' %' : ''}`}</title>
            </circle>
            <circle
              className={`pi-tendance-point${p === dernier ? ' is-dernier' : ''}`}
              cx={x(p.k)}
              cy={y(p.valeur)}
              r={p === dernier ? 4 : 2.5}
            />
          </g>
        ))}
        <text className="pi-tendance-mois" x={MARGE.cote} y={H - 3}>
          {moisCourt(points[0].mois)}
        </text>
        <text className="pi-tendance-mois" x={L - MARGE.cote} y={H - 3} textAnchor="end">
          {moisCourt(points[points.length - 1].mois)}
        </text>
      </svg>
      <figcaption className="pi-source">6 derniers mois{enCours ? ' · mois en cours partiel' : ''}</figcaption>
    </figure>
  );
}

// Avancement vers un objectif minimum (valeur / objectif, plafonné à 100 %).
export function Progression({ indicateur: i }: { indicateur: IndicateurPilotage }) {
  const o = i.objectif;
  if (!o || o.type !== 'minimum' || !o.valeur || i.valeur === null) return null;
  const pct = Math.min(100, Math.round((i.valeur / o.valeur) * 100));
  return (
    <div
      className="pi-progression"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`${pct} % de l’objectif`}
    >
      <span className="progress-track">
        <span
          className={`progress-fill progress-fill--${pct >= 100 ? 'succes' : 'attention'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="pi-source">{pct >= 100 ? 'Objectif atteint' : `${pct} % de l’objectif`}</span>
    </div>
  );
}
