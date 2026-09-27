import type { CSSProperties } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  FolderKanban,
  Minus,
  PackageCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { StatKpi } from '@/lib/types';
import { formatValeurKpi, formatVariation } from '@/lib/format';

const ICONE_TENDANCE = {
  hausse: ArrowUpRight,
  baisse: ArrowDownRight,
  stable: Minus,
} as const;

// Un dégradé plein par tuile, choisi par `cle` — un seul point de vérité
// (demande boss, sept. 2026 : chaque KPI du tableau de bord a sa propre
// couleur, pleine — pas un accent en verre — avec une animation de survol
// premium, cf. .stat-card--accent:hover). Couleurs alignées sur les 4 accents
// de l'identité hub360°. Décoratif, indépendant de la hiérarchie de module
// (Azur/Turquoise/Sauge…).
const ACCENT_KPI: Record<string, { a: string; b: string; icone: LucideIcon }> = {
  'projets-actifs': { a: '#4F6BFF', b: '#8B9CFF', icone: FolderKanban },
  'projets-livres': { a: '#06B6D4', b: '#5EEAD4', icone: PackageCheck },
  'reste-a-encaisser': { a: '#E0A800', b: '#FFD02E', icone: Wallet },
};

// Carte d'indicateur du tableau de bord. Deux formes : avec delta
// (`variation` + `tendance` + `uniteVariation` fournis) → ligne « ± X vs
// période précédente » ; sans delta (métrique photo à l'instant T) →
// seulement le `detail` en contexte, ou rien.
export function StatCard({ kpi }: { kpi: StatKpi }) {
  const aDelta = kpi.variation != null && kpi.tendance != null;
  const Icone = aDelta ? ICONE_TENDANCE[kpi.tendance as keyof typeof ICONE_TENDANCE] : null;
  const accent = ACCENT_KPI[kpi.cle];
  const IconeAccent = accent?.icone;

  return (
    <div
      className={`stat-card${accent ? ' stat-card--accent' : ''}`}
      style={
        accent
          ? ({ '--stat-a': accent.a, '--stat-b': accent.b } as CSSProperties)
          : undefined
      }
    >
      {IconeAccent && (
        <span className="stat-card-chip">
          <IconeAccent size={18} strokeWidth={2} aria-hidden />
        </span>
      )}
      <p className="stat-card-label">{kpi.libelle}</p>
      <p className="stat-card-value">{formatValeurKpi(kpi.valeur, kpi.format)}</p>
      {aDelta ? (
        <p className={`stat-card-delta stat-card-delta--${kpi.tendance}`}>
          {Icone && <Icone size={14} strokeWidth={2.25} aria-hidden />}
          <span>
            {formatVariation(kpi.variation as number, kpi.uniteVariation ?? 'pourcent')}
          </span>
          <span className="stat-card-delta-ref">{kpi.detail ?? 'vs période précédente'}</span>
        </p>
      ) : kpi.detail ? (
        <p className="stat-card-detail">{kpi.detail}</p>
      ) : null}
    </div>
  );
}
