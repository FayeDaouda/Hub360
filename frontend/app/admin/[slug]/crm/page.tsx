'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, CheckCircle2, Plus, Search, Sparkles, Workflow, X, XCircle } from 'lucide-react';
import {
  agirSurDossier,
  changerProprietaire,
  getClients,
  getProjets,
  getProprietairesPossibles,
  rattacherLocalite,
} from '@/lib/crm';
import { getLocalites } from '@/lib/localites';
import { getProduitsServices } from '@/lib/devis';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { CLASSE_STATUT, type ActionCrm } from '@/lib/cycle-crm';
import {
  CATEGORIES,
  GAMMES,
  NATURES_DOSSIER,
  STANDINGS,
  STATUTS_CRM,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Client,
  type Localite,
  type Personne,
  type ProduitService,
  type Projet,
  type StatutCrm,
} from '@/lib/types';
import { formatPourcent, formatSurface } from '@/lib/format';
import { NouveauProjetModal } from '@/components/admin/nouveau-projet-modal';
import { DetailDossierModal } from '@/components/admin/detail-dossier-modal';
import { KpiFunnel, KpiStrip } from '@/components/admin/kpi-strip';

// Même palette de dégradés que le tableau de bord (demande boss, sept.
// 2026 : chaque KPI a sa propre couleur vive) — un point de vérité par
// page, cf. le commentaire `degrade` dans KpiTuile. Choix sémantique par
// tuile, pas juste positionnel : Validés en vert (succès), Annulés dans le
// même dégradé chaud que « Retards » en facturation (signal d'attention).
const DEGRADE_KPI: Record<string, { a: string; b: string }> = {
  actif: { a: '#2e3192', b: '#1bffff' }, // Ocean Blue
  valide: { a: '#11998e', b: '#38ef7d' }, // Quepal
  neufs: { a: '#764ba2', b: '#667eea' }, // Plum Plate
  annule: { a: '#ff5f6d', b: '#ffc371' }, // Sweet Morning
};

type Props = {
  params: { slug: string };
};

// Filtre posé en cliquant une tuile KPI — bascule (reclic = on l'enlève),
// combiné à la recherche texte. 'actif' = pipeline (les 3 statuts non
// définitifs), comme la valeur affichée sur la tuile « Pipeline actif ».
type FiltreTuile = 'actif' | 'onboard' | 'neufs' | 'perdu';

const LABEL_FILTRE_TUILE: Record<FiltreTuile, string> = {
  actif: 'Pipeline actif',
  onboard: 'Onboard',
  neufs: 'Nouveaux (30 j)',
  perdu: 'Perdus',
};

const STATUTS_ACTIFS: StatutCrm[] = ['nouveau_projet', 'en_validation', 'offre_envoyee'];

