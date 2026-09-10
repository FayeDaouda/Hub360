import type { ReactNode } from 'react';
import type { AvancementProjets } from '@/lib/types';
import { formatVariation } from '@/lib/format';

const RAYON = 52;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

// Jauge circulaire (donut) en SVG pur. Les couleurs de trait sont définies en
// CSS (.gauge-track / .gauge-fill) pour rester cohérentes avec le thème.
//
// Deux usages :
//  · tableau de bord admin — `data` complet, ligne « vs période précédente ».
//  · « Mes indicateurs » — `centre` (ex. « 3/3 ») + `sousTexte` (contexte
//    neutre) remplacent le pourcentage et la ligne de variation ; `ton` change
//    la couleur de l'anneau. Aucune comparaison, aucun score.
export function RadialGauge({
  data,
  libelle,
  centre,
  sousTexte,
  ton = 'defaut',
  ariaLabel,
}: {
  // Un `AvancementProjets` complet convient ; seul `pourcentage` (0-100) est
  // requis — il pilote le remplissage de l'anneau.
  data: { pourcentage: number } & Partial<AvancementProjets>;
  libelle: string;
  centre?: ReactNode; // remplace « {pourcentage} % » au centre
  sousTexte?: ReactNode; // remplace la ligne « vs période précédente »
  ton?: 'defaut' | 'argile' | 'sauge';
  ariaLabel?: string;
}) {
  const ratio = Math.min(Math.max(data.pourcentage, 0), 100) / 100;
  const classe = `gauge${ton === 'defaut' ? '' : ` gauge--${ton}`}`;

  return (
    <div className={classe}>
      <svg
        className="gauge-svg"
        viewBox="0 0 120 120"
        role="img"
        aria-label={ariaLabel ?? `${libelle} : ${data.pourcentage} %`}
      >
        <circle className="gauge-track" cx="60" cy="60" r={RAYON} />
        <circle
          className="gauge-fill"
          cx="60"
          cy="60"
          r={RAYON}
          strokeDasharray={CIRCONFERENCE}
          strokeDashoffset={CIRCONFERENCE * (1 - ratio)}
          transform="rotate(-90 60 60)"
        />
        <text
          className="gauge-text"
          x="60"
          y="60"
          dominantBaseline="central"
          textAnchor="middle"
        >
          {centre ?? `${data.pourcentage} %`}
        </text>
      </svg>
      <div className="gauge-legend">
        <p className="gauge-legend-titre">{libelle}</p>
        {sousTexte !== undefined ? (
          <p className="gauge-sous">{sousTexte}</p>
        ) : data.variation !== undefined ? (
          <p className={`stat-card-delta stat-card-delta--${data.tendance ?? 'stable'}`}>
            <span>{formatVariation(data.variation, 'points')}</span>
            <span className="stat-card-delta-ref">vs période précédente</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
