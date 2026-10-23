'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlarmClock, CircleCheck, FolderKanban, ListTodo } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getMaCellule } from '@/lib/mon-espace';
import { NIVEAUX_COLLABORATEUR, PHASES, type MaCellule as DonneesCellule, type StatsPerformances } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { FicheContactModal } from '@/components/contacts/fiche-contact';
import { Avatar } from './avatar';

// « Mon espace » · Ma cellule (maquette du boss) : projets pilotés, tâches en
// cours, en retard et remises à temps de toute la cellule ; ses membres et son
// pilote (chef de team) ; ses projets. Aucun montant. Même écran sans cellule.
export function MaCellule({ slug }: { slug: string }) {
  const base = usePathname().split('/mon-espace')[0];
  const [donnees, setDonnees] = useState<{ cellule: DonneesCellule | null; stats: StatsPerformances } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    getMaCellule(slug)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger votre cellule.'));
  }, [slug]);

  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (!donnees) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }
  const { cellule, stats } = donnees;
  const rd = stats.respectDelais;
  const projets = cellule?.projets ?? [];

  return (
    <>
      <KpiStrip
        tuiles={[
          { cle: 'projets', label: 'Projets pilotés', valeur: projets.length, sousTexte: 'projets signés de la cellule', icone: FolderKanban },
          { cle: 'en-cours', label: 'Tâches en cours', valeur: stats.enCours, sousTexte: 'toute la cellule', icone: ListTodo },
          { cle: 'retard', label: 'En retard', valeur: stats.enRetard, sousTexte: 'tâches hors délai', icone: AlarmClock, etat: stats.enRetard > 0 ? 'risque' : 'succes' },
          {
            cle: 'a-temps',
            label: 'Tâches remises à temps',
            valeur: rd.pct == null ? '—' : `${rd.pct} %`,
            sousTexte: `${stats.validees} validées dans la cellule`,
            icone: CircleCheck,
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
                    <Avatar nom={m.nom} photo={m.photo} taille="sm" />
                    <span>
                      <strong>{m.nom}</strong>
                      <span className="cell-sub">
                        {m.role} · {NIVEAUX_COLLABORATEUR[m.niveau]}
                      </span>
                    </span>
                  </button>
                  <span className="dmd-actions">
                    {m.estChef && <span className="pill pill--info">Pilote</span>}
                    {m.estMoi && <span className="pill pill--neutre">Vous</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="dmd-note me-pied">L’équipe est évaluée sur ses projets. Aucun montant n’est affiché aux équipes.</p>
          {contact && <FicheContactModal slug={slug} utilisateurId={contact} onClose={() => setContact(null)} />}
        </section>
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Projets pilotés par la cellule</h2>
          {projets.length === 0 ? (
            <p className="dmd-note">Aucun projet affecté à la cellule.</p>
          ) : (
            <ul className="dmd-liste">
              {projets.map((p) => (
                <li key={p.id} className="dmd-ligne">
                  <span>
                    <Link className="lien-inline" href={`${base}/projets?projet=${p.id}`}>
                      <strong>{p.code}</strong>
                    </Link>
                    <span className="cell-sub">{p.programme}</span>
                  </span>
                  <span className="pill pill--neutre">{PHASES[p.phase]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
