'use client';

import { DecisionsFiche } from '@/components/pilotage/decisions-fiche';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Archive, ArrowRight, Check, Copy, Lock } from 'lucide-react';
import {
  GAMMES,
  STANDINGS,
  TYPES_CLIENT,
  STATUTS_CRM,
  type Localite,
  type ModifierFichePayload,
  type Personne,
  type Projet,
  type StatutCrm,
  type TransitionDossier,
} from '@/lib/types';
import { ETAPE, formatDate, formatNumber, formatTime } from '@hub/domain';
import { CLASSE_STATUT, type ActionCrm } from '@/lib/cycle-crm';
import { completudeFiche, getHistorique, libelleCategorie, type OffreEmise } from '@/lib/crm';
import { DELAI_CFO_MS, DELAI_FICHE_MS } from '@/lib/couleurs-etat';
import { CycleDossier } from './cycle-dossier';
import { OffreDossier } from './offre-dossier';
import { ContratDossier } from './contrat-dossier';
import { ProjectTeams } from '@/features/projects/project-teams';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante } from '@/lib/layout-contexte';
import { LocaliteSelect } from './localite-select';
import { CaracteristiquesProjet } from './caracteristiques-projet';
import { FicheApporteurSection } from './fiche-apporteur-section';
import { estPersonneMorale } from '@/lib/nomenclature';
import { CloseButton, Drawer } from '@/components/ui/dialog';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { MenuActions, type ActionMenu } from '@/components/menu-actions';
import { PersonAvatar } from '@/components/ui/avatar';
import { Pill, type PillTone } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  projet: Projet;
  localites: Localite[] | null;
  proprietaires: Personne[] | null; // titulaires Dir. GC
  peutEcrire: boolean; // crm ≥ écriture : rattachement de localité
  peutReassigner: boolean;
  peutArchiver: boolean; // Direction GC ou CIO (même règle que la réassignation)
  peutPreparerOffre: boolean; // finances_devis ≥ écriture
  // Arrivé de Finances (« Nouveau client ») : l'offre s'y prépare ensuite.
  depuisFinances?: boolean;
  onMaj: () => Promise<void>; // recharge le dossier (après une action sur l'offre)
  onClose: () => void;
  // Rejeter la promesse garde le panneau d'action ouvert + affiche l'erreur.
  onAgir: (action: ActionCrm, commentaire?: string) => Promise<OffreEmise | null>;
  // Rejeter la promesse garde le bloc ouvert + affiche l'erreur en ligne.
  onRattacher: (localiteId: string) => Promise<void>;
  onChangerProprietaire: (proprietaireId: string) => Promise<void>;
  onArchiver: () => Promise<void>;
  onDesarchiver: () => Promise<void>;
  peutFacturer: boolean; // finances_factures ≥ écriture : facture directe du lead
  onModifierFiche: (champs: ModifierFichePayload) => Promise<void>;
};

// Situation (maquette du boss) : quatre étapes ; « Perdu » les laisse grisées.
const ETAPES: { statut: StatutCrm; libelle: string }[] = [
  { statut: 'nouveau_projet', libelle: 'Nouveau projet' },
  { statut: 'en_validation', libelle: 'Validation CFO' },
  { statut: 'offre_envoyee', libelle: 'Offre envoyée' },
  { statut: 'onboard', libelle: 'Onboard' },
];

// Lignes d'historique lisibles d'une transition du cycle. La création (de =
// null) garde en commentaire la fiche apporteur validée ; de = vers = un
// événement de la fiche (apporteur modifié par le COO), sans changer d'étape.
function libellesTransition(t: TransitionDossier): string[] {
  const par = t.par?.nom ? ` par ${t.par.nom}` : '';
  if (!t.de && t.vers === 'nouveau_projet' && t.commentaire) return [t.commentaire, `Fiche créée${par}`];
  if (t.de && t.de === t.vers) return [`${t.commentaire ?? 'Fiche modifiée'}${par}`];
  return [libelleTransition(t, par)];
}

function libelleTransition(t: TransitionDossier, par: string): string {
  const motif = t.commentaire ? ` : ${t.commentaire}` : '';
  if (!t.de) return `Fiche créée${par}`;
  if (t.vers === 'en_validation') return `Offre soumise au CFO${par}`;
  if (t.de === 'en_validation' && t.vers === 'offre_envoyee') return `Offre validée par le CFO, envoyée au client`;
  if (t.de === 'en_validation' && t.vers === 'nouveau_projet') return `Renvoyée par le CFO${motif}`;
  if (t.de === 'offre_envoyee' && t.vers === 'nouveau_projet') return `Offre reprise (expirée sans réponse)`;
  // Onboard : à l'acceptation de l'offre (depuis le 29/10/2026), ou débloqué
  // par l'Administrateur HUB (son motif) ; « Contrat signé. » avant cette date.
  if (t.vers === 'onboard')
    return t.commentaire === 'Contrat signé.'
      ? `Contrat signé : projet onboard`
      : `Projet onboard${t.commentaire ? ` : ${t.commentaire}` : ''}`;
  if (t.de === 'perdu' && t.vers === 'nouveau_projet') return `Dossier rouvert${motif}`;
  if (t.vers === 'perdu') return `Dossier perdu${motif}`;
  return `${t.de} → ${t.vers}${par}`;
}

