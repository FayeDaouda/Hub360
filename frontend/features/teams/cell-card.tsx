'use client';

import { formatDayMonth, formatHours } from '@hub/domain';
import { DecisionsFiche } from '@/components/pilotage/decisions-fiche';
import { Pill } from '@/components/ui/pill';
import { estImage, lireImageRedimensionnee } from '@/lib/image-fichier';
import { couleurPersonne, srcPhoto } from '@/lib/profil';
import { cellAnchor } from './cell-summary';
import { CELL_STATUSES, CLIENTELES, EMPLOYEE_LEVELS, POSITION_STATES, PROCESSES } from './constants';
import type { EmployeeLevel, TeamCell } from './types';

type Props = {
  slug: string;
  cell: TeamCell;
  cells: TeamCell[]; // destinations d'une réaffectation
  canWrite: boolean;
  // Supprimer une équipe : la Suppression de l'étape (matrice, 31/10/2026).
  canDelete?: boolean;
  onReassign: (employeeId: string, cellId: string | null) => void;
  // Reprises de l'ancienne page Équipe (phase 1, G1 à G4) — en écriture.
  onRename: (cell: TeamCell) => void;
  onDelete: (cell: TeamCell) => void;
  onPilot: (cellId: string, employeeId: string | null) => void;
  onUpdateMember: (employeeId: string, patch: { niveau?: EmployeeLevel; photo?: string | null }) => void;
};

// Cellule (maquette « Équipes ») : code ISO 9001, statut, ponctualité, pilote,
// clientèle et clauses, postes, puis les membres — charge du mois, part des
// livrables à temps, cellule de rattachement (réaffectation en écriture).
export function CellCard({
  slug,
  cell: c,
  cells,
  canWrite,
  canDelete = canWrite,
  onReassign,
  onRename,
  onDelete,
  onPilot,
  onUpdateMember,
}: Props) {
  const status = CELL_STATUSES[c.statut];

  async function choosePhoto(employeeId: string, f: File | undefined) {
    if (!f || !estImage(f)) return;
    const { url } = await lireImageRedimensionnee(f);
    onUpdateMember(employeeId, { photo: url });
  }

  return (
    <section
      id={cellAnchor(c.id)}
      className={`panel glass-panel eq-cellule eq-cellule--${c.statut}`}
      aria-labelledby={`eq-${c.id}`}
    >
      <header className="eq-cellule-tete">
        <h2 id={`eq-${c.id}`}>
          <span className="eq-code">{c.code}</span> {c.nom}
        </h2>
        <span className="eq-badges">
          <Pill tone={status.ton}>{status.libelle}</Pill>
          <Pill className={c.pctATemps == null ? 'pill--neutre' : 'pill--succes'}>
            {c.pctATemps == null ? 'pas encore d’étape livrée' : `${c.pctATemps} % à temps`}
          </Pill>
        </span>
      </header>
      <p className="eq-cellule-sous">
        Chef d’équipe :{' '}
        {canWrite && c.membres.length > 0 ? (
          // Le pilote est le chef d’équipe de la cellule (dispatcher) : il
          // valide les tâches de ses membres — choisi parmi eux.
          <select
            className="field-input eq-pilote"
            aria-label={`Chef d’équipe de ${c.nom}`}
            value={c.pilote?.id ?? ''}
            onChange={(e) => onPilot(c.id, e.target.value || null)}
          >
            <option value="">À désigner</option>
            {c.membres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        ) : (
          (c.pilote?.nom ?? 'à désigner')
        )}{' '}
        · {CLIENTELES[c.clientele]} · {PROCESSES[c.processus].iso}
      </p>
      {/* Détail (remontée au Dir. GC) : un seul bandeau en tête de la liste. */}
      {c.pilote?.sansCompte && (
        <Pill tone="attention" className="eq-sans-compte">
          Chef d’équipe sans compte HUB
        </Pill>
      )}
      <DecisionsFiche slug={slug} cible={{ cellule: c.id }} />
      {canWrite && (
        <div className="eq-cellule-actions">
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onRename(c)}>
            Renommer
          </button>
          {canDelete && (
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => onDelete(c)}
              title={c.membres.length ? 'Réaffectez d’abord ses membres' : undefined}
            >
              Supprimer
            </button>
          )}
        </div>
      )}

      {c.postes.length > 0 && (
        <ul className="eq-postes">
          {c.postes.map((p) => (
            <li key={p.id} className={`eq-poste eq-poste--${p.etat}`}>
              <strong>{p.libelle}</strong>
              <span>{p.titulaire?.nom ?? POSITION_STATES[p.etat]}</span>
            </li>
          ))}
        </ul>
      )}

      {c.membres.length > 0 && (
        <ul className="eq-membres">
          {c.membres.map((m) => (
            <li key={m.id}>
              <label
                className={`eq-avatar${canWrite ? ' eq-avatar--modifiable' : ''}`}
                style={
                  m.photoUrl
                    ? { backgroundImage: `url(${srcPhoto(m.photoUrl)})` }
                    : { background: couleurPersonne(m.id) }
                }
                title={
                  [
                    m.absentJusquau ? `Absent·e jusqu’au ${formatDayMonth(m.absentJusquau)}` : null,
                    canWrite ? `Changer la photo de ${m.nom}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              >
                {m.absentJusquau && <span className="av-absent" aria-label="Absent aujourd'hui" />}
                {!m.photoUrl &&
                  m.nom
                    .split(' ')
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join('')}
                {canWrite && (
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    aria-label={`Photo de ${m.nom}`}
                    onChange={(e) => choosePhoto(m.id, e.target.files?.[0])}
                  />
                )}
              </label>
              <span className="eq-membre">
                <strong>
                  {m.nom}
                  {m.estPilote && ' · chef d’équipe'}
                </strong>
                <small>
                  {m.poste ?? m.role} ·{' '}
                  {canWrite ? (
                    <select
                      className="eq-niveau"
                      aria-label={`Niveau de ${m.nom}`}
                      value={m.niveau}
                      onChange={(e) => onUpdateMember(m.id, { niveau: e.target.value as EmployeeLevel })}
                    >
                      {(Object.keys(EMPLOYEE_LEVELS) as EmployeeLevel[]).map((n) => (
                        <option key={n} value={n}>
                          {EMPLOYEE_LEVELS[n]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    EMPLOYEE_LEVELS[m.niveau]
                  )}
                </small>
              </span>
              <span className="eq-charge" title="Tâches du mois en cours · heures imputées à ce jour">
                {m.taches} tâche(s) · {formatHours(m.heures)}
              </span>
              <span className="eq-pct" title="Livrables validés à leur échéance">
                {m.pctATemps == null ? '—' : `${m.pctATemps} %`}
              </span>
              <select
                className="field-input eq-affectation"
                aria-label={`Cellule de ${m.nom}`}
                value={c.id}
                disabled={!canWrite}
                onChange={(e) => onReassign(m.id, e.target.value || null)}
              >
                {cells.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.nom}
                  </option>
                ))}
                <option value="">Sans cellule</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
