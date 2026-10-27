import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import type { EtatTuile } from '@/lib/couleurs-etat';
import { formatAmount, formatCompactAmount } from '@hub/domain';

// Bandeau de KPI — chiffres dérivés de la liste déjà chargée par la page
// (aucun endpoint, aucune saisie). Pas de « vs période précédente » comme le
// StatCard du dashboard, SAUF `tendance` : à poser seulement quand une vraie
// période de comparaison existe dans les données déjà chargées — jamais une
// valeur inventée pour occuper l'espace.

// Tuile unique (lot 2 de l'audit UX, 23/10/2026) : toutes les tuiles sont
// neutres (surface opaque, chiffre en couleur de texte) ; l'ÉTAT ne teinte
// que la pastille d'icône — vert succès, ambre attention, rouge risque.
// Un seul aplat de couleur par bandeau : la PREMIÈRE tuile « risque »
// (l'ordre des tuiles est celui des priorités de la page) — c'est elle qui
// demande une action. Aucun risque : bandeau entièrement calme.
// Les valeurs de `direction` et de `state` sont aussi des classes CSS
// (kpi-tuile-badge--hausse, kpi-tuile--risque) : elles restent telles quelles.
export type KpiTrend = {
  direction: 'hausse' | 'baisse' | 'stable';
  // Texte court affiché dans la pastille (ex. « +10 ») — un vrai delta,
  // jamais une valeur inventée pour remplir l'espace.
  short: string;
  // Description complète, portée en `title` (accessibilité / survol).
  text: string;
};

const TREND_ICON = {
  hausse: ArrowUpRight,
  baisse: ArrowDownRight,
  stable: Minus,
} as const;

// Anneau miniature dans le coin de la tuile — un pourcentage RÉEL uniquement
// (ex. taux de conversion déjà calculé). Jamais posé sans valeur derrière.
function MiniRing({ percent }: { percent: number }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className="kpi-tuile-anneau" aria-hidden>
      <circle cx="15" cy="15" r={r} className="kpi-tuile-anneau-piste" fill="none" />
      <circle
        cx="15"
        cy="15"
        r={r}
        className="kpi-tuile-anneau-trait"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - p / 100)}
        transform="rotate(-90 15 15)"
      />
    </svg>
  );
}

export type KpiTile = {
  id: string;
  label: string;
  value?: string | number;
  // Montant en FCFA : remplace `value`. ≥ 1 million → arrondi en grand
  // (« 31,02 M FCFA ») et montant exact en tête du sous-texte, lisible au
  // doigt comme à la souris ; en dessous, montant exact en grand.
  amount?: number;
  hint?: string;
  // Pastille d'icône en tête de tuile — repère visuel immédiat.
  icon?: LucideIcon;
  // Sens du chiffre (lib/couleurs-etat.ts). Absent = « marque » (neutre).
  state?: EtatTuile;
  // Décor en tête, à droite — UN seul des trois, jamais un graphique inventé :
  //  · `ringPercent` : anneau sur un vrai pourcentage déjà calculé
  //  · `trend`       : pastille flèche + delta réel vs une vraie période antérieure
  //  · `decorIcon`   : icône purement graphique (aucune donnée, assumé comme décor)
  ringPercent?: number;
  trend?: KpiTrend;
  decorIcon?: LucideIcon;
  // Remplace `value` pour une tuile qui porte un mini-graphe (ex. charge par cellule).
  content?: ReactNode;
  // Rend la tuile interactive. 'dialog' → <button aria-haspopup="dialog"> ;
  // 'link' → <Link> ; 'filter' → <button aria-pressed> qui bascule un filtre
  // sur la page (`active` reflète l'état courant). Absent → <div> statique.
  action?:
    | { type: 'dialog'; onClick: () => void }
    | { type: 'link'; href: string }
    | { type: 'filter'; active: boolean; onClick: () => void };
};

