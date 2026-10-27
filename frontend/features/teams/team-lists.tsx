'use client';

import Link from 'next/link';
import { formatDate } from '@hub/domain';
import { AbsencesADecider } from '@/components/absences/absences-a-decider';
import { Pill } from '@/components/ui/pill';
import { EMPLOYEE_LEVELS } from './constants';
import type { TeamsView } from './types';

// Les listes ouvertes par les indicateurs de la page Équipes (hors
// « Cellules », la vue par défaut) : chacune a son état vide.

export function UnassignedList({
  view,
  canWrite,
  onAssign,
}: {
  view: TeamsView;
  canWrite: boolean;
  onAssign: (employeeId: string, cellId: string) => void;
}) {
  return (
    <section className="panel glass-panel eq-liste">
      <h2>Salariés à affecter · {view.salariesAAffecter.length}</h2>
      {view.salariesAAffecter.length === 0 ? (
        <p className="eq-aide">Tous les salariés ont une cellule.</p>
      ) : (
        <ul className="eq-lignes">
          {view.salariesAAffecter.map((s) => (
            <li key={s.id}>
              <span className="eq-membre">
                <strong>{s.nom}</strong>
                <small>
                  {s.role} · {EMPLOYEE_LEVELS[s.niveau]}
                  {s.dateArrivee && ` · arrivé le ${formatDate(s.dateArrivee)}`}
                </small>
              </span>
              <select
                className="field-input eq-affectation"
                aria-label={`Affecter ${s.nom}`}
                value=""
                disabled={!canWrite}
                onChange={(e) => e.target.value && onAssign(s.id, e.target.value)}
              >
                <option value="">Affecter à une cellule…</option>
                {view.cellules.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.nom}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SignedProjectsList({ slug, view }: { slug: string; view: TeamsView }) {
  return (
    <section className="panel glass-panel eq-liste">
      <h2>Projets signés · {view.projets.length}</h2>
      {view.projets.length === 0 ? (
        <p className="eq-aide">Aucun projet signé pour l’instant.</p>
      ) : (
        <ul className="eq-lignes">
          {view.projets.map((p) => (
            <li key={p.id}>
              <span className="eq-membre">
                <strong className="eq-code">{p.code}</strong>
                <small>
                  {p.client}
                  {p.programme && ` · ${p.programme}`}
                </small>
              </span>
              <span className="eq-badges">
                {p.cellules.length ? (
                  p.cellules.map((c) => (
                    <Pill key={c.code} tone="info" title={c.nom}>
                      {c.code}
                    </Pill>
                  ))
                ) : (
                  <Pill tone="attention">à affecter</Pill>
                )}
              </span>
              <Link className="lien-inline" href={`/admin/${slug}/projets?projet=${p.id}`}>
                Ouvrir
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OngoingTasksList({ view }: { view: TeamsView }) {
  const late = view.indicateurs.taches.enRetard;
  return (
    <section className="panel glass-panel eq-liste">
      <h2>
        Tâches en cours · {view.tachesEnCours.length}
        {late > 0 && <Pill tone="risque">{late} en retard</Pill>}
      </h2>
      {view.tachesEnCours.length === 0 ? (
        <p className="eq-aide">Aucune tâche en cours.</p>
      ) : (
        <ul className="eq-lignes">
          {view.tachesEnCours.map((t) => (
            <li key={t.id}>
              <span className="eq-membre">
                <strong>{t.libelle}</strong>
                <small>
                  <span className="eq-code">{t.projet}</span> · {t.etape}
                </small>
              </span>
              <span className="eq-charge">{t.assigne ?? 'à assigner'}</span>
              {t.prolongeeJusquau ? (
                <Pill tone="attention">prolongée jusqu’au {formatDate(t.prolongeeJusquau)}</Pill>
              ) : (
                <Pill className={t.enRetard ? 'pill--risque' : 'pill--neutre'}>
                  {t.echeance ? `${t.enRetard ? 'échue le' : 'échéance'} ${formatDate(t.echeance)}` : 'sans échéance'}
                </Pill>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AbsencesList({
  slug,
  view,
  pending,
  onCount,
}: {
  slug: string;
  view: TeamsView;
  pending: number | null;
  onCount: (n: number) => void;
}) {
  return (
    <>
      <AbsencesADecider slug={slug} onCompte={onCount} />
      {pending === 0 && (
        <section className="panel glass-panel eq-liste">
          <h2>Absences à décider · 0</h2>
          <p className="eq-aide">
            Aucune demande n’attend votre décision. {view.indicateurs.absencesEnAttente} demande(s) attendent leur N+1
            dans la société.
          </p>
        </section>
      )}
    </>
  );
}
