import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { StatKpi } from '@/lib/types';
import { formatValeurKpi, formatVariation } from '@/lib/format';

const ICONE_TENDANCE = {
  hausse: ArrowUpRight,
  baisse: ArrowDownRight,
  stable: Minus,
} as const;

// Carte d'indicateur du tableau de bord. `accent` = la carte mise en avant
// (fond sombre) — une seule par rangée.
//
// Deux formes : avec delta (`variation` + `tendance` + `uniteVariation`
// fournis) → ligne « ± X vs période précédente » ; sans delta (métrique photo
// à l'instant T) → seulement le `detail` en contexte, ou rien.
export function StatCard({ kpi, accent = false }: { kpi: StatKpi; accent?: boolean }) {
  const aDelta = kpi.variation != null && kpi.tendance != null;
  const Icone = aDelta ? ICONE_TENDANCE[kpi.tendance as keyof typeof ICONE_TENDANCE] : null;

  return (
    <div className={`stat-card${accent ? ' stat-card--accent' : ''}`}>
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
