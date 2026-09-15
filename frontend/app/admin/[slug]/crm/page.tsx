'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, CheckCircle2, Plus, Sparkles, Workflow, X, XCircle } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { changerStatut, getClients, getProjets } from '@/lib/crm';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  CATEGORIES,
  GAMMES,
  NATURES_DOSSIER,
  STANDINGS,
  STATUTS_CRM,
  STATUTS_ORDRE,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Client,
  type Projet,
  type Session,
  type Societe,
  type StatutCrm,
} from '@/lib/types';
import { formatPourcent, formatSurface } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';
import { NouveauProjetModal } from '@/components/admin/nouveau-projet-modal';
import { DetailDossierModal } from '@/components/admin/detail-dossier-modal';
import { KpiFunnel, KpiStrip } from '@/components/admin/kpi-strip';

type Props = {
  params: { slug: string };
};

const STATUT_MODIF: Record<StatutCrm, string> = {
  nouveau: 'nouveau',
  devis_contrat: 'devis',
  valide: 'valide',
  annule: 'annule',
};

// Filtre posé en cliquant une tuile KPI — bascule (reclic = on l'enlève),
// combiné à la recherche texte. 'actif' = pipeline (nouveau + devis_contrat),
// comme la valeur affichée sur la tuile « Pipeline actif ».
type FiltreTuile = 'actif' | 'valide' | 'neufs' | 'annule';

const LABEL_FILTRE_TUILE: Record<FiltreTuile, string> = {
  actif: 'Pipeline actif',
  valide: 'Validés',
  neufs: 'Nouveaux (30 j)',
  annule: 'Annulés',
};

