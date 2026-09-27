'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Hammer,
  RefreshCw,
  Ruler,
  Search,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getTableauBordSociete } from '@/lib/tableau-bord';
import { useTitrePage } from '@/lib/layout-contexte';
import type {
  PeriodeTableauBord,
  StatutJalon,
  StatutProjetExec,
  TableauBordSociete,
} from '@/lib/types';
import { CATEGORIES, STATUTS_PROJET_EXEC } from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { StatCard } from '@/components/admin/stat-card';
import { AreaChart } from '@/components/admin/area-chart';
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
const ORDRE_STATUT: Record<StatutProjetExec, number> = {
  a_assigner: 0,
  assigne: 1,
  en_cours: 2,
  livre: 3,
};

// Source d'un jalon, lue depuis le préfixe de son id (`ap:` / `permis:` / `lot:`
// / `etude:`) — repère visuel en plus du libellé.
const ICONE_SOURCE: Record<string, LucideIcon> = {
  ap: FileText,
  permis: Stamp,
  lot: Hammer,
  etude: Ruler,
};

type ColonneTri = 'nom' | 'avancement' | 'statut';

// Date relative courte pour un jalon proche : « En retard » / « Auj. » /
// « Demain », sinon la date courte.
function labelDateJalon(dateIso: string): string {
  const jours = Math.ceil(
    (Date.parse(`${dateIso}T12:00:00`) - Date.now()) / 86_400_000,
  );
  if (Number.isNaN(jours)) return formatDateCourte(dateIso);
  if (jours < 0) return 'En retard';
  if (jours === 0) return 'Auj.';
  if (jours === 1) return 'Demain';
  return formatDateCourte(dateIso);
}