export default function CrmPage({ params }: Props) {
  useTitrePage('CRM');
  const session = useSessionCourante();
  // Lecture seule pour un rôle qui n'a que la lecture sur le CRM (CFO, CEO…)
  // — affichage seulement, le serveur refuse de toute façon l'écriture.
  const peutEcrire = niveauSuffisant(session, 'crm', 'ecriture');
  // Offre d'un dossier (étape F) : voir = finances_devis lecture, préparer /
  // relancer / saisir la réponse = écriture (le Dir. GC, pas le COO).
  const voitOffres = niveauSuffisant(session, 'finances_devis', 'lecture');
  const peutPreparerOffre = niveauSuffisant(session, 'finances_devis', 'ecriture');
  const [catalogue, setCatalogue] = useState<ProduitService[]>([]);
  const [projets, setProjets] = useState<Projet[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  // Référentiel des localités — chargé une fois, partagé par la création et
  // le rattachement. null = en cours (les listes s'affichent désactivées).
  const [localites, setLocalites] = useState<Localite[] | null>(null);
  const [proprietaires, setProprietaires] = useState<Personne[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtreTuile, setFiltreTuile] = useState<FiltreTuile | null>(null);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [nouveauId, setNouveauId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Détail ouvert depuis la liste condensée mobile — id plutôt qu'une copie
  // du projet, pour rester à jour après un changement de statut optimiste.
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    getProjets(params.slug).then(setProjets);
    getClients(params.slug).then(setClients);
    getLocalites(params.slug).then(setLocalites);
    getProprietairesPossibles(params.slug).then(setProprietaires);
    // Catalogue : liste de choix des lignes d'offre (lecture ouverte aux
    // préparateurs d'offre) — inutile à charger sinon.
    if (voitOffres) getProduitsServices(params.slug).then(setCatalogue).catch(() => setCatalogue([]));
  }, [params.slug, voitOffres]);

  // Lien direct vers un dossier (?dossier=… — notifications du cycle CRM) :
  // ouvre sa fiche puis retire le paramètre, pour qu'un rechargement ne la
  // rouvre pas et qu'un nouveau clic sur la notification la rouvre.
  const router = useRouter();
  const dossierDemande = useSearchParams().get('dossier');
  useEffect(() => {
    if (!dossierDemande || !projets) return;
    if (projets.some((p) => p.id === dossierDemande)) setDetailId(dossierDemande);
    else setMessage('Ce dossier n’est plus accessible.');
    router.replace(`/admin/${params.slug}/crm`, { scroll: false });
  }, [dossierDemande, projets, params.slug, router]);

  // Recharge la liste après une action sur l'offre (création, relance,
  // réponse saisie — un refus fait passer le dossier en « Perdu »).
  async function rafraichir() {
    setProjets(await getProjets(params.slug));
  }

  const filtres = useMemo(() => {
    if (!projets) return [];
    let liste = projets;
    if (filtreTuile === 'actif') {
      liste = liste.filter((p) => STATUTS_ACTIFS.includes(p.statut));
    } else if (filtreTuile === 'onboard' || filtreTuile === 'perdu') {
      liste = liste.filter((p) => p.statut === filtreTuile);
    } else if (filtreTuile === 'neufs') {
      const il30j = Date.now() - 30 * 86_400_000;
      liste = liste.filter((p) => +new Date(p.creeLe) >= il30j);
    }
    const q = recherche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter((p) =>
      [p.code, p.localisation, p.localite?.code, p.programme, p.client.nom, TYPES_BIEN[p.type]]
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
    const nouveau = par('nouveau_projet');
    const daf = par('en_validation');
    const offre = par('offre_envoyee');
    const onboard = par('onboard');
    const perdu = par('perdu');
    const clos = onboard + perdu;
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
      pipelineActif: nouveau + daf + offre,
      onboard,
      perdu,
      tauxConversion: clos > 0 ? Math.round((onboard / clos) * 100) : null,
      nouveaux30j,
      nouveauxPrecedents30j,
      funnel: [
        // cle = variante de couleur du statut (même palette que les pastilles).
        { cle: CLASSE_STATUT.nouveau_projet, label: STATUTS_CRM.nouveau_projet, valeur: nouveau },
        { cle: CLASSE_STATUT.en_validation, label: 'En validation', valeur: daf },
        { cle: CLASSE_STATUT.offre_envoyee, label: STATUTS_CRM.offre_envoyee, valeur: offre },
        { cle: CLASSE_STATUT.onboard, label: STATUTS_CRM.onboard, valeur: onboard },
        { cle: CLASSE_STATUT.perdu, label: STATUTS_CRM.perdu, valeur: perdu },
      ],
      nature: {
        mandat: liste.filter((p) => p.nature === 'mandat_client').length,
        promotion: liste.filter((p) => p.nature === 'promotion_interne').length,
      },
    };
  }, [projets]);

  function onCree(projet: Projet) {
    setProjets((actuels) => [projet, ...(actuels ?? [])]);
    setClients((actuels) =>
      actuels.some((c) => c.id === projet.client.id) ? actuels : [...actuels, projet.client],
    );
    setNouveauId(projet.id);
    setRecherche('');
  }

  // Action du cycle depuis la fiche détail. Pas de maj optimiste : le
  // serveur peut refuser (droit, statut changé entre-temps) — l'erreur
  // remonte à la fiche, qui l'affiche.
  async function onAgir(dossier: Projet, action: ActionCrm, commentaire?: string) {
    const { projet: maj, projetCree, offreEmise, facturesPreparees } = await agirSurDossier(
      params.slug,
      dossier.id,
      action,
      commentaire,
    );
    setProjets((actuels) => (actuels ?? []).map((p) => (p.id === maj.id ? maj : p)));
    if (projetCree) {
      setMessage(
        `Dossier ${dossier.code} — onboard : projet créé dans « Projets », à assigner` +
          (facturesPreparees > 0
            ? ` ; ${facturesPreparees} facture${facturesPreparees > 1 ? 's' : ''} préparée${facturesPreparees > 1 ? 's' : ''} en brouillon depuis l’offre (échéanciers CGV).`
            : '.'),
      );
    }
    return offreEmise;
  }


  async function onRattacher(dossier: Projet, localiteId: string) {
    const maj = await rattacherLocalite(params.slug, dossier.id, localiteId);
    setProjets((actuels) => (actuels ?? []).map((p) => (p.id === maj.id ? maj : p)));
    setMessage(`Dossier ${dossier.code} rattaché à ${maj.localite?.nom ?? 'la localité'}.`);
  }

  async function onChangerProprietaire(dossier: Projet, proprietaireId: string) {
    const maj = await changerProprietaire(params.slug, dossier.id, proprietaireId);
    setProjets((actuels) => (actuels ?? []).map((p) => (p.id === maj.id ? maj : p)));
  }

  return (
    <>
      <div className="projets-toolbar">
        <div className="projets-toolbar-info">
          <div className="champ-recherche projets-recherche">
            <Search size={15} strokeWidth={1.75} aria-hidden />
            <input
              type="search"
              className="field-input"
              placeholder="Rechercher un code, une localisation, un programme, un client…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
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
        {peutEcrire && (
          <button type="button" className="btn-primary" onClick={() => setModalOuvert(true)}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            <span>Nouveau projet</span>
          </button>
        )}
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
                degrade: DEGRADE_KPI.actif,
                action: {
                  type: 'filtre',
                  actif: filtreTuile === 'actif',
                  onClick: () => basculerFiltre('actif'),
                },
              },
              {
                cle: 'onboard',
                label: 'Onboard',
                valeur: kpi.onboard,
                icone: CheckCircle2,
                degrade: DEGRADE_KPI.valide,
                // Anneau réel : même valeur que le sous-texte, juste visualisée.
                ringPourcentage: kpi.tauxConversion ?? undefined,
                sousTexte:
                  kpi.tauxConversion === null
                    ? undefined
                    : `Taux de conversion ${formatPourcent(kpi.tauxConversion)}`,
                action: {
                  type: 'filtre',
                  actif: filtreTuile === 'onboard',
                  onClick: () => basculerFiltre('onboard'),
                },
              },
              {
                cle: 'neufs',
                label: 'Nouveaux (30 j)',
                valeur: kpi.nouveaux30j,
                icone: Sparkles,
                degrade: DEGRADE_KPI.neufs,
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
                // Dégradé chaud (même famille que « Retards » en
                // facturation) : plus un traitement atténué depuis le
                // passage aux couleurs vives (demande boss, sept. 2026) —
                // le dégradé porte lui-même le signal d'attention.
                cle: 'perdu',
                label: 'Perdus',
                valeur: kpi.perdu,
                icone: XCircle,
                degrade: DEGRADE_KPI.annule,
                action: {
                  type: 'filtre',
                  actif: filtreTuile === 'perdu',
                  onClick: () => basculerFiltre('perdu'),
                },
              },
            ]}
          />
          <KpiFunnel segments={kpi.funnel} natureSplit={kpi.nature} />
        </>
      )}

      <section className="panel glass-panel">
        {!projets ? (
          <div className="admin-skeleton" aria-hidden>
            <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" />
          </div>
        ) : filtres.length === 0 ? (
          <p className="empty-state">
            {recherche || filtreTuile
              ? 'Aucun projet ne correspond à ce filtre.'
              : peutEcrire
                ? 'Aucun projet pour le moment. Crée le premier avec « Nouveau projet ».'
                : 'Aucun projet pour le moment.'}
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
                        className={`pill crm-ligne-statut statut-select--${CLASSE_STATUT[projet.statut]}`}
                      >
                        {STATUTS_CRM[projet.statut]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="admin-table-wrap admin-table-wrap--fixe crm-liste-desktop">
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
                      <span className="cell-stack">
                        {/* Ouvre la fiche détail (apporteur, propriétaire…) —
                            sur desktop comme la ligne entière sur mobile. */}
                        <button
                          type="button"
                          className="lien-inline"
                          aria-haspopup="dialog"
                          onClick={() => setDetailId(projet.id)}
                        >
                          {projet.code}
                        </button>
                        {!projet.proprietaire && (
                          <span className="cell-sub">
                            <span className="pill pill--attention">À assigner</span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td data-label="Nature">
                      <span className="cell-stack">
                        <span className={`pill pill--nature-${projet.nature}`}>
                          {NATURES_DOSSIER[projet.nature]}
                        </span>
                        <span className="cell-sub">{CATEGORIES[projet.categorie]}</span>
                      </span>
                    </td>
                    <td data-label="Localisation">
                      <span className="cell-stack">
                        <span>{projet.localisation}</span>
                        <span className="cell-sub">
                          {projet.localite ? (
                            <span className="pill pill--neutre">{projet.localite.code}</span>
                          ) : (
                            peutEcrire ? (
                              <button
                                type="button"
                                className="lien-inline"
                                aria-haspopup="dialog"
                                onClick={() => setDetailId(projet.id)}
                              >
                                À rattacher
                              </button>
                            ) : (
                              <span className="pill pill--attention">Non rattachée</span>
                            )
                          )}
                        </span>
                      </span>
                    </td>
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
                      {/* Lecture seule : le statut avance par les actions de
                          la fiche (code cliquable), jamais par une liste libre. */}
                      <span className={`pill statut-select--${CLASSE_STATUT[projet.statut]}`}>
                        {STATUTS_CRM[projet.statut]}
                      </span>
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
          localites={localites}
          proprietaires={proprietaires}
          onClose={() => setModalOuvert(false)}
          onCree={onCree}
        />
      )}

      {detailProjet && (
        <DetailDossierModal
          slug={params.slug}
          projet={detailProjet}
          localites={localites}
          peutEcrire={peutEcrire}
          peutPreparerOffre={peutPreparerOffre}
          catalogue={catalogue}
          onMaj={rafraichir}
          // Réassigner : titulaires Dir. GC, administration, CIO (même règle
          // que CrmService.peutReassigner — le serveur tranche).
          peutReassigner={
            session.role === 'societe_admin' ||
            session.role === 'CIO (transverse)' ||
            !!proprietaires?.some((p) => p.id === session.utilisateur.id)
          }
          onClose={() => setDetailId(null)}
          onAgir={(action, commentaire) => onAgir(detailProjet, action, commentaire)}
          onRattacher={(localiteId) => onRattacher(detailProjet, localiteId)}
          proprietaires={proprietaires}
          onChangerProprietaire={(id) => onChangerProprietaire(detailProjet, id)}
        />
      )}
    </>
  );
}