// `compact` : tuiles en une ligne (icône · libellé et sous-texte · valeur)
// sur grand écran, pour les pages où l'espace de travail prime (Projets).
export function KpiStrip({ tiles, compact = false }: { tiles: KpiTile[]; compact?: boolean }) {
  const alertId = tiles.find((t) => t.state === 'risque')?.id;
  return (
    <div className={`kpi-strip${compact ? ' kpi-strip--compact' : ''}`}>
      {tiles.map((t) => {
        const Icon = t.icon;
        const DecorIcon = t.decorIcon;
        const TrendIcon = t.trend ? TREND_ICON[t.trend.direction] : null;
        const activeFilter = t.action?.type === 'filter' && t.action.active;
        const state = t.state ?? 'marque';
        const className = `kpi-tuile kpi-tuile--${state}${t.id === alertId ? ' kpi-tuile--alerte' : ''}${
          t.action ? ' kpi-tuile--clic' : ''
        }${activeFilter ? ' kpi-tuile--actif' : ''}`;
        const rounded = t.amount != null && Math.abs(t.amount) >= 1_000_000;
        const value = t.amount == null ? t.value : rounded ? formatCompactAmount(t.amount) : formatAmount(t.amount);
        const hint = rounded ? [formatAmount(t.amount!), t.hint].filter(Boolean).join(' · ') : t.hint;
        const body = (
          <>
            <div className="kpi-tuile-tete">
              {Icon && (
                <span className="kpi-tuile-icone" aria-hidden>
                  <Icon size={18} />
                </span>
              )}
              <span className="kpi-tuile-tete-droite">
                {t.ringPercent != null && <MiniRing percent={t.ringPercent} />}
                {t.trend && TrendIcon && (
                  <span className={`kpi-tuile-badge kpi-tuile-badge--${t.trend.direction}`} title={t.trend.text}>
                    <TrendIcon size={11} strokeWidth={2.5} aria-hidden />
                    {t.trend.short}
                  </span>
                )}
                {DecorIcon && (
                  <span className="kpi-tuile-decor" aria-hidden>
                    <DecorIcon size={18} />
                  </span>
                )}
              </span>
            </div>
            <p className="kpi-tuile-label">{t.label}</p>
            {/* Taille de la valeur : suit la largeur de la tuile (10-kpi.css). */}
            {t.content ?? <p className="kpi-tuile-valeur">{value}</p>}
            {hint && <p className="kpi-tuile-sous">{hint}</p>}
          </>
        );

        if (t.action?.type === 'dialog') {
          return (
            <button key={t.id} type="button" className={className} aria-haspopup="dialog" onClick={t.action.onClick}>
              {body}
            </button>
          );
        }
        if (t.action?.type === 'link') {
          return (
            <Link key={t.id} href={t.action.href} className={className}>
              {body}
            </Link>
          );
        }
        if (t.action?.type === 'filter') {
          return (
            <button
              key={t.id}
              type="button"
              className={className}
              aria-pressed={t.action.active}
              onClick={t.action.onClick}
            >
              {body}
            </button>
          );
        }
        return (
          <div key={t.id} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

// Barre de répartition (funnel CRM par statut + split mandat/promotion).
// `id` est aussi une classe CSS (kpi-funnel-seg--<statut>).
export type FunnelSegment = { id: string; label: string; value: number };

export function KpiFunnel({
  segments,
  natureSplit,
}: {
  segments: FunnelSegment[];
  natureSplit?: { mandate: number; promotion: number };
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const natTotal = natureSplit ? natureSplit.mandate + natureSplit.promotion || 1 : 1;

  return (
    <div className="kpi-funnel">
      <div className="kpi-funnel-barre" role="img" aria-label="Répartition par statut">
        {segments.map((s) => {
          const pct = (s.value / total) * 100;
          return (
            <span
              key={s.id}
              className={`kpi-funnel-seg kpi-funnel-seg--${s.id}`}
              style={{ width: `${pct}%` }}
              title={`${s.label} : ${s.value}`}
            >
              {/* le chiffre dans le segment quand il y a la place — sinon la légende le porte */}
              {pct >= 8 && s.value > 0 && <span className="kpi-funnel-seg-val">{s.value}</span>}
            </span>
          );
        })}
      </div>
      <ul className="kpi-funnel-legende">
        {segments.map((s) => (
          <li key={s.id}>
            <span className={`kpi-funnel-puce kpi-funnel-seg--${s.id}`} aria-hidden />
            {s.label} <b>{s.value}</b>
          </li>
        ))}
      </ul>

      {natureSplit && (
        <div className="kpi-funnel-nature">
          <div className="kpi-funnel-barre kpi-funnel-barre--mince">
            <span
              className="kpi-funnel-seg kpi-funnel-seg--mandat"
              style={{ width: `${(natureSplit.mandate / natTotal) * 100}%` }}
            />
            <span
              className="kpi-funnel-seg kpi-funnel-seg--promotion"
              style={{ width: `${(natureSplit.promotion / natTotal) * 100}%` }}
            />
          </div>
          <span className="kpi-funnel-nature-txt">
            Mandat <b>{natureSplit.mandate}</b> · Promotion <b>{natureSplit.promotion}</b>
          </span>
        </div>
      )}
    </div>
  );
}

// Mini-liste de barres (charge par cellule sur la page Projets).
export function KpiMiniBars({ items }: { items: { id: string; label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <p className="kpi-tuile-sous">Aucune cellule assignée.</p>;
  }
  return (
    <ul className="kpi-minibars">
      {items.map((i) => (
        <li key={i.id}>
          <span className="kpi-minibars-label">{i.label}</span>
          <span className="kpi-minibars-piste">
            <span className="kpi-minibars-barre" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <b>{i.value}</b>
        </li>
      ))}
    </ul>
  );
}
