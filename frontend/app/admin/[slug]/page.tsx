'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSociete } from '@/lib/api';
import { getTableauBordSociete } from '@/lib/tableau-bord';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import type {
  PeriodeTableauBord,
  Session,
  Societe,
  StatutJalon,
  StatutProjetExec,
  TableauBordSociete,
} from '@/lib/types';
import { CATEGORIES, STATUTS_PROJET_EXEC } from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';
import { StatCard } from '@/components/admin/stat-card';
import { BarChart } from '@/components/admin/bar-chart';
import { RadialGauge } from '@/components/admin/radial-gauge';

type Props = {
  params: { slug: string };
};

const PERIODES: { cle: PeriodeTableauBord; libelle: string }[] = [
  { cle: 'jour', libelle: 'Jour' },
  { cle: 'semaine', libelle: 'Semaine' },
  { cle: 'mois', libelle: 'Mois' },
  { cle: 'annee', libelle: 'Année' },
];

const PILL_JALON: Record<StatutJalon, { classe: string; libelle: string }> = {
  a_faire: { classe: 'pill--info', libelle: 'À faire' },
  en_attente: { classe: 'pill--neutre', libelle: 'En attente' },
  a_risque: { classe: 'pill--risque', libelle: 'À risque' },
  fait: { classe: 'pill--succes', libelle: 'Fait' },
};

// Classe de pastille par statut d'assignation (enum Prisma StatutProjetExec) ;
// le libellé vient de STATUTS_PROJET_EXEC.
const CLASSE_STATUT_PROJET: Record<StatutProjetExec, string> = {
  a_assigner: 'pill--attention',
  assigne: 'pill--neutre',
  en_cours: 'pill--info',
  livre: 'pill--succes',
};

// Back-office d'une société — réservé à societe_admin. Les autres rôles sont
// renvoyés vers leur propre destination (voir destinationForSession).
export default function AdminPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [periode, setPeriode] = useState<PeriodeTableauBord>('mois');
  const [tableau, setTableau] = useState<TableauBordSociete | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'societe_admin') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug)
      .then(setSociete)
      .catch(() => setSociete(null));
  }, [params.slug, router]);

  useEffect(() => {
    if (!session) return;
    let annule = false;
    setTableau(null);
    getTableauBordSociete(params.slug, periode).then((donnees) => {
      if (!annule) setTableau(donnees);
    });
    return () => {
      annule = true;
    };
  }, [session, params.slug, periode]);

  if (!session) return null;

  return (
    <AdminShell
      societe={societe}
      session={session}
      active="tableau-de-bord"
      titre="Tableau de bord"
    >
      <div className="admin-periode">
        <div className="admin-periode-toggle" role="group" aria-label="Période">
          {PERIODES.map((p) => (
            <button
              key={p.cle}
              type="button"
              className={p.cle === periode ? 'is-active' : ''}
              aria-pressed={p.cle === periode}
              onClick={() => setPeriode(p.cle)}
            >
              {p.libelle}
            </button>
          ))}
        </div>
        <span className="admin-periode-label">{tableau?.libellePeriode ?? '—'}</span>
      </div>

      {!tableau ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="admin-stat-grid">
            {tableau.kpis.map((kpi, index) => (
              <StatCard key={kpi.cle} kpi={kpi} accent={index === 0} />
            ))}
          </section>

          <section className="admin-grid">
            <div className="panel">
              <h2 className="panel-title">{tableau.projetsSignesParPeriode.titre}</h2>
              <BarChart data={tableau.projetsSignesParPeriode} />
            </div>

            <div className="admin-col">
              <div className="panel">
                <h2 className="panel-title">Échéances à venir</h2>
                <ul className="jalons">
                  {tableau.jalons.map((jalon) => (
                    <li className="jalon" key={jalon.id}>
                      <span className="jalon-date">{formatDateCourte(jalon.date)}</span>
                      <span className="jalon-corps">
                        <span className="jalon-op">{jalon.projet}</span>
                        <span className="jalon-type">{jalon.type}</span>
                      </span>
                      <span className={`pill ${PILL_JALON[jalon.statut].classe}`}>
                        {PILL_JALON[jalon.statut].libelle}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="panel">
                <RadialGauge
                  data={tableau.avancementMoyen}
                  libelle="Avancement moyen des projets actifs"
                  sousTexte={
                    tableau.projets.length
                      ? `Checklists d’avant-projet · ${tableau.projets.length} projet${
                          tableau.projets.length > 1 ? 's' : ''
                        } actif${tableau.projets.length > 1 ? 's' : ''}`
                      : 'Aucun projet actif'
                  }
                />
              </div>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Projets en cours</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Projet</th>
                    <th>Catégorie</th>
                    <th>Client</th>
                    <th>Avancement</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {tableau.projets.map((projet) => (
                    <tr key={projet.id}>
                      <td data-label="Projet">{projet.nom}</td>
                      <td data-label="Catégorie">
                        <span className={`pill pill--cat-${projet.categorie}`}>
                          {CATEGORIES[projet.categorie]}
                        </span>
                        {projet.promotionInterne && (
                          <span className="pill pill--nature-promotion_interne">
                            Promotion interne
                          </span>
                        )}
                      </td>
                      <td data-label="Client">{projet.client}</td>
                      <td data-label="Avancement">
                        <span className="progress">
                          <span className="progress-track">
                            <span
                              className="progress-fill"
                              style={{ width: `${projet.avancement}%` }}
                            />
                          </span>
                          <span className="progress-val">{projet.avancement} %</span>
                        </span>
                      </td>
                      <td data-label="Statut">
                        <span className={`pill ${CLASSE_STATUT_PROJET[projet.statut]}`}>
                          {STATUTS_PROJET_EXEC[projet.statut]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}

function DashboardSkeleton() {
  return (
    <div className="admin-skeleton" aria-hidden>
      <div className="admin-stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton admin-skeleton-card" />
        ))}
      </div>
      <div className="admin-grid">
        <div className="skeleton admin-skeleton-panel" />
        <div className="admin-col">
          <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" />
          <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" />
        </div>
      </div>
      <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" />
    </div>
  );
}
