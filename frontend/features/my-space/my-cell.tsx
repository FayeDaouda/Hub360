'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlarmClock, CircleCheck, FolderKanban, ListTodo } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { EMPLOYEE_LEVELS } from '@/features/teams/constants';
import { PHASES } from '@/lib/types';
import { KpiStrip } from '@/components/ui/kpi';
import { FicheContactModal } from '@/components/contacts/fiche-contact';
import { PersonAvatar } from '@/components/ui/avatar';
import { Pill } from '@/components/ui/pill';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { getMyCell } from './api';
import type { MyCellView } from './types';

// « Mon espace » · Ma cellule (maquette du boss) : projets pilotés, tâches en
// cours, en retard et remises à temps de toute la cellule ; ses membres et son
// pilote (chef de team) ; ses projets. Aucun montant. Même écran sans cellule.
export function MyCell({ slug }: { slug: string }) {
  const base = usePathname().split('/mon-espace')[0];
  const [data, setData] = useState<MyCellView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    getMyCell(slug)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Impossible de charger votre cellule.'));
  }, [slug]);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (!data) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }
  const { cellule, stats } = data;
  const onTime = stats.respectDelais;
  const projects = cellule?.projets ?? [];

  return (
    <>
      <KpiStrip
        tiles={[
          {
            id: 'projets',
            label: 'Projets pilotés',
            value: projects.length,
            hint: 'projets signés de la cellule',
            icon: FolderKanban,
          },
          {
            id: 'en-cours',
            label: 'Tâches en cours',
            value: stats.enCours,
            hint: 'toute la cellule',
            icon: ListTodo,
          },
          {
            id: 'retard',
            label: 'En retard',
            value: stats.enRetard,
            hint: 'tâches hors délai',
            icon: AlarmClock,
            state: stats.enRetard > 0 ? 'risque' : 'succes',
          },
          {
            id: 'a-temps',
            label: 'Tâches remises à temps',
            value: onTime.pct == null ? '—' : `${onTime.pct} %`,
            hint: `${stats.validees} validées dans la cellule`,
            icon: CircleCheck,
          },
        ]}
      />
      <div className="me-colonnes">
        <section className="panel glass-panel dmd-section me-cellule">
          <div className="me-cellule-tete">
            <h2 className="dmd-titre">{cellule?.nom ?? 'sans cellule'}</h2>
            <span className="dmd-note">{cellule?.pilote ? `Pilote : ${cellule.pilote}` : 'Pilote à désigner'}</span>
          </div>
          {cellule && (
            <ul className="dmd-liste">
              {cellule.membres.map((m) => (
                <li key={m.id} className="dmd-ligne">
                  {/* Collègue avec un compte : sa fiche contact (téléphone, e-mail). */}
                  <button
                    type="button"
                    className="me-membre"
                    disabled={!m.utilisateurId || m.estMoi}
                    onClick={() => m.utilisateurId && setContact(m.utilisateurId)}
                    title={m.utilisateurId && !m.estMoi ? 'Voir sa fiche contact' : undefined}
                  >
                    <PersonAvatar name={m.nom} photo={m.photo} size="sm" />
                    <span>
                      <strong>{m.nom}</strong>
                      <span className="cell-sub">
                        {m.role} · {EMPLOYEE_LEVELS[m.niveau]}
                      </span>
                    </span>
                  </button>
                  <span className="dmd-actions">
                    {m.estChef && <Pill tone="info">Pilote</Pill>}
                    {m.estMoi && <Pill tone="neutre">Vous</Pill>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="dmd-note me-pied">
            L’équipe est évaluée sur ses projets. Aucun montant n’est affiché aux équipes.
          </p>
          {contact && <FicheContactModal slug={slug} utilisateurId={contact} onClose={() => setContact(null)} />}
        </section>
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Projets pilotés par la cellule</h2>
          {projects.length === 0 ? (
            <p className="dmd-note">Aucun projet affecté à la cellule.</p>
          ) : (
            <ul className="dmd-liste">
              {projects.map((p) => (
                <li key={p.id} className="dmd-ligne">
                  <span>
                    <Link className="lien-inline" href={`${base}/projets?projet=${p.id}`}>
                      <strong>{p.code}</strong>
                    </Link>
                    <span className="cell-sub">{p.programme}</span>
                  </span>
                  <Pill tone="neutre">{PHASES[p.phase]}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
