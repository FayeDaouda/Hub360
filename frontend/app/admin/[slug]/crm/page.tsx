'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock3, FileWarning, FolderOpen, Home, Plus, Search, Send } from 'lucide-react';
import {
  agirSurDossier,
  archiverDossier,
  desarchiverDossier,
  changerProprietaire,
  completudeFiche,
  libelleCategorie,
  modifierFiche,
  getClients,
  getProjets,
  getProprietairesPossibles,
  rattacherLocalite,
} from '@/lib/crm';
import { getLocalites } from '@/lib/localites';
import { VueCommercialeCoo } from '@/components/crm/vue-commerciale';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { type ActionCrm } from '@/lib/cycle-crm';
import {
  STATUTS_CRM,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Client,
  type Localite,
  type Personne,
  type ModifierFichePayload,
  type Projet,
  type StatutCrm,
} from '@/lib/types';
import { daysSince, formatNumber, plural, ROLE_CIO, ROLE_COMPANY_ADMIN, ROLE_COO, yearOf } from '@hub/domain';
import { NouveauProjetModal } from '@/components/admin/nouveau-projet-modal';
import { DetailDossierModal } from '@/components/admin/detail-dossier-modal';
import { KpiStrip } from '@/components/ui/kpi';
import { BoutonExport } from '@/components/bouton-export';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { DELAI_CFO_MS, DELAI_FICHE_MS, etatSelonDelai } from '@/lib/couleurs-etat';
import { Pill } from '@/components/ui/pill';
import { EmptyState, Skeleton } from '@/components/ui/feedback';

// Registre des projets (maquette du boss) : une couleur vive par tuile.

type Props = {
  params: Promise<{ slug: string }>;
};

// Situation d'un dossier dans le registre : son statut, sauf une offre
// envoyée restée sans réponse au-delà de sa validité (« Expirée ») et un lead
// archivé (« Archivés » : hors de « Tous » et des tuiles, jamais supprimé).
type Situation = StatutCrm | 'expiree' | 'archive';
const situationDe = (p: Projet): Situation => (p.archive ? 'archive' : p.offreExpiree ? 'expiree' : p.statut);
const LIBELLE_SITUATION: Record<Situation, string> = { ...STATUTS_CRM, expiree: 'Expirée', archive: 'Archivé' };
const PILL_SITUATION: Record<Situation, string> = {
  nouveau_projet: 'statut-select--nouveau',
  en_validation: 'statut-select--daf',
  offre_envoyee: 'statut-select--devis',
  onboard: 'statut-select--valide',
  perdu: 'statut-select--annule',
  expiree: 'pill--risque',
  archive: 'pill--neutre',
};
const FILTRES_SITUATION: Situation[] = [
  'nouveau_projet',
  'en_validation',
  'offre_envoyee',
  'onboard',
  'perdu',
  'expiree',
  'archive',
];
const LIBELLE_FILTRE: Partial<Record<Situation, string>> = { en_validation: 'En validation', archive: 'Archivés' };
const aCompleter = (p: Projet) =>
  !p.archive && p.statut === 'nouveau_projet' && completudeFiche(p).faits < completudeFiche(p).total;
const PILL_CATEGORIE: Record<string, string> = {
  conception: 'pill--succes',
  developpement: 'pill--info',
  amenagement: 'pill--attention',
};
const pillCategorie = (p: Projet) => (p.categorie && PILL_CATEGORIE[p.categorie]) || 'pill--neutre';

