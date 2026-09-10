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
export function StatCard({ kpi, accent = false }: { kpi: StatKpi; accent?: boolean }) {
  const Icone = ICONE_TENDANCE[kpi.tendance];

  return (
    <div className={`stat-card${accent ? ' stat-card--accent' : ''}`}>
      <p className="stat-card-label">{kpi.libelle}</p>
      <p className="stat-card-value">{formatValeurKpi(kpi.valeur, kpi.format)}</p>
      <p className={`stat-card-delta stat-card-delta--${kpi.tendance}`}>
        <Icone size={14} strokeWidth={2.25} aria-hidden />
        <span>{formatVariation(kpi.variation, kpi.uniteVariation)}</span>
        <span className="stat-card-delta-ref">{kpi.detail ?? 'vs période précédente'}</span>
      </p>
    </div>
  );
}