// Back-office d'une société — réservé à societe_admin (auth + redirect gérés
// par app/admin/[slug]/layout.tsx, voir destinationForSession).
export default function AdminPage({ params }: Props) {
  useTitrePage('Tableau de bord');
  const [periode, setPeriode] = useState<PeriodeTableauBord>('mois');
  const [tableau, setTableau] = useState<TableauBordSociete | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0); // « Réessayer » ré-déclenche le fetch

  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<{ col: ColonneTri; sens: 1 | -1 }>({
    col: 'statut',
    sens: 1,
  });

  useEffect(() => {
    let annule = false;
    setTableau(null);
    setErreur(null);
    getTableauBordSociete(params.slug, periode)
      .then((donnees) => {
        if (!annule) setTableau(donnees);
      })
      .catch((e) => {
        if (!annule) {
          // ApiError = réponse HTTP en échec (message métier NestJS) ;
          // sinon = réseau / serveur injoignable.
          setErreur(
            e instanceof ApiError
              ? e.message
              : 'Impossible de charger le tableau de bord — le serveur ne répond pas.',
          );
        }
      });
    return () => {
      annule = true;
    };
  }, [params.slug, periode, essai]);

  const projetsAffiches = useMemo(() => {
    if (!tableau) return [];
    const q = recherche.trim().toLowerCase();
    const filtres = q
      ? tableau.projets.filter((p) =>
          `${p.nom} ${p.client}`.toLowerCase().includes(q),
        )
      : tableau.projets;
    return [...filtres].sort((a, b) => {
      const d =
        tri.col === 'nom'
          ? a.nom.localeCompare(b.nom)
          : tri.col === 'avancement'
            ? a.avancement - b.avancement
            : ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut];
      return d * tri.sens;
    });
  }, [tableau, recherche, tri]);

  function trierPar(col: ColonneTri) {
    setTri((t) => (t.col === col ? { col, sens: t.sens === 1 ? -1 : 1 } : { col, sens: 1 }));
  }

  const fleche = (col: ColonneTri) =>
    tri.col !== col ? null : tri.sens === 1 ? (
      <ArrowUp size={12} strokeWidth={2.5} aria-hidden />
    ) : (
      <ArrowDown size={12} strokeWidth={2.5} aria-hidden />
    );

  return (
    <>
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

      {erreur ? (
        <div className="dash-erreur" role="alert">
          <p>{erreur}</p>
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            onClick={() => setEssai((n) => n + 1)}
          >
            <RefreshCw size={15} strokeWidth={2} aria-hidden />
            <span>Réessayer</span>
          </button>
        </div>
      ) : !tableau ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="admin-stat-grid">
            {tableau.kpis.map((kpi) => (
              <StatCard key={kpi.cle} kpi={kpi} />
            ))}
          </section>

          <section className="admin-grid">
            <div className="panel glass-panel">
              <h2 className="panel-title">{tableau.projetsSignesParPeriode.titre}</h2>
              <AreaChart data={tableau.projetsSignesParPeriode} />
            </div>

            <div className="admin-col">
              <div className="panel glass-panel">
                <h2 className="panel-title">Échéances à venir</h2>
                {tableau.jalons.length === 0 ? (
                  <p className="jalon-vide">Aucune échéance à venir sur les projets actifs.</p>
                ) : (
                  <ul className="jalons">
                    {tableau.jalons.map((jalon) => {
                      const Icone = ICONE_SOURCE[jalon.id.split(':')[0]] ?? FileText;
                      const urgent = jalon.statut === 'a_risque';
                      return (
                        <li
                          className={`jalon${urgent ? ' jalon--urgent' : ''}`}
                          key={jalon.id}
                        >
                          <span
                            className={`jalon-date${urgent ? ' jalon-date--urgent' : ''}`}
                          >
                            {labelDateJalon(jalon.date)}
                          </span>
                          <span className="jalon-source" aria-hidden>
                            <Icone size={14} strokeWidth={1.75} />
                          </span>
                          <span className="jalon-corps">
                            <span className="jalon-op">{jalon.projet}</span>
                            <span className="jalon-type">{jalon.type}</span>
                          </span>
                          <span className={`pill ${PILL_JALON[jalon.statut].classe}`}>
                            {PILL_JALON[jalon.statut].libelle}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="panel glass-panel">
                <RadialGauge
                  data={tableau.avancementMoyen}
                  libelle="Avancement moyen des projets actifs"
                  sousTexte={
                    tableau.projets.length === 0
                      ? 'Aucun projet actif'
                      : tableau.avancementMoyen.pourcentage === 0
                        ? 'Aucune checklist d’avant-projet démarrée'
                        : `Checklists d’avant-projet · ${tableau.projets.length} projet${
                            tableau.projets.length > 1 ? 's' : ''
                          } actif${tableau.projets.length > 1 ? 's' : ''}`
                  }
                />
              </div>
            </div>
          </section>

          <section className="panel glass-panel">
            <div className="panel-tete">
              <h2 className="panel-title panel-title--inline">
                Projets en cours
                <span className="panel-compte">{projetsAffiches.length}</span>
              </h2>
              {tableau.projets.length > 0 && (
                <div className="champ-recherche dash-recherche">
                  <Search size={15} strokeWidth={1.75} aria-hidden />
                  <input
                    type="search"
                    className="field-input"
                    placeholder="Filtrer par projet ou client…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                </div>
              )}
            </div>

            {tableau.projets.length === 0 ? (
              <p className="empty-state empty-state--bloc">
                Aucun projet actif pour cette société.
              </p>
            ) : projetsAffiches.length === 0 ? (
              <p className="empty-state empty-state--bloc">
                Aucun projet ne correspond à « {recherche.trim()} ».
              </p>
            ) : (
              <div className="admin-table-wrap admin-table-wrap--fixe dash-table">
                <table className="admin-table admin-table--triable">
                  <thead>
                    <tr>
                      <th>
                        <button type="button" onClick={() => trierPar('nom')}>
                          Projet {fleche('nom')}
                        </button>
                      </th>
                      <th>Catégorie</th>
                      <th>Client</th>
                      <th>
                        <button type="button" onClick={() => trierPar('avancement')}>
                          Avancement {fleche('avancement')}
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => trierPar('statut')}>
                          Statut {fleche('statut')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projetsAffiches.map((projet) => (
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
                                // Même famille de couleur que la pastille de statut juste à
                                // côté (attention/info/succès/neutre) : la barre porte le même
                                // sens plutôt qu'une teinte de marque uniforme.
                                className={`progress-fill progress-fill--${CLASSE_STATUT_PROJET[
                                  projet.statut
                                ].replace('pill--', '')}`}
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
            )}
          </section>
        </>
      )}
    </>
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
      <div className="skeleton admin-skeleton-panel" />
    </div>
  );
}