export default function CrmPage(props: Props) {
  const params = use(props.params);
  useTitrePage('CRM · Registre des projets');
  const session = useSessionCourante();
  // Lecture seule pour un rôle qui n'a que la lecture sur le CRM (CFO, CEO…)
  // — affichage seulement, le serveur refuse de toute façon l'écriture.
  const peutEcrire = niveauSuffisant(session, 'crm', 'ecriture');
  // Offre d'un dossier (étape F) : préparer (dans Finances) / relancer /
  // saisir la réponse = finances_devis écriture (le Dir. GC, pas le COO).
  const peutPreparerOffre = niveauSuffisant(session, 'finances_devis', 'ecriture');
  const [projets, setProjets] = useState<Projet[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  // Référentiel des localités — chargé une fois, partagé par la création et
  // le rattachement. null = en cours (les listes s'affichent désactivées).
  const [localites, setLocalites] = useState<Localite[] | null>(null);
  const [proprietaires, setProprietaires] = useState<Personne[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [onglet, setOnglet] = useState<'registre' | 'clients'>('registre');
  const [situation, setSituation] = useState<Situation | 'tous' | 'a_completer'>('tous');
  const [annee, setAnnee] = useState<string>(String(yearOf()));
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
  }, [params.slug]);

  // Lien direct vers un dossier (?dossier=… — notifications du cycle CRM) :
  // ouvre sa fiche puis retire le paramètre, pour qu'un rechargement ne la
  // rouvre pas et qu'un nouveau clic sur la notification la rouvre.
  const router = useRouter();
  const parametres = useSearchParams();
  const dossierDemande = parametres.get('dossier');
  // « Nouveau client » depuis Finances (?nouveau=1&depuis=finances) : la
  // création du lead s'ouvre, puis sa fiche, dont le bouton « Continuer vers
  // le devis » ramène dans Finances.
  const [depuisFinances, setDepuisFinances] = useState(false);
  useEffect(() => {
    if (parametres.get('nouveau') !== '1') return;
    setModalOuvert(true);
    setDepuisFinances(parametres.get('depuis') === 'finances');
    router.replace(`/admin/${params.slug}/crm`, { scroll: false });
  }, [parametres, params.slug, router]);
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

  // Dossiers de l'année du pipeline choisie (création), puis situation et recherche.
  const annees = useMemo(
    () => [...new Set([String(yearOf()), ...(projets ?? []).map((p) => p.creeLe.slice(0, 4))])].sort().reverse(),
    [projets],
  );
  const duPipeline = useMemo(() => (projets ?? []).filter((p) => p.creeLe.startsWith(annee)), [projets, annee]);
  const filtres = useMemo(() => {
    let liste = duPipeline;
    if (situation === 'tous') {
      liste = liste.filter((p) => !p.archive);
    } else if (situation === 'a_completer') {
      liste = liste.filter(aCompleter);
    } else {
      liste = liste.filter((p) => situationDe(p) === situation);
    }
    const q = recherche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter((p) => [p.code, p.client.nom].join(' ').toLowerCase().includes(q));
  }, [duPipeline, situation, recherche]);

  const basculer = (s: Situation | 'a_completer') => setSituation((x) => (x === s ? 'tous' : s));

  // Dérivé de `projets` (pas une copie figée) : reflète tout de suite un
  // changement de statut fait depuis la modale, sans avoir à la resynchroniser.
  const detailProjet = detailId ? ((projets ?? []).find((p) => p.id === detailId) ?? null) : null;
  // Réassigner et archiver : titulaires Dir. GC, administration, CIO (même
  // règle que CrmService.peutReassigner — le serveur tranche).
  const estDirectionOuCio =
    !!session.adminHub ||
    session.role === ROLE_COMPANY_ADMIN ||
    session.role === ROLE_CIO ||
    !!proprietaires?.some((p) => p.id === session.utilisateur.id);

  // Tuiles et compteurs — sur le pipeline de l'année, indépendants de la recherche.
  const kpi = useMemo(() => {
    const par = (x: Situation) => duPipeline.filter((p) => situationDe(p) === x).length;
    const valides = duPipeline.filter((p) => p.statut === 'onboard');
    const surfaces = valides.map((p) => p.surfaceTerrain * p.nbPlanches);
    return {
      par,
      actifs: duPipeline.filter((p) => !['perdu', 'expiree', 'archive'].includes(situationDe(p))).length,
      aCompleter: duPipeline.filter(aCompleter).length,
      // Délais (couleur = sens) : fiche incomplète au-delà de 72 h, offre
      // chez le CFO au-delà de 48 h.
      fichesEchues: duPipeline.filter(
        (p) => aCompleter(p) && Date.now() - new Date(p.creeLe).getTime() > DELAI_FICHE_MS,
      ).length,
      cfoEchues: duPipeline.filter(
        (p) =>
          situationDe(p) === 'en_validation' &&
          !!p.soumisLe &&
          Date.now() - new Date(p.soumisLe).getTime() > DELAI_CFO_MS,
      ).length,
      tous: duPipeline.filter((p) => !p.archive).length,
      surfaceVendue: surfaces.reduce((t, x) => t + x, 0),
      detailSurface:
        valides.length === 1
          ? `${formatNumber(valides[0].surfaceTerrain)} m² × ${valides[0].nbPlanches} pl. · projets validés`
          : `${valides.length} projets validés`,
    };
  }, [duPipeline]);

  function onCree(projet: Projet) {
    setProjets((actuels) => [projet, ...(actuels ?? [])]);
    setClients((actuels) => (actuels.some((c) => c.id === projet.client.id) ? actuels : [...actuels, projet.client]));
    setNouveauId(projet.id);
    setRecherche('');
    if (depuisFinances) setDetailId(projet.id);
  }

  // Action du cycle depuis la fiche détail. Pas de maj optimiste : le
  // serveur peut refuser (droit, statut changé entre-temps) — l'erreur
  // remonte à la fiche, qui l'affiche.
  async function onAgir(dossier: Projet, action: ActionCrm, commentaire?: string) {
    const {
      projet: maj,
      projetCree,
      offreEmise,
      facturesPreparees,
    } = await agirSurDossier(params.slug, dossier.id, action, commentaire);
    setProjets((actuels) => (actuels ?? []).map((p) => (p.id === maj.id ? maj : p)));
    if (projetCree) {
      setMessage(
        `Dossier ${dossier.code} — onboard : projet créé dans « Projets », à assigner` +
          (facturesPreparees > 0
            ? ` ; ${plural(facturesPreparees, 'facture')} préparée${facturesPreparees > 1 ? 's' : ''} en brouillon depuis l’offre (échéanciers CGV).`
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

  async function onModifierFiche(dossier: Projet, champs: ModifierFichePayload) {
    const maj = await modifierFiche(params.slug, dossier.id, champs);
    setProjets((actuels) => (actuels ?? []).map((p) => (p.id === maj.id ? maj : p)));
  }

  async function onArchiver(dossier: Projet) {
    const maj = await archiverDossier(params.slug, dossier.id);
    setProjets((actuels) => (actuels ?? []).map((p) => (p.id === maj.id ? maj : p)));
    setMessage(`Lead ${dossier.code} archivé : consultable dans « Archivés », son code reste réservé.`);
  }

  async function onDesarchiver(dossier: Projet) {
    const maj = await desarchiverDossier(params.slug, dossier.id);
    setProjets((actuels) => (actuels ?? []).map((p) => (p.id === maj.id ? maj : p)));
    setMessage(`Lead ${dossier.code} désarchivé : il revient dans le pipeline et dans les calculs.`);
  }

  return (
    <>
      {/* COO : sa page d'arrivée — ce qui attend une action, puis sa performance (revue COO). */}
      {session.role === ROLE_COO && <VueCommercialeCoo slug={params.slug} annee={annee} onOuvrir={setDetailId} />}
      <div className="crm-entete">
        <div className="vue-toggle crm-onglets" role="tablist" aria-label="Vue du CRM">
          <button
            type="button"
            role="tab"
            aria-selected={onglet === 'registre'}
            className={onglet === 'registre' ? 'is-active' : ''}
            onClick={() => setOnglet('registre')}
          >
            Registre des projets · {projets?.length ?? '…'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={onglet === 'clients'}
            className={onglet === 'clients' ? 'is-active' : ''}
            onClick={() => setOnglet('clients')}
          >
            Clients · {clients.length}
          </button>
        </div>
        {peutEcrire && (
          <button type="button" className="btn-primary" onClick={() => setModalOuvert(true)}>
            <Plus size={16} aria-hidden />
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

      {onglet === 'clients' ? (
        <section className="panel glass-panel liste-collee">
          <h2 className="crm-titre-registre">
            Clients <span>{clients.length}</span>
          </h2>
          {clients.length === 0 ? (
            <EmptyState>Aucun client pour le moment.</EmptyState>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th>Projets</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const siens = (projets ?? []).filter((p) => p.client.id === c.id);
                    return (
                      <tr key={c.id}>
                        <td>
                          <span className="cell-stack">
                            <span className="cell-fort">{c.nom}</span>
                            {c.sigle && <span className="cell-sub">{c.sigle}</span>}
                          </span>
                        </td>
                        <td data-label="Type">{TYPES_CLIENT[c.type]}</td>
                        <td data-label="Contact">
                          <span className="cell-stack">
                            <span>{c.contact || c.email || '—'}</span>
                            {c.telephone && <span className="cell-sub">{c.telephone}</span>}
                          </span>
                        </td>
                        <td data-label="Projets">{siens.length ? siens.map((p) => p.code).join(' · ') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="crm-filtres">
            <div className="vue-toggle crm-situations" role="group" aria-label="Situation">
              <button
                type="button"
                className={situation === 'tous' ? 'is-active' : ''}
                aria-pressed={situation === 'tous'}
                onClick={() => setSituation('tous')}
              >
                Tous <span className="crm-compte">{kpi.tous}</span>
              </button>
              {FILTRES_SITUATION.map((x) => (
                <button
                  key={x}
                  type="button"
                  className={situation === x ? 'is-active' : ''}
                  aria-pressed={situation === x}
                  onClick={() => basculer(x)}
                >
                  {LIBELLE_FILTRE[x] ?? LIBELLE_SITUATION[x]} <span className="crm-compte">{kpi.par(x)}</span>
                </button>
              ))}
            </div>
            <label className="crm-annee">
              <select
                className="field-input"
                aria-label="Année du pipeline"
                value={annee}
                onChange={(e) => setAnnee(e.target.value)}
              >
                {annees.map((a) => (
                  <option key={a} value={a}>
                    Pipeline {a}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="crm-kpi">
            <KpiStrip
              tiles={[
                {
                  id: 'actif',
                  label: 'Pipeline actif',
                  value: kpi.actifs,
                  hint: 'projets hors Perdu et Expirée',
                  icon: FolderOpen,
                  state: 'marque',
                  action: { type: 'filter', active: situation === 'tous', onClick: () => setSituation('tous') },
                },
                {
                  id: 'fiches',
                  label: 'Fiches à compléter',
                  value: kpi.aCompleter,
                  hint: kpi.fichesEchues ? `dont ${kpi.fichesEchues} au-delà de 72 h` : 'fiche incomplète · délai 72 h',
                  icon: FileWarning,
                  state: etatSelonDelai(kpi.aCompleter, kpi.fichesEchues),
                  action: {
                    type: 'filter',
                    active: situation === 'a_completer',
                    onClick: () => basculer('a_completer'),
                  },
                },
                {
                  id: 'cfo',
                  label: 'En attente CFO',
                  value: kpi.par('en_validation'),
                  hint: kpi.cfoEchues ? `dont ${kpi.cfoEchues} au-delà de 48 h` : 'offres soumises · délai 48 h',
                  icon: Clock3,
                  state: etatSelonDelai(kpi.par('en_validation'), kpi.cfoEchues),
                  action: {
                    type: 'filter',
                    active: situation === 'en_validation',
                    onClick: () => basculer('en_validation'),
                  },
                },
                {
                  id: 'client',
                  label: 'Chez le client',
                  value: kpi.par('offre_envoyee'),
                  hint: 'offres envoyées · validité 7 jours',
                  icon: Send,
                  state: 'marque',
                  action: {
                    type: 'filter',
                    active: situation === 'offre_envoyee',
                    onClick: () => basculer('offre_envoyee'),
                  },
                },
                {
                  id: 'surface',
                  label: 'Surface vendue',
                  value: `${formatNumber(kpi.surfaceVendue)} m²`,
                  hint: kpi.detailSurface,
                  icon: Home,
                  state: 'marque',
                  action: { type: 'filter', active: situation === 'onboard', onClick: () => basculer('onboard') },
                },
              ]}
            />
          </div>

          <section className="panel glass-panel liste-collee">
            <div className="crm-registre-tete liste-collee-outils">
              <h2 className="crm-titre-registre">
                Registre des projets <span>{filtres.length}</span>
              </h2>
              <div className="champ-recherche crm-recherche">
                <Search size={15} aria-hidden />
                <input
                  type="search"
                  className="field-input"
                  placeholder="Filtrer par code ou client"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </div>
              <BoutonExport
                desactive={!filtres.length}
                onExporter={() =>
                  exporterCsv(
                    `registre-crm-${annee}`,
                    [
                      { titre: 'Code projet', valeur: (p) => p.code },
                      { titre: 'Catégorie', valeur: (p) => libelleCategorie(p) },
                      { titre: 'Client', valeur: (p) => p.client.nom },
                      { titre: 'Localité', valeur: (p) => p.localite?.nom ?? p.localisation },
                      { titre: 'Type', valeur: (p) => (p.type ? TYPES_BIEN[p.type] : null) },
                      { titre: 'Programme', valeur: (p) => p.programme.trim() || null },
                      {
                        titre: 'Apporteur',
                        valeur: (p) =>
                          p.apporteur?.type === 'externe'
                            ? p.apporteur.nom
                            : p.apporteur?.type === 'interne'
                              ? (p.apporteur.utilisateur?.nom ?? 'Apporteur interne')
                              : 'Affaire directe',
                      },
                      { titre: 'Commission (%)', valeur: (p) => p.commissionApporteur },
                      { titre: 'Complétude', valeur: (p) => `${completudeFiche(p).faits}/${completudeFiche(p).total}` },
                      { titre: 'Situation', valeur: (p) => LIBELLE_SITUATION[situationDe(p)] },
                      { titre: 'Créé le', valeur: (p) => dateExport(p.creeLe) },
                    ],
                    filtres,
                  )
                }
              />
            </div>
            {!projets ? (
              <div className="admin-skeleton" aria-hidden>
                <Skeleton size="sm" />
              </div>
            ) : filtres.length === 0 ? (
              <EmptyState>
                {recherche || situation !== 'tous'
                  ? 'Aucun projet ne correspond à ce filtre.'
                  : peutEcrire
                    ? 'Aucun projet pour le moment. Crée le premier avec « Nouveau projet ».'
                    : 'Aucun projet pour le moment.'}
              </EmptyState>
            ) : (
              <>
                {/* Mobile : liste condensée (tap → fiche). */}
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
                            <span className="crm-ligne-nom">{projet.client.nom}</span>
                          </span>
                          <Pill className={`crm-ligne-statut ${PILL_SITUATION[situationDe(projet)]}`}>
                            {LIBELLE_SITUATION[situationDe(projet)]}
                          </Pill>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="admin-table-wrap crm-liste-desktop">
                  <table className="admin-table crm-registre">
                    <thead>
                      <tr>
                        <th>Code projet</th>
                        <th>Catégorie</th>
                        <th>Client</th>
                        <th>Type</th>
                        <th>Programme</th>
                        <th>Apporteur</th>
                        <th>Complétude</th>
                        <th>Situation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtres.map((projet) => {
                        const c = completudeFiche(projet);
                        const s = situationDe(projet);
                        const ap = projet.apporteur;
                        return (
                          <tr
                            key={projet.id}
                            className={`crm-ligne-registre${projet.id === nouveauId ? ' is-nouveau' : ''}`}
                            onClick={() => setDetailId(projet.id)}
                          >
                            <td data-label="Code projet" className="cell-code">
                              <button
                                type="button"
                                className="crm-code"
                                aria-haspopup="dialog"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailId(projet.id);
                                }}
                              >
                                {projet.code}
                              </button>
                            </td>
                            <td data-label="Catégorie">
                              {libelleCategorie(projet) ? (
                                <Pill className={pillCategorie(projet)}>{libelleCategorie(projet)}</Pill>
                              ) : (
                                <Pill className="crm-a-choisir">À choisir</Pill>
                              )}
                            </td>
                            <td data-label="Client" className="crm-c-client">
                              <span className="cell-stack">
                                <span className="cell-fort">{projet.client.nom}</span>
                                <span className="cell-sub">{projet.localite?.nom ?? projet.localisation}</span>
                              </span>
                            </td>
                            <td data-label="Type" className="crm-c-type">
                              {projet.type ? TYPES_BIEN[projet.type] : '—'}
                            </td>
                            <td data-label="Programme" className="crm-c-programme">
                              {projet.programme.trim() ? (
                                <span className="crm-tronque crm-tronque--programme" title={projet.programme}>
                                  {projet.programme}
                                </span>
                              ) : (
                                <span className="crm-manquant">Fiche Programme à remplir</span>
                              )}
                            </td>
                            <td data-label="Apporteur">
                              <span className="cell-stack">
                                <span className="cell-fort">
                                  {ap?.type === 'externe'
                                    ? ap.nom
                                    : ap?.type === 'interne'
                                      ? (ap.utilisateur?.nom ?? 'Apporteur interne')
                                      : 'Affaire directe'}
                                </span>
                                <span className="cell-sub crm-tronque crm-tronque--apporteur">
                                  {ap
                                    ? [
                                        projet.commissionApporteur != null &&
                                          `${formatNumber(projet.commissionApporteur)} %`,
                                        ap.type === 'interne' ? 'Interne' : ap.structure || ap.telephone,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')
                                    : projet.verrouillee
                                      ? 'fiche verrouillée'
                                      : ''}
                                </span>
                              </span>
                            </td>
                            <td data-label="Complétude">
                              <span
                                className="crm-completude"
                                title={c.manquants.length ? `Il manque : ${c.manquants.join(', ')}` : 'Fiche complète'}
                              >
                                <span>
                                  {c.faits}/{c.total}
                                </span>
                                <span className="progress-track">
                                  <span
                                    className={`progress-fill ${c.faits === c.total ? 'crm-completude--complete' : 'crm-completude--partielle'}`}
                                    style={{ width: `${(c.faits / c.total) * 100}%` }}
                                  />
                                </span>
                              </span>
                            </td>
                            <td data-label="Situation">
                              <Pill className={PILL_SITUATION[s]}>{LIBELLE_SITUATION[s]}</Pill>
                              {/* Revue CEO : au-delà du seuil, le demandeur voit que l'offre attend le CEO. */}
                              {projet.contresignatureCeo && projet.soumisLe && (
                                <span className="cell-sub">
                                  En attente du CEO depuis {Math.max(0, daysSince(projet.soumisLe))} j
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="crm-pied">Chaque ligne ouvre sa fiche. Les valeurs en ambre sont manquantes.</p>
              </>
            )}
          </section>
        </>
      )}

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
          peutFacturer={niveauSuffisant(session, 'finances_factures', 'ecriture')}
          depuisFinances={depuisFinances}
          onMaj={rafraichir}
          peutReassigner={estDirectionOuCio}
          // Archiver exige l'écriture sur le CRM (le CIO, en lecture, ne fait que réassigner).
          peutArchiver={estDirectionOuCio && peutEcrire}
          onClose={() => setDetailId(null)}
          onAgir={(action, commentaire) => onAgir(detailProjet, action, commentaire)}
          onRattacher={(localiteId) => onRattacher(detailProjet, localiteId)}
          proprietaires={proprietaires}
          onChangerProprietaire={(id) => onChangerProprietaire(detailProjet, id)}
          onArchiver={() => onArchiver(detailProjet)}
          onDesarchiver={() => onDesarchiver(detailProjet)}
          onModifierFiche={(champs) => onModifierFiche(detailProjet, champs)}
        />
      )}
    </>
  );
}
