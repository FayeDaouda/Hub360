'use client';

import { useState } from 'react';
import { CalendarCheck, CalendarPlus, Hourglass, Plane } from 'lucide-react';
import { formatDate } from '@hub/domain';
import {
  LIBELLE_MOTIF_REFUS,
  LIBELLE_TYPE_ABSENCE,
  repondreAutresDates,
  retirerAbsence,
  STATUT_ABSENCE,
} from '@/lib/demandes';
import type { DemandeAbsence } from '@/lib/types';
import { KpiStrip } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/ui/feedback';
import { LeaveRequestForm } from './leave-request-form';
import { errorMessage, Loading, useMyRequests } from './request-parts';

// « Mon espace » · Congés et absences (RH lot 2, maquette du boss) : solde
// de l'année en tête, demande, suivi (la file du N+1 vit dans « À valider »).
// Règles de solde : regles-conges.ts (2 j/mois, report plafonné — 19/10/2026).
export function LeaveRequests({ slug }: { slug: string }) {
  const { data, error, load } = useMyRequests(slug);
  if (error) return <EmptyState>{error}</EmptyState>;
  if (!data) return <Loading />;
  const { solde: balance, absences } = data;

  return (
    <>
      <KpiStrip
        tiles={[
          {
            id: 'restant',
            label: 'Restant',
            value: `${balance.disponible} j`,
            hint: balance.enAttente
              ? `dont ${balance.enAttente} j réservés par vos demandes en attente`
              : 'à poser cette année',
            icon: Plane,
          },
          {
            id: 'acquis',
            label: `Acquis ${balance.annee}`,
            value: `${balance.acquis} j`,
            hint: '2 jours ouvrables par mois de service',
            icon: CalendarPlus,
          },
          {
            id: 'report',
            label: `Report de ${balance.annee - 1}`,
            value: `${balance.report} j`,
            hint: balance.plafondReport ? `plafonné à ${balance.plafondReport} j` : 'aucun report',
            icon: Hourglass,
          },
          {
            id: 'pris',
            label: 'Pris',
            value: `${balance.pris} j`,
            hint: 'congés payés validés',
            icon: CalendarCheck,
          },
        ]}
      />
      <div className="me-colonnes me-colonnes--egales">
        <LeaveRequestForm slug={slug} balance={balance} onDone={load} />
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Mes demandes</h2>
          {absences.length === 0 ? (
            <p className="dmd-note">Aucune demande.</p>
          ) : (
            <ul className="dmd-liste">
              {absences.map((d) => (
                <LeaveRequestRow key={d.id} slug={slug} d={d} onDone={load} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

// Une demande : son état, la réponse à des dates proposées, son retrait.
function LeaveRequestRow({ slug, d, onDone }: { slug: string; d: DemandeAbsence; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const run = (p: Promise<unknown>) => p.then(onDone).catch((e) => setError(errorMessage(e, 'Action impossible.')));
  const status = STATUT_ABSENCE[d.statut];
  return (
    <li className="dmd-ligne">
      <span>
        <strong>
          {LIBELLE_TYPE_ABSENCE[d.type]} · {d.jours} j
        </strong>
        <span className="cell-sub">
          {formatDate(d.dateDebut)} → {formatDate(d.dateFin)}
          {d.statut === 'attente_n1' && d.n1Role && ` · chez ${d.n1Role}`}
          {d.statut === 'accord_n1' && !d.decisionN1 && ' · sans N+1, transmise à la RH'}
          {d.motifRefus && ` · ${LIBELLE_MOTIF_REFUS[d.motifRefus]}`}
          {d.commentaireRefus && ` — ${d.commentaireRefus}`}
        </span>
        {d.statut === 'autres_dates' && d.datesProposeesDebut && (
          <span className="dmd-proposition">
            Dates proposées : {formatDate(d.datesProposeesDebut)} → {formatDate(d.datesProposeesFin!)}
          </span>
        )}
        {error && <span className="field-erreur">{error}</span>}
      </span>
      <span className="dmd-actions">
        <Pill className={status.pill}>{status.libelle}</Pill>
        {d.statut === 'autres_dates' && (
          <>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              onClick={() => run(repondreAutresDates(slug, d.id, true))}
            >
              Accepter
            </button>
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => run(repondreAutresDates(slug, d.id, false))}
            >
              Retirer
            </button>
          </>
        )}
        {d.statut === 'attente_n1' && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => run(retirerAbsence(slug, d.id))}>
            Retirer
          </button>
        )}
      </span>
    </li>
  );
}
