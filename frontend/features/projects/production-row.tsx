import { Pill } from '@/components/ui/pill';
import type { LigneRentabilite } from '@/lib/rentabilite';
import { formatDayMonth, plural } from '@hub/domain';
import { SITE_STATUS_LABELS, stepNumber } from './labels';
import { laggingLabel, pendingLabels } from './production-labels';
import type { ProductionRow } from './types';

type Props = {
  row: ProductionRow;
  // Rentabilité du projet (marges en lecture) ; undefined : pas de donnée.
  profitability?: LigneRentabilite;
  showMargin: boolean;
  onOpen: (projectId: string) => void;
};

const MARGIN_TONE = { vert: 'succes', rouge: 'risque', ambre: 'attention' } as const;

// Ligne d'un projet : avancement, calendrier, retards, décisions en attente,
// prochaine tranche et, pour qui voit les marges, la couleur de rentabilité.
export function ProductionRowItem({ row: l, profitability: r, showMargin, onOpen }: Props) {
  const pending = pendingLabels(l.attente);
  const pct = l.total ? Math.round((l.faites / l.total) * 100) : 0;
  return (
    <li>
      <button
        type="button"
        className="prod-ligne"
        data-risque={l.livraisonDepassee || l.enRetard > 0 ? 'oui' : undefined}
        onClick={() => onOpen(l.projet.id)}
      >
        <span className="prod-projet">
          <strong className="fin-code">{l.projet.code}</strong>
          <span className="cell-sub">
            {l.projet.client}
            {l.projet.cellule ? ` · ${l.projet.cellule}` : ''}
          </span>
          <Pill tone="neutre">{SITE_STATUS_LABELS[l.statutChantier]}</Pill>
        </span>
        <span className="prod-avancement">
          <span className="prod-etiquette">Avancement</span>
          <span>
            {l.etape
              ? `${stepNumber(l.etape.numero)} · ${l.etape.libelle}${l.etape.terminee ? ' · terminée' : ''}`
              : 'Pas encore commencé'}
          </span>
          {l.souffrance.length > 0 && (
            <span
              className="prod-souffrance"
              title={l.souffrance.map((s) => `${stepNumber(s.numero)} · ${s.libelle} : ${s.taches}`).join('\n')}
            >
              {laggingLabel(l.souffrance, stepNumber)}
            </span>
          )}
          <span className="prod-barre" aria-label={`${l.faites} tâches faites sur ${l.total}`}>
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="cell-sub">
            {l.faites}/{l.total} tâches
          </span>
        </span>
        <span className="prod-calendrier">
          <span className="prod-etiquette">Calendrier</span>
          <span>
            J{l.jour} / {l.horizon}
          </span>
          <span className={l.livraisonDepassee ? 'prod-alerte' : 'cell-sub'}>
            livraison {l.livraisonDepassee ? 'dépassée, ' : ''}le {formatDayMonth(l.livraisonLe)}
          </span>
        </span>
        <span className="prod-retards">
          <span className="prod-etiquette">Retards</span>
          {l.enRetard ? (
            <Pill tone="risque">{plural(l.enRetard, 'tâche')}</Pill>
          ) : (
            <span className="cell-sub">aucun</span>
          )}
          {l.prolongees > 0 && <span className="cell-sub">{l.prolongees} qualifié(s)</span>}
        </span>
        <span className="prod-attente">
          <span className="prod-etiquette">En attente</span>
          {pending.length ? (
            pending.map((a) => (
              <Pill key={a} tone="attention">
                {a}
              </Pill>
            ))
          ) : (
            <span className="cell-sub">rien</span>
          )}
        </span>
        <span className="prod-tranche">
          <span className="prod-etiquette">Facturation</span>
          {!l.tranche ? (
            <span className="cell-sub">tranches émises</span>
          ) : l.tranche.attend.length === 0 ? (
            <Pill tone="succes">{l.tranche.code} prête</Pill>
          ) : (
            <span className="cell-sub">
              {l.tranche.code} attend {l.tranche.attend.join(', ')}
            </span>
          )}
        </span>
        {showMargin && (
          <span className="prod-renta">
            <span className="prod-etiquette">Marge</span>
            {r && r.etat === 'complet' && r.taux !== null ? (
              <Pill className={`pill--${MARGIN_TONE[r.statut as keyof typeof MARGIN_TONE] ?? 'neutre'}`}>
                {String(r.taux).replace('.', ',')} %
              </Pill>
            ) : (
              <span className="cell-sub">données insuffisantes</span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}
