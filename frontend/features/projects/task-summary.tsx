import type { ReactNode } from 'react';
import { Infobulle } from '@/components/infobulle';
import { formatDate } from '@hub/domain';
import type { ProjectTask } from './types';

type Rows = [string, ReactNode][];

function RowList({ rows }: { rows: Rows }) {
  return (
    <dl className="po-panneau-lignes">
      {rows.map(([dt, dd]) => (
        <div key={dt}>
          <dt>{dt}</dt>
          <dd>{dd}</dd>
        </div>
      ))}
    </dl>
  );
}

// Durée prévue telle que lue dans le résumé.
function standardDuration(t: ProjectTask): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h`;
  if (t.temps.type === 'partage') return t.temps.libelle;
  return 'Sans temps atelier';
}

// Résumé : ce qu'il faut savoir d'un coup d'œil (assignée à — pour qui
// gère —, échéance et retard, validation, durée, validée le…).
export function TaskSummary({ task: t, manager }: { task: ProjectTask; manager: boolean }) {
  const due = t.prolongation.accordeeJusquau ?? t.finLe;
  // Retard affiché : en retard, ou reprise dont l'échéance est passée
  // (jours calculés par le serveur).
  const daysLate = t.etat.code === 'en_retard' || t.etat.code === 'reprise' ? t.etat.jours : null;
  const v = t.validation;
  const rows: Rows = [];
  if (manager) rows.push(['Assignée à', t.assigne?.nom ?? 'À assigner']);
  rows.push([
    'Échéance',
    due ? (
      <>
        {formatDate(due)}
        {t.prolongation.accordeeJusquau && <span className="tp-secondaire"> · délai accordé</span>}
        {daysLate !== null && <span className="po-retard"> · {daysLate} j de retard</span>}
      </>
    ) : (
      'pas encore de date'
    ),
  ]);
  rows.push([
    'Validation',
    v.mode === 'depot' ? (
      <>
        le dépôt vaut validation{' '}
        <Infobulle>
          Tâche sans temps atelier : déposer le justificatif suffit (exception écrite au principe 4).
        </Infobulle>
      </>
    ) : (
      <>
        {v.nom ?? 'à désigner'} <span className="tp-secondaire">({v.role})</span>
        {/* Pourquoi pas le chef de team : utile au gestionnaire, pas à l'assigné. */}
        {manager && v.motif && <span className="tp-secondaire"> · {v.motif}</span>}
      </>
    ),
  ]);
  rows.push([
    'Durée prévue',
    <>
      {standardDuration(t)}{' '}
      {t.heures !== null && (
        <Infobulle>Temps calculé à partir de la durée standard de la tâche : rien à saisir.</Infobulle>
      )}
    </>,
  ]);
  if (t.valideeLe) {
    rows.push([
      'Validée',
      `le ${formatDate(t.valideeLe)}${t.valideePar ? ` par ${t.valideePar}` : ''}${v.mode === 'depot' ? ' (dépôt)' : ''}`,
    ]);
  }
  return <RowList rows={rows} />;
}

// Détails repliés : les règles de calendrier (fenêtre, échéance figée, écart,
// prolongation accordée).
export function TaskDetails({ task: t }: { task: ProjectTask }) {
  const gap = t.etat.code === 'validee' ? t.etat.ecart : null;
  const rows: Rows = [
    [
      'Fenêtre',
      t.debutJ !== null && t.debutLe && t.finLe
        ? `J${t.debutJ} → J${t.finJ} · ${formatDate(t.debutLe)} → ${formatDate(t.finLe)}`
        : '—',
    ],
    [
      'Échéance de référence',
      t.finLe ? (
        <>
          {formatDate(t.finLe)}{' '}
          <Infobulle>
            Délai figé à l’ouverture du projet : une prolongation accordée qualifie le retard, elle ne déplace pas cette
            date.
          </Infobulle>
        </>
      ) : (
        '—'
      ),
    ],
  ];
  if (gap) {
    rows.push([
      'Écart',
      <span key="ecart" className={gap > 0 ? 'po-avance' : 'po-retard'}>
        {gap > 0 ? `${gap} h d’avance à la remise` : `${-gap} h de retard à la remise`}
      </span>,
    ]);
  }
  if (t.prolongation.accordeeJusquau) {
    rows.push(['Prolongation', `accordée jusqu’au ${formatDate(t.prolongation.accordeeJusquau)}`]);
  }
  return (
    <details className="tp-details">
      <summary className="tp-section">Détails</summary>
      <RowList rows={rows} />
    </details>
  );
}