// Délais du cycle (règles du CRM, lib/couleurs-etat.ts : fiche complète sous
// 72 h, validation CFO sous 48 h) : heures restantes, arrondies au-dessus
// comme le serveur (« À traiter »), négatives une fois le délai dépassé.
const HEURE = 3_600_000;
const heuresRestantes = (depuis: string, delaiMs: number, maintenant = Date.now()) =>
  Math.ceil((Date.parse(depuis) + delaiMs - maintenant) / HEURE);
const reste = (h: number) => (h >= 24 ? `reste ${Math.floor(h / 24)} j ${h % 24} h` : `reste ${h} h`);

// Sections de la fiche, dans l'ordre du défilement (onglets du haut).
type SectionFiche = 'fiche' | 'apporteur' | 'offre' | 'historique';
const idSection = (s: SectionFiche) => `fiche-dossier-${s}`;
const mouvementReduit = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Fiche d'un dossier CRM en panneau latéral (maquette du boss) : situation,
// champs de la fiche, apporteur, passation, historique, puis les actions du
// cycle (offre, contrat, validation) — seul endroit où le dossier avance.
export function DetailDossierModal({
  slug,
  projet,
  localites,
  proprietaires,
  peutEcrire,
  peutReassigner,
  peutArchiver,
  peutPreparerOffre,
  depuisFinances = false,
  onMaj,
  onClose,
  onAgir,
  onRattacher,
  onChangerProprietaire,
  onArchiver,
  onDesarchiver,
  peutFacturer,
  onModifierFiche,
}: Props) {
  // Équipes du projet : écriture sur le module « équipe » (le Dir. GC,
  // l'administration).
  const session = useSessionCourante();
  const peutAffecterEquipes = niveauSuffisant(session, ETAPE.equipeProjets, 'ecriture');
  // Lien public émis (validation DAF / relance) : le clair n'existe qu'une
  // fois, affiché jusqu'à fermeture.
  const [lienEmis, setLienEmis] = useState<OffreEmise | null>(null);
  const [reassignation, setReassignation] = useState(false);
  const [erreurProprio, setErreurProprio] = useState<string | null>(null);
  const [historique, setHistorique] = useState<TransitionDossier[] | null>(null);
  // Un événement de la fiche (apporteur modifié) n'en change pas le statut.
  const [versionHistorique, setVersionHistorique] = useState(0);
  const [localiteId, setLocaliteId] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Archivage (menu « ⋯ ») : le lead sort des calculs, donc confirmé avant l'envoi.
  const [confirmerArchive, setConfirmerArchive] = useState(false);
  // Refonte du 09/11/2026 : en-tête et onglets fixes, corps qui défile, pied
  // avec l'action suivante. `defile` : ombre sous l'en-tête dès qu'on défile.
  const corps = useRef<HTMLDivElement>(null);
  const [defile, setDefile] = useState(false);
  const [sectionActive, setSectionActive] = useState<SectionFiche>('fiche');
  // Section demandée (onglet, pied) : elle reste active pendant le défilement
  // qui y mène, même si elle ne peut pas monter jusqu'en haut (la dernière).
  const demandee = useRef<{ section: SectionFiche; minuteur: number } | null>(null);
  const [copie, setCopie] = useState(false);
  // Action principale proposée dans « Offre & contrat » (reprise dans le pied).
  const [principal, setPrincipal] = useState<string | null>(null);

  // Rechargé à chaque changement de statut ou événement de la fiche
  // (nouvelle ligne de journal).
  useEffect(() => {
    getHistorique(slug, projet.id)
      .then(setHistorique)
      .catch(() => setHistorique([]));
  }, [slug, projet.id, projet.statut, versionHistorique]);

  async function reassigner(id: string) {
    if (!id || id === projet.proprietaire?.id) return;
    setReassignation(true);
    setErreurProprio(null);
    try {
      await onChangerProprietaire(id);
    } catch (e) {
      setErreurProprio(e instanceof Error && e.message ? e.message : 'La réassignation a échoué.');
    } finally {
      setReassignation(false);
    }
  }

  // Erreur levée : la fenêtre de confirmation l'affiche et reste ouverte.
  async function archiver() {
    await (archive ? onDesarchiver() : onArchiver());
    setConfirmerArchive(false);
  }

  async function rattacher() {
    if (!localiteId) return setErreur('Choisis une localité dans la liste.');
    setEnCours(true);
    setErreur(null);
    try {
      await onRattacher(localiteId);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Le rattachement a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  const completude = completudeFiche(projet);
  // Lead archivé : fiche consultable seulement, plus aucune action.
  const archive = projet.archive;
  // Fiche à compléter tant qu'elle n'est pas verrouillée (maquette) ; sinon
  // la liste de ses neuf champs, en lecture.
  const editable = peutEcrire && !archive && projet.statut === 'nouveau_projet';
  // Fiche figée (après la soumission au CFO) : modifiable avec l'Écriture de
  // « Modifier une fiche figée » (09/11/2026), sans les champs du prix.
  // La route exige aussi l'Écriture des dossiers : les deux droits.
  const editionFigee =
    peutEcrire &&
    !archive &&
    projet.statut !== 'nouveau_projet' &&
    niveauSuffisant(session, ETAPE.crmFicheFigee, 'ecriture');
  // Dossier antérieur au référentiel : à rattacher à une localité.
  const rattachable = !projet.localite && peutEcrire && !archive;
  const rang = ETAPES.findIndex((e) => e.statut === projet.statut);
  const manquant = (texte = 'à renseigner') => <span className="crm-manquant">{texte}</span>;

  const champs: { libelle: string; valeur: React.ReactNode; aide: string }[] = [
    { libelle: 'Code projet', valeur: projet.code, aide: 'Généré : initiales client _ localité . année' },
    {
      libelle: 'Catégorie',
      valeur: libelleCategorie(projet) ?? manquant('à choisir'),
      aide: 'Conception, Développement ou Aménagement',
    },
    {
      libelle: 'Localisation',
      valeur: projet.localite
        ? `${projet.localite.nom} (${projet.localite.code})`
        : manquant(`${projet.localisation} · non rattachée`),
      aide: 'Choisie dans le référentiel des localités',
    },
    {
      libelle: 'Surface du terrain',
      valeur: projet.surfaceTerrain > 0 ? `${formatNumber(projet.surfaceTerrain)} m²` : manquant(),
      aide: 'Fiche Programme · base du calcul de surface vendue',
    },
    {
      libelle: 'N° de planches',
      valeur: projet.nbPlanches > 0 ? projet.nbPlanches : manquant(),
      aide: 'Une planche = un plan-type, pas un étage',
    },
    { libelle: 'Client', valeur: projet.client.nom, aide: TYPES_CLIENT[projet.client.type] },
    {
      libelle: 'Standing',
      valeur: projet.standing ? STANDINGS[projet.standing] : manquant(),
      aide: 'Ce que le bâtiment offre',
    },
    { libelle: 'Gamme', valeur: projet.gamme ? GAMMES[projet.gamme] : manquant(), aide: 'Avec quoi on le finit' },
    {
      libelle: 'Programme',
      valeur: projet.programme.trim() || manquant('Fiche Programme à remplir'),
      aide: 'Résumé de la fiche Programme',
    },
  ];

  // --- Navigation dans la fiche (onglets, défilement) -------------------
  const sections: { id: SectionFiche; libelle: string; nombre?: number }[] = [
    {
      id: 'fiche',
      libelle: 'Fiche',
      nombre:
        !archive && projet.statut === 'nouveau_projet' ? completude.total - completude.faits || undefined : undefined,
    },
    ...('apporteur' in projet ? [{ id: 'apporteur' as const, libelle: 'Apporteur' }] : []),
    ...(!archive ? [{ id: 'offre' as const, libelle: 'Offre & contrat' }] : []),
    { id: 'historique', libelle: 'Historique' },
  ];

  // Section à l'écran : la dernière dont le haut a passé le haut du corps
  // (la dernière tout en bas). Ombre de l'en-tête dès qu'on a défilé.
  const cleSections = sections.map((x) => x.id).join('|');
  const suivreDefilement = useCallback(() => {
    const el = corps.current;
    if (!el) return;
    setDefile(el.scrollTop > 4);
    // Défilement vers une section demandée : elle reste active jusqu'à
    // l'arrêt du défilement (200 ms sans mouvement).
    const d = demandee.current;
    if (d) {
      window.clearTimeout(d.minuteur);
      d.minuteur = window.setTimeout(liberer, 200);
      return setSectionActive(d.section);
    }
    const haut = el.getBoundingClientRect().top + 48;
    const presentes = (cleSections.split('|') as SectionFiche[]).filter((id) => document.getElementById(idSection(id)));
    const enBas = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    const passees = presentes.filter(
      (id) => (document.getElementById(idSection(id))?.getBoundingClientRect().top ?? Infinity) <= haut,
    );
    const active = enBas && el.scrollTop > 0 ? presentes[presentes.length - 1] : (passees.pop() ?? presentes[0]);
    if (active) setSectionActive(active);
  }, [cleSections]);
  // Fin du défilement vers une section demandée : le suivi de lecture
  // reprend (un défilement à la main a pu l'interrompre en chemin).
  const suivre = useRef(suivreDefilement);
  useEffect(() => {
    suivre.current = suivreDefilement;
  }, [suivreDefilement]);
  function liberer() {
    demandee.current = null;
    // La dernière section, trop courte pour monter en haut, reste active.
    const el = corps.current;
    if (el && el.scrollTop + el.clientHeight < el.scrollHeight - 4) suivre.current();
  }
  // Fiche fermée : plus de minuteur en attente.
  useEffect(
    () => () => {
      if (demandee.current) window.clearTimeout(demandee.current.minuteur);
    },
    [],
  );

  // Mène à une section (onglet, jauge, pied) : défilement doux, puis un bref
  // halo pour la repérer ; `focus` : l'élément à rendre actif une fois arrivé.
  function aller(section: SectionFiche, focus?: HTMLElement | null) {
    const cible = document.getElementById(idSection(section));
    if (!cible) return;
    setSectionActive(section);
    if (demandee.current) window.clearTimeout(demandee.current.minuteur);
    // Sans défilement (section déjà à l'écran), le verrou tombe seul.
    demandee.current = { section, minuteur: window.setTimeout(liberer, 1000) };
    cible.scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'start' });
    cible.classList.remove('is-cible');
    void cible.offsetWidth; // relance l'animation du halo
    cible.classList.add('is-cible');
    (focus ?? cible).focus({ preventScroll: true });
  }

  // « Compléter » : le premier champ manquant de la fiche, prêt à remplir.
  function completer() {
    // Un vrai champ (un libellé « manquant » ne prend pas le focus) ; une
    // localité à rattacher se choisit plus bas, dans son propre bloc.
    const zone = document.getElementById(idSection('fiche'));
    const champ =
      zone?.querySelector<HTMLElement>(
        'select.is-manquant:not([disabled]), input.is-manquant:not([disabled]), textarea.is-manquant:not([disabled])',
      ) ?? (!projet.localite ? document.getElementById('rattacher-localite') : null);
    aller('fiche', champ ?? zone);
  }

  // Action principale de « Offre & contrat » (créer l'offre, soumettre au
  // CFO, valider…) : reprise dans le pied, sans dupliquer ses règles — un
  // clic y mène et la rend active, la confirmation reste dans sa section.
  const boutonPrincipal = () =>
    document
      .getElementById(idSection('offre'))
      ?.querySelector<HTMLElement>('[data-action-principale]:not(:disabled):not([aria-disabled="true"])') ?? null;
  useEffect(() => {
    const zone = document.getElementById(idSection('offre'));
    const lire = () => setPrincipal(boutonPrincipal()?.textContent?.trim() || null);
    lire();
    if (!zone) return;
    const obs = new MutationObserver(lire);
    obs.observe(zone, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'class', 'data-action-principale'],
    });
    return () => obs.disconnect();
  }, [projet, archive]);

  // Section active disparue (archivage : plus d'« Offre & contrat ») : Fiche.
  if (!sections.some((x) => x.id === sectionActive)) setSectionActive('fiche');

  // Indicateur de l'onglet actif : glisse d'un onglet à l'autre.
  const onglets = useRef<HTMLElement>(null);
  // Le compteur de l'onglet Fiche change sa largeur : l'indicateur suit.
  const nombreFiche = sections[0]?.nombre;
  const [indicateur, setIndicateur] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const actif = onglets.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!actif) return setIndicateur(null);
    setIndicateur({ x: actif.offsetLeft, w: actif.offsetWidth });
    // Onglet hors de vue (téléphone, onglets qui défilent) : ramené.
    actif.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [sectionActive, sections.length, nombreFiche]);

  async function copierCode() {
    if (!navigator.clipboard) return; // hors HTTPS : pas de presse-papiers
    try {
      await navigator.clipboard.writeText(projet.code);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 1800);
    } catch {
      // Presse-papiers refusé : rien à signaler, le code reste affiché.
    }
  }

  const actionsMenu: ActionMenu[] = [
    {
      cle: 'copier',
      libelle: copie ? 'Code copié' : 'Copier le code',
      icone: copie ? Check : Copy,
      onClick: copierCode,
    },
    ...(peutArchiver && projet.statut === 'nouveau_projet'
      ? [
          {
            cle: 'archiver',
            libelle: archive ? 'Désarchiver ce lead…' : 'Archiver ce lead…',
            icone: Archive,
            onClick: () => setConfirmerArchive(true),
            danger: !archive,
            separee: true,
          },
        ]
      : []),
  ];

  // --- Situation : quatre étapes datées et le délai de l'étape en cours ---
  const passageA = (statut: StatutCrm) =>
    historique
      ?.filter((t) => t.vers === statut && t.de !== t.vers)
      .map((t) => t.le)
      .pop();
  const etapeEnCours = projet.statut === 'perdu' || archive ? -1 : rang;
  const delai = ((): { texte: string; ton: PillTone } => {
    if (archive) return { texte: 'Lead archivé', ton: 'neutre' };
    if (projet.statut === 'perdu') return { texte: 'Dossier perdu · cycle clos', ton: 'risque' };
    if (projet.statut === 'nouveau_projet') {
      if (completude.faits === completude.total) return { texte: 'Fiche complète · prête pour l’offre', ton: 'succes' };
      const h = heuresRestantes(projet.creeLe, DELAI_FICHE_MS);
      return h > 0
        ? { texte: `Fiche à compléter · ${reste(h)}`, ton: 'attention' }
        : { texte: 'Délai de 72 h dépassé : relance en cours', ton: 'risque' };
    }
    if (projet.statut === 'en_validation') {
      const depuis = projet.soumisLe ?? passageA('en_validation');
      const h = depuis ? heuresRestantes(depuis, DELAI_CFO_MS) : null;
      return h === null
        ? { texte: 'Validation CFO sous 48 h', ton: 'info' }
        : h > 0
          ? { texte: `Validation CFO · ${reste(h)}`, ton: 'info' }
          : { texte: 'Validation CFO : délai de 48 h dépassé', ton: 'risque' };
    }
    if (projet.statut === 'offre_envoyee')
      return projet.offreExpiree
        ? { texte: 'Offre expirée sans réponse', ton: 'risque' }
        : { texte: 'En attente de la réponse du client', ton: 'info' };
    return { texte: 'Client acquis · projet ouvert', ton: 'succes' };
  })();
  const titreSituation = archive
    ? 'Lead archivé : consultable seulement'
    : projet.statut === 'perdu'
      ? 'Dossier perdu : le cycle est clos'
      : `Étape ${rang + 1} sur ${ETAPES.length} · ${ETAPES[rang]?.libelle ?? ''}`;

  // --- Pied : la prochaine étape et son action ---------------------------
  const manquants = completude.total - completude.faits;
  const ficheIncomplete = projet.statut === 'nouveau_projet' && manquants > 0;
  const prochaine = archive
    ? null
    : projet.statut === 'nouveau_projet'
      ? ficheIncomplete
        ? `Compléter ${manquants} champ${manquants > 1 ? 's' : ''} de la fiche pour créer l’offre`
        : projet.offre
          ? 'Soumettre l’offre à la validation du CFO'
          : 'Créer l’offre, puis la soumettre à la validation du CFO'
      : projet.statut === 'en_validation'
        ? 'Validation de l’offre par le CFO'
        : projet.statut === 'offre_envoyee'
          ? projet.offreExpiree
            ? 'Offre expirée sans réponse : refaire une offre ou déclarer le dossier perdu'
            : 'Réponse du client à l’offre'
          : projet.statut === 'onboard'
            ? 'Contrat et équipes du projet'
            : 'Cycle clos';

  return (
    <Drawer
      onClose={onClose}
      as="aside"
      labelledBy="fiche-crm-titre"
      trapFocus
      className={`fiche-dossier${defile ? ' is-defile' : ''}`}
    >
      <header className="fiche-dossier-tete">
        <div className="fiche-dossier-titre">
          <div className="fiche-dossier-identite">
            <div className="fiche-dossier-code-ligne">
              <h2 id="fiche-crm-titre" className="fiche-crm-code">
                {projet.code}
              </h2>
              <Pill className={`statut-select--${CLASSE_STATUT[projet.statut]}`}>
                {archive ? 'Archivé' : STATUTS_CRM[projet.statut]}
              </Pill>
            </div>
            <p className="fiche-dossier-meta">
              <strong>{projet.client.nom}</strong> ·{' '}
              {estPersonneMorale(projet.client.type) ? 'Personne morale' : 'Personne physique'} ·{' '}
              {projet.localite?.nom ?? projet.localisation} · créé le {formatDate(projet.creeLe)}
            </p>
          </div>
          <div className="fiche-dossier-outils">
            <MenuActions
              variante="icone"
              alignement="droite"
              libelle={`Plus d’actions pour ${projet.code}`}
              actions={actionsMenu}
            />
            <CloseButton onClick={onClose} />
          </div>
        </div>

        {(!archive && ficheIncomplete) || 'proprietaire' in projet ? (
          <div className="fiche-dossier-bandeau">
            {/* Fiche complète : la Situation le dit (« prête pour l'offre »). */}
            {!archive && ficheIncomplete && (
              <div className="fiche-dossier-jauge">
                <div className="fiche-dossier-jauge-texte">
                  <span>
                    Fiche {completude.faits}/{completude.total}
                    {ficheIncomplete && (
                      <>
                        {' · '}
                        <span className="fiche-dossier-manque">
                          {manquants} champ{manquants > 1 ? 's' : ''} à compléter
                        </span>
                      </>
                    )}
                  </span>
                  {ficheIncomplete && editable && (
                    <button type="button" className="fiche-dossier-lien" onClick={completer}>
                      Compléter <ArrowRight size={14} aria-hidden />
                    </button>
                  )}
                </div>
                <div
                  className="fiche-dossier-jauge-piste"
                  role="progressbar"
                  aria-label="Complétude de la fiche"
                  aria-valuemin={0}
                  aria-valuemax={completude.total}
                  aria-valuenow={completude.faits}
                  aria-valuetext={`${completude.faits} champs remplis sur ${completude.total}`}
                >
                  <span
                    className={ficheIncomplete ? undefined : 'is-complete'}
                    style={{ width: `${(completude.faits / completude.total) * 100}%` }}
                  />
                </div>
                {ficheIncomplete && (
                  <span className="fiche-dossier-manquants">Manque : {completude.manquants.join(', ')}</span>
                )}
              </div>
            )}
            {'proprietaire' in projet && (
              <div className="fiche-dossier-proprio">
                {projet.proprietaire ? (
                  <PersonAvatar name={projet.proprietaire.nom} size="sm" />
                ) : (
                  <span className="av av--sm fiche-dossier-proprio-vide" aria-hidden>
                    ?
                  </span>
                )}
                <span>
                  <span className="fiche-dossier-proprio-libelle">Propriétaire</span>
                  <strong>{projet.proprietaire?.nom ?? 'À assigner'}</strong>
                </span>
              </div>
            )}
          </div>
        ) : null}

        <nav className="fiche-dossier-onglets" aria-label="Sections de la fiche" ref={onglets}>
          {sections.map((x) => (
            <a
              key={x.id}
              href={`#${idSection(x.id)}`}
              className={sectionActive === x.id ? 'is-actif' : undefined}
              aria-current={sectionActive === x.id ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault();
                aller(x.id);
              }}
            >
              {x.libelle}
              {x.nombre ? (
                <>
                  <span className="fiche-dossier-onglet-nombre" aria-hidden>
                    {x.nombre}
                  </span>
                  <span className="sr-only">
                    {' '}
                    ({x.nombre} champ{x.nombre > 1 ? 's' : ''} à compléter)
                  </span>
                </>
              ) : null}
            </a>
          ))}
          {indicateur && (
            <span
              className="fiche-dossier-indicateur"
              aria-hidden
              style={{ transform: `translateX(${indicateur.x}px)`, width: indicateur.w }}
            />
          )}
        </nav>
      </header>

      <div className="fiche-dossier-corps" ref={corps} onScroll={suivreDefilement}>
        <DecisionsFiche slug={slug} cible={{ client: projet.client.id }} />

        <section className="fiche-crm-section fiche-dossier-situation" aria-labelledby="fiche-situation-titre">
          <div className="fiche-dossier-situation-tete">
            <div>
              <h3 id="fiche-situation-titre" className="fiche-crm-titre">
                Situation
              </h3>
              <p className="fiche-dossier-situation-titre">{titreSituation}</p>
            </div>
            <Pill tone={delai.ton}>{delai.texte}</Pill>
          </div>
          <ol className={`fiche-dossier-frise${etapeEnCours < 0 ? ' is-arretee' : ''}`} aria-label="Étapes du dossier">
            {ETAPES.map((e, i) => {
              const fait = etapeEnCours >= 0 && i < etapeEnCours;
              const courant = i === etapeEnCours;
              // Étape 1 : créée le…, ou revenue après un renvoi / une offre reprise.
              const retour =
                i === 0
                  ? historique
                      ?.filter((t) => t.vers === 'nouveau_projet' && t.de && t.de !== t.vers)
                      .map((t) => t.le)
                      .pop()
                  : undefined;
              const le = i === 0 ? (retour ?? projet.creeLe) : passageA(e.statut);
              const verbe = i === 0 && retour ? 'revenu le' : 'le';
              return (
                <li
                  key={e.statut}
                  className={fait ? 'is-fait' : courant ? 'is-courant' : undefined}
                  aria-current={courant ? 'step' : undefined}
                >
                  <span className="fiche-dossier-noeud" aria-hidden>
                    {fait ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="fiche-dossier-etape">{e.libelle}</span>
                  <span className="fiche-dossier-quand">
                    {fait || courant ? (le ? `${verbe} ${formatDate(le)}` : courant ? 'en cours' : '—') : 'à venir'}
                  </span>
                </li>
              );
            })}
          </ol>
          {archive && (
            <p className="fiche-crm-note">
              Lead archivé le {formatDate(archive.le)}
              {archive.par ? ` par ${archive.par.nom}` : ''} : consultable seulement, son code reste réservé.
            </p>
          )}
        </section>

        <div id={idSection('fiche')} className="fiche-dossier-bloc" tabIndex={-1}>
          {(editable || editionFigee) && (
            <CaracteristiquesProjet
              projet={projet}
              // Fiche figée : la trace de la modification s'affiche aussitôt.
              onModifier={async (champs) => {
                await onModifierFiche(champs);
                if (editionFigee) setVersionHistorique((v) => v + 1);
              }}
              prixFige={editionFigee}
            />
          )}

          {(!(editable || editionFigee) || rattachable) && (
            <section className="fiche-crm-section">
              {!(editable || editionFigee) && (
                <>
                  <div className="fiche-crm-titre-ligne">
                    <h3 className="fiche-crm-titre">Les {champs.length} champs de la fiche</h3>
                    {projet.verrouillee && (
                      <span className="fiche-crm-badge">
                        <Lock size={11} aria-hidden /> Verrouillé depuis l’émission de l’offre
                      </span>
                    )}
                  </div>
                  <dl className="fiche-crm-champs">
                    {champs.map((c) => (
                      <div key={c.libelle}>
                        <dt>{c.libelle}</dt>
                        <dd>
                          <span className="fiche-crm-valeur">{c.valeur}</span>
                          <span className="fiche-crm-aide">{c.aide}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {rattachable && (
                <div className="field-bloc">
                  <label className="field-label" htmlFor="rattacher-localite">
                    Rattacher au référentiel des localités
                  </label>
                  <span className="field-aide">
                    Libellé saisi à la création : « {projet.localisation} ». Le code du dossier ne change pas.
                  </span>
                  <LocaliteSelect
                    localites={localites}
                    valeur={localiteId}
                    onChange={setLocaliteId}
                    idChamp="rattacher-localite"
                  />
                  {erreur && <FieldError>{erreur}</FieldError>}
                  <div className="modal-actions">
                    <button type="button" className="btn-primary" disabled={enCours || !localiteId} onClick={rattacher}>
                      {enCours ? 'Rattachement…' : 'Rattacher'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Sans la Lecture de « Fiche apporteur », la section n'est pas envoyée. */}
        {'apporteur' in projet && (
          <div id={idSection('apporteur')} className="fiche-dossier-bloc" tabIndex={-1}>
            <FicheApporteurSection
              slug={slug}
              projet={projet}
              onModifie={async () => {
                await onMaj();
                setVersionHistorique((v) => v + 1);
              }}
            />
          </div>
        )}

        {!archive && (
          <div id={idSection('offre')} className="fiche-dossier-bloc" tabIndex={-1}>
            <section className="fiche-crm-section fiche-crm-actions" aria-labelledby="fiche-offre-titre">
              <h3 id="fiche-offre-titre" className="fiche-crm-titre">
                Offre &amp; contrat
              </h3>
              <CycleDossier
                slug={slug}
                projet={projet}
                onAgir={async (action, commentaire) => {
                  const emise = await onAgir(action, commentaire);
                  if (emise) setLienEmis(emise);
                }}
              />
              <OffreDossier
                slug={slug}
                projet={projet}
                peutPreparer={peutPreparerOffre}
                depuisFinances={depuisFinances}
                onMaj={onMaj}
                lienEmis={lienEmis}
                onLienEmis={setLienEmis}
              />
              <ContratDossier slug={slug} projet={projet} peutPreparer={peutPreparerOffre} onMaj={onMaj} />
              {/* Onboard : le Dir. GC affecte le projet à une équipe (29/10/2026). */}
              {projet.statut === 'onboard' && projet.projetId && (
                <section className="offre-dossier" aria-label="Équipes du projet">
                  <ProjectTeams slug={slug} projectId={projet.projetId} canEdit={peutAffecterEquipes} />
                </section>
              )}
              {/* Facture directe du lead, sans offre (maquette Finances) : préparée
                    dans Finances, validée par le CFO avant émission. */}
              {peutFacturer && (
                <Link className="btn-ghost fiche-crm-facture" href={`/admin/${slug}/facturation?nouvelle=${projet.id}`}>
                  Émettre une facture directe (Finances)
                </Link>
              )}
            </section>
          </div>
        )}

        <div id={idSection('historique')} className="fiche-dossier-bloc" tabIndex={-1}>
          <section className="fiche-crm-section" aria-labelledby="fiche-historique-titre">
            <h3 id="fiche-historique-titre" className="fiche-crm-titre">
              Historique
            </h3>
            <div className="fiche-crm-passation">
              <div className="fiche-crm-carte">
                <span className="fiche-crm-aide">Créée par</span>
                <strong>{projet.creePar?.nom ?? 'Non renseigné'}</strong>
                <span className="fiche-crm-aide">automatique, non modifiable</span>
              </div>
              {/* Sans la Lecture de « Propriétaire du dossier », pas de propriétaire. */}
              {'proprietaire' in projet && <ArrowRight size={18} aria-hidden className="fiche-crm-fleche" />}
              {'proprietaire' in projet && (
                <div className="fiche-crm-carte fiche-crm-carte--proprio">
                  <span className="fiche-crm-aide">Propriétaire</span>
                  {peutReassigner && !archive && proprietaires && proprietaires.length > 0 ? (
                    <select
                      className="field-input"
                      aria-label="Propriétaire de la fiche"
                      value={projet.proprietaire?.id ?? ''}
                      disabled={reassignation}
                      onChange={(e) => reassigner(e.target.value)}
                    >
                      {!projet.proprietaire && <option value="">À assigner…</option>}
                      {proprietaires.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <strong>{projet.proprietaire?.nom ?? 'À assigner'}</strong>
                  )}
                  <span className="fiche-crm-aide">pilote la fiche jusqu’au contrat</span>
                </div>
              )}
            </div>
            {erreurProprio && <FieldError>{erreurProprio}</FieldError>}
            {!historique ? (
              <Skeleton size="sm" />
            ) : historique.length === 0 && !archive ? (
              <p className="fiche-crm-aide">Aucun événement enregistré.</p>
            ) : (
              <ol className="fiche-crm-historique fiche-dossier-fil">
                {/* L'archivage est le dernier événement : en tête du fil. */}
                {archive && (
                  <li>
                    <span className="fiche-dossier-point" aria-hidden />
                    <span>
                      <span className="fiche-dossier-evenement">
                        Lead archivé{archive.par ? ` par ${archive.par.nom}` : ''}
                      </span>
                      <time dateTime={archive.le}>
                        le {formatDate(archive.le)} à {formatTime(archive.le)}
                      </time>
                    </span>
                  </li>
                )}
                {[...historique].reverse().flatMap((t) =>
                  libellesTransition(t).map((libelle, i) => (
                    <li key={`${t.id}-${i}`}>
                      <span className="fiche-dossier-point" aria-hidden />
                      <span>
                        <span className="fiche-dossier-evenement">{libelle}</span>
                        <time dateTime={t.le}>
                          le {formatDate(t.le)} à {formatTime(t.le)}
                        </time>
                      </span>
                    </li>
                  )),
                )}
              </ol>
            )}
          </section>
        </div>
      </div>

      {prochaine && (
        <footer className="fiche-dossier-pied">
          <div className="fiche-dossier-prochaine">
            <span>Prochaine étape</span>
            <strong>{prochaine}</strong>
          </div>
          {principal ? (
            <button type="button" className="btn-primary" onClick={() => aller('offre', boutonPrincipal())}>
              {principal} <ArrowRight size={16} aria-hidden />
            </button>
          ) : ficheIncomplete && editable ? (
            <button type="button" className="btn-primary" onClick={completer}>
              Compléter la fiche <ArrowRight size={16} aria-hidden />
            </button>
          ) : null}
        </footer>
      )}

      {confirmerArchive && (
        <ConfirmModal
          title={archive ? `Désarchiver ${projet.code} ?` : `Archiver ${projet.code} ?`}
          message={
            archive
              ? 'Le lead revient en « Nouveau projet », dans le pipeline et dans les calculs.'
              : 'Un lead incomplet ou mal renseigné s’archive, il ne se supprime jamais : il reste consultable dans « Archivés », son code reste réservé, et il ne compte plus dans les tableaux de bord. Il pourra être désarchivé.'
          }
          confirmLabel={archive ? 'Désarchiver' : 'Archiver'}
          danger={!archive}
          onTop
          onConfirm={archiver}
          onClose={() => setConfirmerArchive(false)}
        />
      )}
    </Drawer>
  );
}
