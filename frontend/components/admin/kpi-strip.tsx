import type { ReactNode } from 'react';
import Link from 'next/link';

// Bandeau de KPI — chiffres dérivés de la liste déjà chargée par la page
// (aucun endpoint, aucune saisie). Pas de « vs période précédente » comme le
// StatCard du dashboard : ici il n'y a pas de période à comparer.

export type KpiTuile = {
  cle: string;
  label: string;
  valeur?: string | number;
  sousTexte?: string;
  accent?: boolean;
  // Chiffre en Argile (couleur de signature) : la tuile appelle une action —
  // sans le fond sombre de `accent`. cf. Direction visuelle §4.
  alerte?: boolean;
  // Remplace `valeur` pour une tuile qui porte un mini-graphe (ex. charge par cellule).
  contenu?: ReactNode;
  // Rend la tuile interactive. 'popup' → <button aria-haspopup="dialog"> ;
  // 'lien' → <Link>. Absent → <div> statique (usage admin inchangé).
  action?:
    | { type: 'popup'; onClick: () => void }
    | { type: 'lien'; href: string };
};

export function KpiStrip({ tuiles }: { tuiles: KpiTuile[] }) {
  return (
    <div className="kpi-strip">
      {tuiles.map((t) => {
        const classe = `kpi-tuile${t.accent ? ' kpi-tuile--accent' : ''}${
          t.alerte ? ' kpi-tuile--alerte' : ''
        }${t.action ? ' kpi-tuile--clic' : ''}`;
        const contenu = (
          <>
            <p className="kpi-tuile-label">{t.label}</p>
            {t.contenu ?? <p className="kpi-tuile-valeur">{t.valeur}</p>}
            {t.sousTexte && <p className="kpi-tuile-sous">{t.sousTexte}</p>}
          </>
        );

        if (t.action?.type === 'popup') {
          return (
            <button
              key={t.cle}
              type="button"
              className={classe}
              aria-haspopup="dialog"
              onClick={t.action.onClick}
            >
              {contenu}
            </button>
          );
        }
        if (t.action?.type === 'lien') {
          return (
            <Link key={t.cle} href={t.action.href} className={classe}>
              {contenu}
            </Link>
          );
        }
        return (
          <div key={t.cle} className={classe}>
            {contenu}
          </div>
        );
      })}
    </div>
  );
}

// Barre de répartition (funnel CRM par statut + split mandat/promotion).
export type FunnelSegment = { cle: string; label: string; valeur: number };

export function KpiFunnel({
  segments,
  natureSplit,
}: {
  segments: FunnelSegment[];
  natureSplit?: { mandat: number; promotion: number };
}) {
  const total = segments.reduce((s, x) => s + x.valeur, 0) || 1;
  const natTotal = natureSplit
    ? natureSplit.mandat + natureSplit.promotion || 1
    : 1;

  return (
    <div className="kpi-funnel">
      <div className="kpi-funnel-barre" role="img" aria-label="Répartition par statut">
        {segments.map((s) => {
          const pct = (s.valeur / total) * 100;
          return (
            <span
              key={s.cle}
              className={`kpi-funnel-seg kpi-funnel-seg--${s.cle}`}
              style={{ width: `${pct}%` }}
              title={`${s.label} : ${s.valeur}`}
            >
              {/* le chiffre dans le segment quand il y a la place — sinon la légende le porte */}
              {pct >= 8 && s.valeur > 0 && (
                <span className="kpi-funnel-seg-val">{s.valeur}</span>
              )}
            </span>
          );
        })}
      </div>
      <ul className="kpi-funnel-legende">
        {segments.map((s) => (
          <li key={s.cle}>
            <span className={`kpi-funnel-puce kpi-funnel-seg--${s.cle}`} aria-hidden />
            {s.label} <b>{s.valeur}</b>
          </li>
        ))}
      </ul>

      {natureSplit && (
        <div className="kpi-funnel-nature">
          <div className="kpi-funnel-barre kpi-funnel-barre--mince">
            <span
              className="kpi-funnel-seg kpi-funnel-seg--mandat"
              style={{ width: `${(natureSplit.mandat / natTotal) * 100}%` }}
            />
            <span
              className="kpi-funnel-seg kpi-funnel-seg--promotion"
              style={{ width: `${(natureSplit.promotion / natTotal) * 100}%` }}
            />
          </div>
          <span className="kpi-funnel-nature-txt">
            Mandat <b>{natureSplit.mandat}</b> · Promotion <b>{natureSplit.promotion}</b>
          </span>
        </div>
      )}
    </div>
  );
}

// Mini-liste de barres (charge par cellule sur la page Projets).
export function KpiMiniBars({
  items,
}: {
  items: { cle: string; label: string; valeur: number }[];
}) {
  const max = Math.max(...items.map((i) => i.valeur), 1);
  if (items.length === 0) {
    return <p className="kpi-tuile-sous">Aucune cellule assignée.</p>;
  }
  return (
    <ul className="kpi-minibars">
      {items.map((i) => (
        <li key={i.cle}>
          <span className="kpi-minibars-label">{i.label}</span>
          <span className="kpi-minibars-piste">
            <span
              className="kpi-minibars-barre"
              style={{ width: `${(i.valeur / max) * 100}%` }}
            />
          </span>
          <b>{i.valeur}</b>
        </li>
      ))}
    </ul>
  );
}
