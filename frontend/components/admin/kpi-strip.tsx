import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import type { EtatTuile } from '@/lib/couleurs-etat';
import { formatMontant, formatMontantCompact } from '@/lib/format';

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
export type TendanceKpiTuile = {
  sens: 'hausse' | 'baisse' | 'stable';
  // Texte court affiché dans la pastille (ex. « +10 ») — un vrai delta,
  // jamais une valeur inventée pour remplir l'espace.
  court: string;
  // Description complète, portée en `title` (accessibilité / survol).
  texte: string;
};

const ICONE_TENDANCE = {
  hausse: ArrowUpRight,
  baisse: ArrowDownRight,
  stable: Minus,
} as const;

// Anneau miniature dans le coin de la tuile — un pourcentage RÉEL uniquement
// (ex. taux de conversion déjà calculé). Jamais posé sans valeur derrière.
function AnneauMini({ pourcentage }: { pourcentage: number }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pourcentage));
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

export type KpiTuile = {
  cle: string;
  label: string;
  valeur?: string | number;
  // Montant en FCFA : remplace `valeur`. ≥ 1 million → arrondi en grand
  // (« 31,02 M FCFA ») et montant exact en tête du sous-texte, lisible au
  // doigt comme à la souris ; en dessous, montant exact en grand.
  montant?: number;
  sousTexte?: string;
  // Pastille d'icône en tête de tuile — repère visuel immédiat.
  icone?: LucideIcon;
  // Sens du chiffre (lib/couleurs-etat.ts). Absent = « marque » (neutre).
  etat?: EtatTuile;
  // Décor en tête, à droite — UN seul des trois, jamais un graphique inventé :
  //  · `ringPourcentage` : anneau sur un vrai pourcentage déjà calculé
  //  · `tendance`        : pastille flèche + delta réel vs une vraie période antérieure
  //  · `decorIcone`      : icône purement graphique (aucune donnée, assumé comme décor)
  ringPourcentage?: number;
  tendance?: TendanceKpiTuile;
  decorIcone?: LucideIcon;
  // Remplace `valeur` pour une tuile qui porte un mini-graphe (ex. charge par cellule).
  contenu?: ReactNode;
  // Rend la tuile interactive. 'popup' → <button aria-haspopup="dialog"> ;
  // 'lien' → <Link> ; 'filtre' → <button aria-pressed> qui bascule un filtre
  // sur la page (`actif` reflète l'état courant). Absent → <div> statique.
  action?:
    | { type: 'popup'; onClick: () => void }
    | { type: 'lien'; href: string }
    | { type: 'filtre'; actif: boolean; onClick: () => void };
};

export function KpiStrip({ tuiles }: { tuiles: KpiTuile[] }) {
  const cleAlerte = tuiles.find((t) => t.etat === 'risque')?.cle;
  return (
    <div className="kpi-strip">
      {tuiles.map((t) => {
        const Icone = t.icone;
        const DecorIcone = t.decorIcone;
        const IconeTendance = t.tendance ? ICONE_TENDANCE[t.tendance.sens] : null;
        const estFiltreActif = t.action?.type === 'filtre' && t.action.actif;
        const etat = t.etat ?? 'marque';
        const classe = `kpi-tuile kpi-tuile--${etat}${t.cle === cleAlerte ? ' kpi-tuile--alerte' : ''}${
          t.action ? ' kpi-tuile--clic' : ''
        }${estFiltreActif ? ' kpi-tuile--actif' : ''}`;
        const arrondi = t.montant != null && Math.abs(t.montant) >= 1_000_000;
        const valeur = t.montant == null ? t.valeur : arrondi ? formatMontantCompact(t.montant) : formatMontant(t.montant);
        const sousTexte = arrondi ? [formatMontant(t.montant!), t.sousTexte].filter(Boolean).join(' · ') : t.sousTexte;
        const contenu = (
          <>
            <div className="kpi-tuile-tete">
              {Icone && (
                <span className="kpi-tuile-icone" aria-hidden>
                  <Icone size={18} />
                </span>
              )}
              <span className="kpi-tuile-tete-droite">
                {t.ringPourcentage != null && <AnneauMini pourcentage={t.ringPourcentage} />}
                {t.tendance && IconeTendance && (
                  <span
                    className={`kpi-tuile-badge kpi-tuile-badge--${t.tendance.sens}`}
                    title={t.tendance.texte}
                  >
                    <IconeTendance size={11} strokeWidth={2.5} aria-hidden />
                    {t.tendance.court}
                  </span>
                )}
                {DecorIcone && (
                  <span className="kpi-tuile-decor" aria-hidden>
                    <DecorIcone size={18} />
                  </span>
                )}
              </span>
            </div>
            <p className="kpi-tuile-label">{t.label}</p>
            {/* Montant long : variante plus petite sur téléphone (pas coupé). */}
            {t.contenu ?? <p className={`kpi-tuile-valeur${String(valeur).length > 9 ? ' kpi-tuile-valeur--long' : ''}`}>{valeur}</p>}
            {sousTexte && <p className="kpi-tuile-sous">{sousTexte}</p>}
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
        if (t.action?.type === 'filtre') {
          return (
            <button
              key={t.cle}
              type="button"
              className={classe}
              aria-pressed={t.action.actif}
              onClick={t.action.onClick}
            >
              {contenu}
            </button>
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