export default function CrmPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projets, setProjets] = useState<Projet[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [recherche, setRecherche] = useState('');
  const [filtreTuile, setFiltreTuile] = useState<FiltreTuile | null>(null);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [nouveauId, setNouveauId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Détail ouvert depuis la liste condensée mobile — id plutôt qu'une copie
  // du projet, pour rester à jour après un changement de statut optimiste.
  const [detailId, setDetailId] = useState<string | null>(null);

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
    getProjets(params.slug).then(setProjets);
    getClients(params.slug).then(setClients);
  }, [params.slug, router]);

  const filtres = useMemo(() => {
    if (!projets) return [];
    let liste = projets;
    if (filtreTuile === 'actif') {
      liste = liste.filter((p) => p.statut === 'nouveau' || p.statut === 'devis_contrat');
    } else if (filtreTuile === 'valide' || filtreTuile === 'annule') {
      liste = liste.filter((p) => p.statut === filtreTuile);
    } else if (filtreTuile === 'neufs') {
      const il30j = Date.now() - 30 * 86_400_000;
      liste = liste.filter((p) => +new Date(p.creeLe) >= il30j);
    }
    const q = recherche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter((p) =>
      [p.code, p.localisation, p.programme, p.client.nom, TYPES_BIEN[p.type]]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [projets, recherche, filtreTuile]);

  function basculerFiltre(cle: FiltreTuile) {
    setFiltreTuile((actuel) => (actuel === cle ? null : cle));
  }

  // Dérivé de `projets` (pas une copie figée) : reflète tout de suite un
  // changement de statut fait depuis la modale, sans avoir à la resynchroniser.
  const detailProjet = detailId ? (projets ?? []).find((p) => p.id === detailId) ?? null : null;

  // KPI — sur la liste complète (snapshot global), indépendant de la recherche.
  const kpi = useMemo(() => {
    const liste = projets ?? [];
    const par = (s: StatutCrm) => liste.filter((p) => p.statut === s).length;
    const nouveau = par('nouveau');
    const devis = par('devis_contrat');
    const valide = par('valide');
    const annule = par('annule');
    const clos = valide + annule;
    const il30j = Date.now() - 30 * 86_400_000;
    const il60j = Date.now() - 60 * 86_400_000;
    const nouveaux30j = liste.filter((p) => +new Date(p.creeLe) >= il30j).length;
    // Vraie période de comparaison (30-60 j) — pour la flèche de tendance de
    // la tuile. Pas de flèche sinon : on ne met jamais une valeur inventée.
    const nouveauxPrecedents30j = liste.filter((p) => {
      const t = +new Date(p.creeLe);
      return t >= il60j && t < il30j;
    }).length;
    return {
      pipelineActif: nouveau + devis,
      valide,
      annule,
      tauxConversion: clos > 0 ? Math.round((valide / clos) * 100) : null,
      nouveaux30j,
      nouveauxPrecedents30j,
      funnel: [
        { cle: 'nouveau', label: 'Nouveau', valeur: nouveau },
        { cle: 'devis_contrat', label: 'Devis / contrat', valeur: devis },
        { cle: 'valide', label: 'Validé', valeur: valide },
        { cle: 'annule', label: 'Annulé', valeur: annule },
      ],
      nature: {
        mandat: liste.filter((p) => p.nature === 'mandat_client').length,
        promotion: liste.filter((p) => p.nature === 'promotion_interne').length,
      },
    };
  }, [projets]);

  if (!session) return null;

  function onCree(projet: Projet) {
    setProjets((actuels) => [projet, ...(actuels ?? [])]);
    setClients((actuels) =>
      actuels.some((c) => c.id === projet.client.id) ? actuels : [...actuels, projet.client],
    );
    setNouveauId(projet.id);
    setRecherche('');
  }

  async function onChangerStatut(dossier: Projet, statut: StatutCrm) {
    // maj optimiste
    setProjets((actuels) =>
      (actuels ?? []).map((p) => (p.id === dossier.id ? { ...p, statut } : p)),
    );
    const { projetCree } = await changerStatut(params.slug, dossier.id, statut);
    if (projetCree) {
      const etape = STATUTS_CRM[dossier.nature].valide.toLowerCase();
      setMessage(
        `Dossier ${dossier.code} — ${etape} : projet créé dans « Projets », à assigner.`,
      );
    }
  }

  return (
    <AdminShell societe={societe} session={session} active="crm" titre="CRM">
      <div className="projets-toolbar">
        <div className="projets-toolbar-info">
          <input
            type="search"
            className="field-input projets-recherche"
            placeholder="Rechercher un code, une localisation, un programme, un client…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {projets && (
            <span className="projets-compte">
              {filtres.length} projet{filtres.length > 1 ? 's' : ''}
              {(recherche || filtreTuile) && ` sur ${projets.length}`}
            </span>
          )}
          {filtreTuile && (
            <button
              type="button"
              className="chip chip--filtre"
              onClick={() => setFiltreTuile(null)}
            >
              {LABEL_FILTRE_TUILE[filtreTuile]}
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </div>
        <button type="button" className="btn-primary" onClick={() => setModalOuvert(true)}>
          <Plus size={16} strokeWidth={2} aria-hidden />
          <span>Nouveau projet</span>
        </button>
      </div>

      {message && (
        <div className="crm-banner" role="status">
          <span>{message}</span>
          <button type="button" aria-label="Fermer" onClick={() => setMessage(null)}>
            ×
          </button>
        </div>
      )}

      {projets && projets.length > 0 && (
        <>
          <KpiStrip
            tuiles={[
              {
                cle: 'actif',
                label: 'Pipeline actif',
                valeur: kpi.pipelineActif,
                icone: Workflow,
                // Icône purement décorative (aucune série réelle derrière) —
                // pas un graphique, un repère visuel assumé comme tel.
                decorIcone: BarChart3,
                action: {
                  type: 'filtre',
                  actif: filtreTuile === 'actif',
                  onClick: () => basculerFiltre('actif'),
                },
              },
              {
                cle: 'valide',
                label: 'Validés',
                valeur: kpi.valide,
                icone: CheckCircle2,
                accentSens: 'sauge',
                // Anneau réel : même valeur que le sous-texte, juste visualisée.
                ringPourcentage: kpi.tauxConversion ?? undefined,
                sousTexte:
                  kpi.tauxConversion === null
                    ? undefined
                    : `Taux de conversion ${formatPourcent(kpi.tauxConversion)}`,
                action: {
                  type: 'filtre',
                  actif: filtreTuile === 'valide',
                  onClick: () => basculerFiltre('valide'),
                },
              },
              {
                cle: 'neufs',
                label: 'Nouveaux (30 j)',
                valeur: kpi.nouveaux30j,
                icone: Sparkles,
                accentSens: 'argile',
                tendance: {
                  sens:
                    kpi.nouveaux30j > kpi.nouveauxPrecedents30j
                      ? 'hausse'
                      : kpi.nouveaux30j < kpi.nouveauxPrecedents30j
                        ? 'baisse'
                        : 'stable',
                  // Delta réel (30j vs 30j précédents) — jamais une valeur inventée.
                  court: `${kpi.nouveaux30j - kpi.nouveauxPrecedents30j >= 0 ? '+' : '−'}${Math.abs(
                    kpi.nouveaux30j - kpi.nouveauxPrecedents30j,
                  )}`,
                  texte: `${kpi.nouveauxPrecedents30j} sur les 30 j précédents`,
                },
                action: {
                  type: 'filtre',
                  actif: filtreTuile === 'neufs',
                  onClick: () => basculerFiltre('neufs'),
                },
              },
              {
                // Métrique volontairement sobre : pas d'accentSens, pas de
                // tendance, tuile atténuée — on ne « célèbre » pas les
                // annulations. Reste filtrable comme les autres.
                cle: 'annule',
                label: 'Annulés',
                valeur: kpi.annule,
                icone: XCircle,
                attenue: true,
                action: {
                  type: 'filtre',
                  actif: filtreTuile === 'annule',
                  onClick: () => basculerFiltre('annule'),
                },
              },
            ]}
          />
          <KpiFunnel segments={kpi.funnel} natureSplit={kpi.nature} />
        </>
      )}

      <section className="panel">
        {!projets ? (
          <div className="admin-skeleton" aria-hidden>
            <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" />
          </div>
        ) : filtres.length === 0 ? (
          <p className="empty-state">
            {recherche || filtreTuile
              ? 'Aucun projet ne correspond à ce filtre.'
              : 'Aucun projet pour le moment. Crée le premier avec « Nouveau projet ».'}
          </p>
        ) : (
          <>
            {/* Mobile : liste condensée à une ligne (tap -> détail en modale),
                dans un bloc à hauteur limitée plutôt que toute la page qui
                scrolle. Le tableau desktop ci-dessous reste inchangé. */}
            <div className="crm-liste-mobile">
              <ul className="crm-liste">
                {filtres.map((projet) => (
                  <li key={projet.id}>
                    <button
                      type="button"
                      className="crm-ligne"
                      aria-haspopup="dialog"
                      onClick={() => setDetailId(projet.id)}
                    >
                      <span className="crm-ligne-txt">
                        <span className="crm-ligne-code">{projet.code}</span>
                        <span className="crm-ligne-nom">{projet.programme}</span>
                      </span>
                      <span
                        className={`pill crm-ligne-statut statut-select--${STATUT_MODIF[projet.statut]}`}
                      >
                        {STATUTS_CRM[projet.nature][projet.statut]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="admin-table-wrap crm-liste-desktop">
              <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Nature</th>
                  <th>Localisation</th>
                  <th>Type</th>
                  <th>Planches</th>
                  <th>Surface</th>
                  <th>Client</th>
                  <th>Standing</th>
                  <th>Gamme</th>
                  <th>Programme</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((projet) => (
                  <tr
                    key={projet.id}
                    className={projet.id === nouveauId ? 'is-nouveau' : undefined}
                  >
                    <td data-label="Code projet" className="cell-code">
                      {projet.code}
                    </td>
                    <td data-label="Nature">
                      <span className="cell-stack">
                        <span className={`pill pill--nature-${projet.nature}`}>
                          {NATURES_DOSSIER[projet.nature]}
                        </span>
                        <span className="cell-sub">{CATEGORIES[projet.categorie]}</span>
                      </span>
                    </td>
                    <td data-label="Localisation">{projet.localisation}</td>
                    <td data-label="Type">{TYPES_BIEN[projet.type]}</td>
                    <td data-label="Planches">{projet.nbPlanches || '—'}</td>
                    <td data-label="Surface terrain">{formatSurface(projet.surfaceTerrain)}</td>
                    <td data-label="Client">
                      <span className="cell-stack">
                        <span className="cell-fort">{projet.client.nom}</span>
                        <span className="cell-sub">
                          <span className="pill pill--neutre">
                            {TYPES_CLIENT[projet.client.type]}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Standing">{STANDINGS[projet.standing]}</td>
                    <td data-label="Gamme">{GAMMES[projet.gamme]}</td>
                    <td data-label="Programme">{projet.programme}</td>
                    <td data-label="Statut">
                      <select
                        className={`statut-select statut-select--${STATUT_MODIF[projet.statut]}`}
                        value={projet.statut}
                        aria-label={`Statut de ${projet.code}`}
                        onChange={(e) => onChangerStatut(projet, e.target.value as StatutCrm)}
                      >
                        {STATUTS_ORDRE.map((s) => (
                          <option key={s} value={s}>
                            {STATUTS_CRM[projet.nature][s]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {modalOuvert && (
        <NouveauProjetModal
          slug={params.slug}
          clients={clients}
          onClose={() => setModalOuvert(false)}
          onCree={onCree}
        />
      )}

      {detailProjet && (
        <DetailDossierModal
          projet={detailProjet}
          onClose={() => setDetailId(null)}
          onChangerStatut={(statut) => onChangerStatut(detailProjet, statut)}
        />
      )}
    </AdminShell>
  );
}
