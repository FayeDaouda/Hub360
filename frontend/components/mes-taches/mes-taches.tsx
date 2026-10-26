'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlarmClock,
  AtSign,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Ellipsis,
  Hourglass,
  RotateCcw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { useEnteteFixe } from '@/lib/entete-fixe';
import { getAbsencesAValider } from '@/lib/demandes';
import { lireFichier } from '@/lib/fichiers';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { useMediaQuery } from '@/lib/media';
import {
  dateEffective,
  estEnRetard,
  getMesTaches,
  getTachesAValider,
  relancerTache,
  remettreTache,
} from '@/lib/mon-espace';
import {
  getMesMentions,
  marquerMentionLue,
  publierCommentaire,
  type CorpsRemise,
  type MentionRecue,
} from '@/lib/projets-ouverts';
import type { StatsPerformances, TacheMonEspace } from '@/lib/types';
import { RemiseModal } from '@/components/mon-espace/remise-modal';
import { TacheDrawer } from './tache-drawer';
import { prenomAffiche } from '@/lib/profil';
import { daysBetween, formatDayMonth, toIsoDay, todayIso } from '@/lib/dates';
import { plural } from '@/lib/text';

type MesTachesApi = { taches: TacheMonEspace[]; stats: StatsPerformances };
type Filtre = 'reprises' | 'retards' | 'semaine' | 'attente' | 'mentions';
type Vue = 'urgence' | 'projet';
// Ton de couleur (tokens --pill-*) : bande de la ligne, compteur du filtre.
type Ton = 'risque' | 'attention' | 'info' | 'iris' | 'neutre';
type Pieces = { nom: string; url: string }[];

const MAX_PIECES = 5;
// Délai pendant lequel un dépôt peut être annulé (envoi différé, aucune
// annulation côté serveur).
const DELAI_ANNULATION_MS = 5000;

// Changement d'état animé (View Transitions) : une tâche déposée glisse vers
// sa nouvelle place (« En validation », colonne de droite) au lieu de sauter.
function animer(maj: () => void) {
  const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduit && typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => flushSync(maj));
  } else {
    maj();
  }
}
// Nom de transition d'une tâche (unique : une tâche n'est rendue qu'une fois).
const transition = (id: string) => ({ viewTransitionName: `mt-${id}` }) as CSSProperties;
// Ce qu'une carte vide dit de bien (un « 0 » gris ressemblait à une erreur).
const VIDE: Record<Filtre, string> = {
  retards: 'aucun retard',
  reprises: 'rien à reprendre',
  semaine: 'rien d’ici dimanche',
  attente: 'rien en attente',
  mentions: 'tout est lu',
};
const CLE_VUE = 'hub.mes-taches.vue';

const parEcheance = (a: TacheMonEspace, b: TacheMonEspace) =>
  (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999');
const decaler = (iso: string, jours: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return toIsoDay(d);
};
const jourSemaine = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
// Date qui fait foi pour l'urgence : la nouvelle date accordée si la tâche est
// prolongée, sinon l'échéance.
const parDateEffective = (a: TacheMonEspace, b: TacheMonEspace) =>
  (dateEffective(a) ?? '9999').localeCompare(dateEffective(b) ?? '9999');

// Échéance lue d'un coup d'œil : « 14 j de retard », « Aujourd’hui », « Dans 3 j ».
function relatif(echeance: string, aujourdhui: string): string {
  const n = daysBetween(aujourdhui, echeance);
  if (n < 0) return `${-n} j de retard`;
  if (n === 0) return 'Aujourd’hui';
  if (n === 1) return 'Demain';
  return `Dans ${n} j`;
}

// Le retard est un attribut, pas une catégorie (23/10/2026) : une tâche à
// reprendre dont l'échéance est passée compte aussi « En retard ». Les cartes
// se recoupent donc ; la liste, elle, montre chaque tâche une seule fois, à sa
// place la plus urgente.
// « déposée il y a 4 j » : depuis quand le N+1 a la tâche entre les mains.
function attenteDepuis(remisLe: string, aujourdhui: string): string {
  const n = daysBetween(remisLe.slice(0, 10), aujourdhui);
  if (n <= 0) return 'déposée aujourd’hui';
  if (n === 1) return 'déposée hier';
  return `déposée il y a ${n} j`;
}

const FILTRES: { cle: Filtre; libelle: string; aide: string; icone: LucideIcon; ton: Ton }[] = [
  { cle: 'retards', libelle: 'En retard', aide: 'échéance dépassée', icone: AlarmClock, ton: 'risque' },
  { cle: 'reprises', libelle: 'À reprendre', aide: 'renvoyées par votre N+1', icone: RotateCcw, ton: 'risque' },
  { cle: 'semaine', libelle: 'Cette semaine', aide: 'à rendre d’ici dimanche', icone: CalendarClock, ton: 'attention' },
  { cle: 'attente', libelle: 'En validation', aide: 'déposées chez votre N+1', icone: Hourglass, ton: 'info' },
  { cle: 'mentions', libelle: 'Mentions', aide: 'à lire dans les fils', icone: AtSign, ton: 'iris' },
];

// « Mes tâches » (revue Salarié, 19/10/2026 ; logique et mots revus le
// 23/10/2026) : la réponse à « qu'est-ce que je dois faire aujourd'hui ? ».
// Salut + résumé (pas de second titre « Mes tâches »), cartes-filtres en
// en-tête fixe ; un filtre n'affiche que sa liste. Vue par urgence : en
// retard (du plus ancien), à reprendre, cette semaine, en validation. Une
// mention non lue s'affiche sur la ligne de sa tâche. Une tâche s'ouvre en
// panneau latéral (celui de Projets) ; un fichier glissé sur sa ligne prépare
// son dépôt. Vue par urgence ou par projet.
export function MesTaches({ slug }: { slug: string }) {
  // Titre vide : le salut tient lieu de titre (la barre latérale situe déjà
  // la page).
  useTitrePage('');
  const { utilisateur } = useSessionCourante();
  const base = `/admin/${slug}`;
  const aujourdhui = useMemo(() => todayIso(), []);
  const [donnees, setDonnees] = useState<MesTachesApi | null>(null);
  // Relance du validateur, par tâche (aside « Chez mon N+1 »).
  const [relances, setRelances] = useState<Record<string, 'envoi' | 'ok' | { erreur: string }>>({});
  const [mentions, setMentions] = useState<MentionRecue[]>([]);
  const [aDecider, setADecider] = useState({ taches: 0, absences: 0 });
  // ?filtre= : lien d'une tuile de Projets (« Mes tâches en retard »…).
  const demande = useSearchParams().get('filtre');
  const [filtreChoisi, setFiltre] = useState<Filtre | null>(
    FILTRES.some((f) => f.cle === demande) ? (demande as Filtre) : null,
  );
  const [vue, setVue] = useState<Vue>('urgence');
  const [tiroir, setTiroir] = useState<{ projetId: string; tacheId: string; prolongation: boolean } | null>(null);
  const [aRemettre, setARemettre] = useState<{ tache: TacheMonEspace; pieces?: Pieces } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Dépôts différés (lot C) : affichés comme déposés tout de suite, envoyés
  // après DELAI_ANNULATION_MS sauf « Annuler ». Le détail vit dans une ref
  // (lu par les minuteries), la liste des ids dans l'état (rendu).
  const depots = useRef(new Map<string, { tache: TacheMonEspace; corps: CorpsRemise; minuterie: number }>());
  const [enEnvoi, setEnEnvoi] = useState<string[]>([]);
  const [toast, setToast] = useState<{ id: string; libelle: string } | null>(null);
  // Un fichier est glissé au-dessus de la fenêtre : les tâches s'allument.
  const [fichierEnVol, setFichierEnVol] = useState(false);

  // Après le chargement : l'en-tête des cartes n'existe pas sous le squelette.
  useEnteteFixe(!!donnees);
  // Grand écran : colonne de droite « Chez mon N+1 » + mentions (lot B).
  const large = useMediaQuery('(min-width: 1400px)');

  // Vue préférée : confort de cet appareil seulement.
  useEffect(() => {
    try {
      if (localStorage.getItem(CLE_VUE) === 'projet') setVue('projet');
    } catch {
      /* stockage indisponible : vue par urgence */
    }
  }, []);
  function choisirVue(v: Vue) {
    setVue(v);
    try {
      localStorage.setItem(CLE_VUE, v);
    } catch {
      /* idem */
    }
  }

  const chargerTaches = useCallback(
    () =>
      getMesTaches(slug)
        .then(setDonnees)
        .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger vos tâches.')),
    [slug],
  );
  const chargerMentions = useCallback(
    () =>
      getMesMentions(slug)
        .then(setMentions)
        .catch(() => setMentions([])),
    [slug],
  );
  useEffect(() => {
    void chargerTaches();
    void chargerMentions();
    // Complément : son échec ne bloque pas la liste.
    Promise.all([getTachesAValider(slug), getAbsencesAValider(slug)])
      .then(([t, a]) => setADecider({ taches: t.length, absences: a.length }))
      .catch(() => setADecider({ taches: 0, absences: 0 }));
  }, [slug, chargerTaches, chargerMentions]);

  const g = useMemo(() => {
    // Dépôt en attente d'envoi : déjà « en validation » à l'écran.
    const vues = (donnees?.taches ?? []).map((t) =>
      enEnvoi.includes(t.id)
        ? { ...t, statut: 'remise' as const, version: t.version + 1, remisLe: aujourdhui, renvoiMotif: null }
        : t,
    );
    const ouvertes = vues.filter((t) => t.statut !== 'validee').sort(parEcheance);
    const lundi = decaler(aujourdhui, -((jourSemaine(aujourdhui) + 6) % 7));
    const dimanche = decaler(lundi, 6);
    // En retard (lib/mon-espace.ts::estEnRetard), du plus ancien au plus récent.
    const retards = ouvertes.filter((t) => estEnRetard(t, aujourdhui)).sort(parDateEffective);
    const enRetard = new Set(retards);
    const reprises = ouvertes.filter((t) => t.statut === 'a_reprendre');
    const semaine = ouvertes
      .filter(
        (t) =>
          !enRetard.has(t) &&
          (t.statut === 'en_cours' || t.statut === 'a_venir' || t.statut === 'prolongee') &&
          !!dateEffective(t) &&
          dateEffective(t)! <= dimanche,
      )
      .sort(parDateEffective);
    const attente = ouvertes.filter((t) => t.statut === 'remise');
    // Sections de la vue par urgence : chaque tâche une fois, à sa place la
    // plus urgente (une reprise en retard est dans « En retard »).
    const sections: Record<Section, TacheMonEspace[]> = {
      retards,
      reprises: reprises.filter((t) => !enRetard.has(t)),
      semaine,
      attente,
    };
    const classees = new Set([...retards, ...reprises, ...semaine, ...attente]);
    const ensuite = ouvertes.filter((t) => !classees.has(t));
    // Ton d'une tâche, quelle que soit la vue : la bande de sa ligne.
    const tonDe = (t: TacheMonEspace): Ton =>
      enRetard.has(t) || t.statut === 'a_reprendre'
        ? 'risque'
        : semaine.includes(t)
          ? 'attention'
          : attente.includes(t)
            ? 'info'
            : 'neutre';
    // Ordre d'urgence (vue par projet) : retard, reprise, semaine, validation, le reste.
    const rang = (t: TacheMonEspace) => {
      const i = SECTIONS.findIndex((cle) => sections[cle].includes(t));
      return i < 0 ? SECTIONS.length : i;
    };
    // Tâches qui demandent une action (sans double compte).
    const urgences = new Set([...retards, ...reprises, ...semaine]).size;
    return {
      ouvertes,
      retards,
      reprises,
      semaine,
      attente,
      sections,
      ensuite,
      dimanche,
      enRetard,
      tonDe,
      rang,
      urgences,
    };
  }, [donnees, aujourdhui, enEnvoi]);

  // Fichier glissé au-dessus de la fenêtre (compteur : dragenter/dragleave
  // se déclenchent à chaque élément traversé). Lâché hors d'une tâche, il
  // n'est pas ouvert par le navigateur.
  useEffect(() => {
    let profondeur = 0;
    const fichiers = (e: globalThis.DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const entre = (e: globalThis.DragEvent) => {
      if (!fichiers(e)) return;
      profondeur += 1;
      setFichierEnVol(true);
    };
    const sort = (e: globalThis.DragEvent) => {
      if (!fichiers(e)) return;
      profondeur = Math.max(0, profondeur - 1);
      if (profondeur === 0) setFichierEnVol(false);
    };
    const dessus = (e: globalThis.DragEvent) => {
      if (fichiers(e)) e.preventDefault();
    };
    const fin = (e: globalThis.DragEvent) => {
      if (fichiers(e)) e.preventDefault();
      profondeur = 0;
      setFichierEnVol(false);
    };
    window.addEventListener('dragenter', entre);
    window.addEventListener('dragleave', sort);
    window.addEventListener('dragover', dessus);
    window.addEventListener('drop', fin);
    return () => {
      window.removeEventListener('dragenter', entre);
      window.removeEventListener('dragleave', sort);
      window.removeEventListener('dragover', dessus);
      window.removeEventListener('drop', fin);
    };
  }, []);

  // Quitter la page pendant le délai d'annulation : les dépôts partent tout
  // de suite (rien n'est perdu) ; fermer l'onglet demande confirmation.
  useEffect(() => {
    const enCours = depots.current;
    const avantFermeture = (e: BeforeUnloadEvent) => {
      if (enCours.size) e.preventDefault();
    };
    window.addEventListener('beforeunload', avantFermeture);
    return () => {
      window.removeEventListener('beforeunload', avantFermeture);
      for (const d of enCours.values()) {
        clearTimeout(d.minuterie);
        void remettreTache(slug, d.tache, d.corps).catch(() => undefined);
      }
      enCours.clear();
    };
  }, [slug]);

  // Clavier (ordinateur) : J / K passe d'une tâche à l'autre, Entrée l'ouvre
  // (bouton du titre), D la dépose. Rien quand on écrit ou qu'une fenêtre
  // (dépôt, panneau de tâche) est ouverte.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const touche = e.key.toLowerCase();
      if (touche !== 'j' && touche !== 'k' && touche !== 'd') return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.modal-backdrop, .fiche-crm-fond')) return;
      const titres = [...document.querySelectorAll<HTMLButtonElement>('.mt-liste [data-tache] .mt-titre-bouton')];
      if (!titres.length) return;
      const i = titres.findIndex((b) => b.closest('[data-tache]')?.contains(document.activeElement));
      if (touche === 'd') {
        if (i < 0) return;
        titres[i].closest('[data-tache]')?.querySelector<HTMLButtonElement>('[data-action="deposer"]')?.click();
      } else {
        const suivant = i < 0 ? 0 : touche === 'j' ? Math.min(i + 1, titres.length - 1) : Math.max(i - 1, 0);
        titres[suivant].focus();
        titres[suivant].scrollIntoView({ block: 'nearest' });
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, []);

  const nonLues = mentions.filter((m) => !m.lue).length;
  const compte: Record<Filtre, number> = {
    retards: g.retards.length,
    reprises: g.reprises.length,
    semaine: g.semaine.length,
    attente: g.attente.length,
    mentions: nonLues,
  };
  const disponible = (f: Filtre) => (f === 'mentions' ? mentions.length > 0 : compte[f] > 0);
  // Un filtre dont la liste s'est vidée (dernière tâche remise) rend « tout ».
  const filtre = filtreChoisi && disponible(filtreChoisi) ? filtreChoisi : null;

  if (!donnees) {
    return erreur ? (
      <p className="empty-state">{erreur}</p>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const { urgences } = g;
  const nbADecider = aDecider.taches + aDecider.absences;
  const filtreActif = FILTRES.find((f) => f.cle === filtre);
  // Colonne de droite : vue par urgence sans filtre, sur grand écran. Les
  // tâches en validation et les mentions sans tâche y passent (la liste
  // principale ne garde que ce qui demande une action).
  const avecCote = large && vue === 'urgence' && !filtre;

  function choisirFiltre(f: Filtre) {
    setFiltre((x) => (x === f ? null : f));
  }
  function toutAfficher() {
    setFiltre(null);
  }
  function rafraichir() {
    void chargerTaches();
    void chargerMentions();
  }

  // Relance du validateur : la liste revient du serveur (prochaine relance
  // repoussée de 3 jours ouvrés) ; « Relance envoyée » reste affiché.
  async function relancer(t: TacheMonEspace) {
    setRelances((r) => ({ ...r, [t.id]: 'envoi' }));
    try {
      setDonnees(await relancerTache(slug, t));
      setRelances((r) => ({ ...r, [t.id]: 'ok' }));
    } catch (e) {
      setRelances((r) => ({ ...r, [t.id]: { erreur: e instanceof Error ? e.message : 'Relance impossible.' } }));
    }
  }

  // Dépôt confirmé dans la fenêtre : affiché comme fait, envoyé après le
  // délai d'annulation.
  function deposerDiffere(t: TacheMonEspace, corps: CorpsRemise) {
    setErreur(null);
    const minuterie = window.setTimeout(() => void envoyer(t.id), DELAI_ANNULATION_MS);
    depots.current.set(t.id, { tache: t, corps, minuterie });
    animer(() => setEnEnvoi((ids) => [...ids.filter((x) => x !== t.id), t.id]));
    setToast({ id: t.id, libelle: t.libelle });
  }
  async function envoyer(id: string) {
    const d = depots.current.get(id);
    if (!d) return;
    depots.current.delete(id);
    setToast((x) => (x?.id === id ? null : x));
    try {
      const r = await remettreTache(slug, d.tache, d.corps);
      setDonnees(r);
      setEnEnvoi((ids) => ids.filter((x) => x !== id));
    } catch (e) {
      // Échec : la tâche revient à sa place, avec le motif.
      animer(() => setEnEnvoi((ids) => ids.filter((x) => x !== id)));
      setErreur(`Le dépôt de « ${d.tache.libelle} » a échoué : ${e instanceof Error ? e.message : 'erreur inconnue'}.`);
    }
  }
  function annulerDepot(id: string) {
    const d = depots.current.get(id);
    if (!d) return;
    clearTimeout(d.minuterie);
    depots.current.delete(id);
    setToast(null);
    animer(() => setEnEnvoi((ids) => ids.filter((x) => x !== id)));
  }

  // Fichiers glissés sur une ligne : lus puis remis via la fenêtre habituelle.
  async function deposer(t: TacheMonEspace, fichiers: FileList) {
    setErreur(null);
    try {
      const lus = await Promise.all([...fichiers].slice(0, MAX_PIECES).map((f) => lireFichier(f)));
      setARemettre({ tache: t, pieces: lus.map(({ nom, url }) => ({ nom, url })) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    }
  }

  // Tâches à afficher selon le filtre (cartes) et la vue.
  const selection: TacheMonEspace[] = filtre === 'mentions' ? [] : filtre ? g[filtre] : g.ouvertes;
  const parProjet = groupesParProjet(selection, g.rang);
  // Lignes réellement affichées (« Plus tard » est replié) : une mention non
  // lue s'y accroche ; les autres restent dans la section Mentions.
  const affichees = new Set(
    (vue === 'projet' || filtre
      ? selection
      : SECTIONS.filter((cle) => !(avecCote && cle === 'attente')).flatMap((cle) => g.sections[cle])
    ).map((t) => t.id),
  );
  const mentionsDe = new Map<string, MentionRecue[]>();
  if (filtre !== 'mentions') {
    for (const m of mentions) {
      if (m.lue || !m.tacheId || !affichees.has(m.tacheId)) continue;
      mentionsDe.set(m.tacheId, [...(mentionsDe.get(m.tacheId) ?? []), m]);
    }
  }
  const mentionsSeules = mentions.filter((m) => !(m.tacheId && mentionsDe.has(m.tacheId)));

  // Pastille de mention : ouvre la tâche (le fil est dans le panneau) et
  // marque ses mentions comme lues.
  function ouvrirMentions(t: TacheMonEspace, liste: MentionRecue[]) {
    setTiroir({ projetId: t.projetId, tacheId: t.id, prolongation: false });
    void Promise.all(liste.map((m) => marquerMentionLue(slug, m.id)))
      .then(() => chargerMentions())
      .catch(() => undefined);
  }

  const ligneMention = (m: MentionRecue) => (
    <LigneMention
      key={m.id}
      slug={slug}
      m={m}
      onOuvrir={() =>
        m.tacheId ? setTiroir({ projetId: m.projetId, tacheId: m.tacheId, prolongation: false }) : undefined
      }
      base={base}
      onMaj={() => void chargerMentions()}
    />
  );

  const ligne = (t: TacheMonEspace, sansProjet = false) => (
    <LigneTache
      key={t.id}
      t={t}
      ton={g.tonDe(t)}
      enRetard={g.enRetard.has(t)}
      base={base}
      aujourdhui={aujourdhui}
      sansProjet={sansProjet}
      mentions={mentionsDe.get(t.id)}
      onMentions={(liste) => ouvrirMentions(t, liste)}
      onOuvrir={(prolongation) => setTiroir({ projetId: t.projetId, tacheId: t.id, prolongation })}
      onDeposerTache={t.statut === 'remise' || t.statut === 'bloquee' ? undefined : () => setARemettre({ tache: t })}
      onFichiers={t.statut === 'remise' ? undefined : (f) => void deposer(t, f)}
      fichierEnVol={fichierEnVol}
    />
  );

  return (
    <div className="mt-page page-entete-fixe">
      <div className="mt-accueil">
        <div>
          <h1 className="mt-accueil-titre">
            {/* Heure de l'appareil, exception voulue au fuseau de Dakar (glossaire). */}
            {new Date().getHours() >= 18 ? 'Bonsoir' : 'Bonjour'} {prenomAffiche(utilisateur)}
          </h1>
          <p className="mt-accueil-sous">
            <span className="mt-accueil-date">
              {new Date(`${aujourdhui}T12:00:00Z`).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })}
              {' · '}
            </span>
            {urgences === 0
              ? 'rien d’urgent aujourd’hui'
              : `${urgences} tâche${urgences > 1 ? 's demandent' : ' demande'} votre attention`}
            {nonLues > 0 && `, ${plural(nonLues, 'mention')} à lire`}
          </p>
        </div>
        <div className="vue-toggle" role="group" aria-label="Présentation">
          {(['urgence', 'projet'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={vue === v ? 'is-active' : ''}
              aria-pressed={vue === v}
              onClick={() => choisirVue(v)}
            >
              <span className="mt-long">{v === 'urgence' ? 'Par urgence' : 'Par projet'}</span>
              <span className="mt-court" aria-hidden>
                {v === 'urgence' ? 'Urgence' : 'Projet'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-entete entete-fixe">
        <div className="mt-filtres" role="group" aria-label="Filtrer mes tâches">
          {FILTRES.map((f) => {
            const n = compte[f.cle];
            const actif = filtre === f.cle;
            return (
              <button
                key={f.cle}
                type="button"
                className={`mt-filtre${actif ? ' is-actif' : ''}${n === 0 ? ' is-vide' : ''}`}
                data-ton={n > 0 ? f.ton : 'succes'}
                aria-pressed={actif}
                disabled={!disponible(f.cle)}
                onClick={() => choisirFiltre(f.cle)}
              >
                <span className="mt-filtre-icone" aria-hidden>
                  <f.icone size={16} />
                </span>
                <span className="mt-filtre-texte">
                  <span className="mt-filtre-libelle">{f.libelle}</span>
                  <span className="mt-filtre-aide">
                    {n === 0 ? VIDE[f.cle] : f.cle === 'semaine' ? `d’ici le ${formatDayMonth(g.dimanche)}` : f.aide}
                  </span>
                </span>
                <span className="mt-filtre-compte">
                  {n === 0 ? <Check size={20} strokeWidth={2.5} aria-label="0" /> : n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {erreur && <p className="field-erreur">{erreur}</p>}

      {nbADecider > 0 && !filtre && (
        <div className="mt-bandeau">
          <p>
            <strong>Vous êtes N+1.</strong>{' '}
            {[
              aDecider.taches && `${plural(aDecider.taches, 'tâche')} remise${aDecider.taches > 1 ? 's' : ''}`,
              aDecider.absences && `${plural(aDecider.absences, 'demande')} d’absence`,
            ]
              .filter(Boolean)
              .join(' et ')}{' '}
            attend{nbADecider > 1 ? 'ent' : ''} votre décision.
          </p>
          <Link className="btn-primary btn-primary--sm" href={`${base}/mon-espace?onglet=a-valider`}>
            Décider
          </Link>
        </div>
      )}

      <div className="mt-colonnes" data-cote={avecCote || undefined}>
        <section className="panel glass-panel mt-liste" aria-live="polite">
          {filtreActif && (
            <div className="mt-filtre-etat">
              <span>{`${filtreActif.libelle} · ${filtre === 'mentions' ? mentions.length : compte[filtreActif.cle]}`}</span>
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={toutAfficher}>
                <X size={14} aria-hidden /> Tout afficher
              </button>
            </div>
          )}

          {!filtre && urgences === 0 && (
            <div className="mt-calme">
              <CheckCircle2 size={28} aria-hidden />
              <div>
                <p className="mt-calme-titre">Tout est à jour</p>
                <p>Rien en retard, rien à reprendre, rien à rendre d’ici dimanche.</p>
              </div>
            </div>
          )}

          {vue === 'projet' && filtre !== 'mentions' ? (
            parProjet.map((p) => (
              <Groupe key={p.projetId} titre={`${p.code} · ${p.client}`} ton="neutre" n={p.taches.length} projet>
                {p.taches.map((t) => ligne(t, true))}
              </Groupe>
            ))
          ) : (
            <>
              {/* Sans filtre : sections sans compteur (déjà sur les cartes,
                        et une reprise en retard n'est listée qu'une fois). Avec
                        un filtre : sa liste complète. */}
              {SECTIONS.filter((f) => (filtre === null || filtre === f) && !(avecCote && f === 'attente')).map((f) => {
                const liste = filtre ? g[f] : g.sections[f];
                // Une reprise en retard est listée une fois, sous « En
                // retard » : la section le dit, pour que le compteur de
                // la carte (qui la compte aussi) se comprenne.
                const ailleurs = filtre ? 0 : g[f].length - g.sections[f].length;
                const note = ailleurs > 0 ? `et ${plural(ailleurs, 'autre')} en retard, plus haut` : undefined;
                return (
                  <Groupe
                    key={f}
                    titre={TITRES[f]}
                    ton={FILTRES.find((x) => x.cle === f)!.ton}
                    n={liste.length}
                    masquerTitre={!!filtre}
                    sansCompte
                    note={note}
                  >
                    {liste.map((t) => ligne(t))}
                  </Groupe>
                );
              })}
              {filtre === null && g.ensuite.length > 0 && (
                <details className="mt-plus-tard">
                  <summary>
                    <ChevronDown size={16} aria-hidden className="mt-plus-tard-chevron" />
                    Plus tard · {g.ensuite.length}
                  </summary>
                  <ul className="mt-lignes">{g.ensuite.map((t) => ligne(t))}</ul>
                </details>
              )}
            </>
          )}

          {(filtre === null || filtre === 'mentions') && !avecCote && (
            <Groupe
              titre="Mentions"
              ton="iris"
              n={mentionsSeules.length}
              masquerTitre={filtre === 'mentions'}
              sansCompte
            >
              {mentionsSeules.map(ligneMention)}
            </Groupe>
          )}
        </section>

        {avecCote && (
          <aside className="mt-cote" aria-label="En attente de validation et mentions">
            <section className="panel glass-panel mt-cote-bloc">
              <h2 className="mt-groupe-titre" data-ton="info">
                Chez mon N+1
              </h2>
              {g.attente.length === 0 ? (
                <p className="mt-cote-vide">Aucune tâche en attente de validation.</p>
              ) : (
                <ul className="mt-cote-liste">
                  {g.attente.map((t) => {
                    const relance = relances[t.id];
                    const relancable = !!t.relancePossibleLe && t.relancePossibleLe <= aujourdhui && relance !== 'ok';
                    return (
                      <li key={t.id} className="mt-cote-item">
                        <button
                          type="button"
                          className="mt-cote-tache"
                          style={transition(t.id)}
                          onClick={() => setTiroir({ projetId: t.projetId, tacheId: t.id, prolongation: false })}
                        >
                          <span className="mt-cote-titre">{t.libelle}</span>
                          <span className="mt-cote-meta">
                            v{String(t.version).padStart(2, '0')} ·{' '}
                            {t.remisLe ? attenteDepuis(t.remisLe, aujourdhui) : 'en validation'}
                          </span>
                          <span className="mt-cote-meta">chez {t.validateur ?? 'un validateur à désigner'}</span>
                        </button>
                        {relance === 'ok' ? (
                          <span className="mt-cote-relance-ok" role="status">
                            <Check size={14} aria-hidden /> Relance envoyée
                          </span>
                        ) : (
                          relancable && (
                            <button
                              type="button"
                              className="btn-ghost btn-ghost--sm mt-cote-relancer"
                              disabled={relance === 'envoi'}
                              onClick={() => void relancer(t)}
                            >
                              <BellRing size={14} aria-hidden /> {relance === 'envoi' ? 'Envoi…' : 'Relancer'}
                            </button>
                          )
                        )}
                        {relance && typeof relance === 'object' && (
                          <span className="field-erreur">{relance.erreur}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {mentionsSeules.length > 0 && (
              <section className="panel glass-panel mt-cote-bloc">
                <h2 className="mt-groupe-titre" data-ton="iris">
                  Mentions
                </h2>
                <ul className="mt-lignes">{mentionsSeules.map(ligneMention)}</ul>
              </section>
            )}
          </aside>
        )}
      </div>

      {/* Glisser-déposer et raccourcis clavier : dans l'aide « ? » (fiche
          Mes tâches) ; ici, seulement le lien vers l'historique. */}
      <p className="dmd-note mt-pied">
        Historique et respect des délais :{' '}
        <Link className="lien-inline" href={`${base}/mon-espace?onglet=performances`}>
          Mon espace › Mes performances
        </Link>
        .
      </p>

      {aRemettre && (
        <RemiseModal
          slug={slug}
          tache={aRemettre.tache}
          piecesInitiales={aRemettre.pieces}
          onEnvoyer={(corps) => deposerDiffere(aRemettre.tache, corps)}
          onClose={() => setARemettre(null)}
        />
      )}
      {fichierEnVol && <p className="mt-depot-aide">Lâchez le fichier sur la tâche à déposer</p>}
      {toast && <ToastDepot key={toast.id} libelle={toast.libelle} onAnnuler={() => annulerDepot(toast.id)} />}
      {tiroir && (
        <TacheDrawer
          key={`${tiroir.tacheId}:${tiroir.prolongation}`}
          slug={slug}
          projetId={tiroir.projetId}
          tacheId={tiroir.tacheId}
          moiId={utilisateur.id}
          prolongation={tiroir.prolongation}
          onMaj={rafraichir}
          onClose={() => setTiroir(null)}
          onVoisine={(sens) => {
            // Ordre affiché dans la liste (sections, vue, filtre) : celui de J / K.
            const ids = [...document.querySelectorAll<HTMLElement>('.mt-liste .mt-ligne[data-tache]')].map(
              (el) => el.dataset.tache!,
            );
            const suivant = ids[ids.indexOf(tiroir.tacheId) + sens];
            const t = suivant && donnees?.taches.find((x) => x.id === suivant);
            if (t) setTiroir({ projetId: t.projetId, tacheId: t.id, prolongation: false });
          }}
        />
      )}
    </div>
  );
}

type Section = Exclude<Filtre, 'mentions'>;
// Ordre d'urgence des sections (et des cartes).
const SECTIONS: Section[] = ['retards', 'reprises', 'semaine', 'attente'];
const TITRES: Record<Section, string> = {
  retards: 'En retard',
  reprises: 'À reprendre',
  semaine: 'À rendre cette semaine',
  attente: 'En attente de validation',
};

// Vue par projet : un groupe par projet, les plus urgents d'abord.
function groupesParProjet(taches: TacheMonEspace[], rang: (t: TacheMonEspace) => number) {
  const parId = new Map<string, { projetId: string; code: string; client: string; taches: TacheMonEspace[] }>();
  for (const t of taches) {
    const p = parId.get(t.projetId) ?? { projetId: t.projetId, code: t.projetCode, client: t.projetClient, taches: [] };
    p.taches.push(t);
    parId.set(t.projetId, p);
  }
  const groupes = [...parId.values()];
  for (const p of groupes) p.taches.sort((a, b) => rang(a) - rang(b) || parDateEffective(a, b));
  return groupes.sort((a, b) => rang(a.taches[0]) - rang(b.taches[0]) || parDateEffective(a.taches[0], b.taches[0]));
}

function Groupe({
  titre,
  ton,
  n,
  masquerTitre = false,
  projet = false,
  sansCompte = false,
  note,
  children,
}: {
  titre: string;
  ton: Ton;
  n: number;
  masquerTitre?: boolean;
  projet?: boolean;
  sansCompte?: boolean;
  note?: string;
  children: ReactNode;
}) {
  if (n === 0) return null;
  return (
    <div className="mt-groupe">
      {!masquerTitre && (
        <h2 className={`mt-groupe-titre${projet ? ' mt-groupe-titre--projet' : ''}`} data-ton={ton}>
          {titre} {!sansCompte && <span className="mt-groupe-compte">{n}</span>}
          {note && <span className="mt-groupe-note">{note}</span>}
        </h2>
      )}
      <ul className="mt-lignes">{children}</ul>
    </div>
  );
}

function LigneTache({
  t,
  ton,
  enRetard,
  base,
  aujourdhui,
  sansProjet,
  mentions,
  onMentions,
  onOuvrir,
  onDeposerTache,
  onFichiers,
  fichierEnVol,
}: {
  t: TacheMonEspace;
  ton: Ton;
  enRetard: boolean;
  base: string;
  aujourdhui: string;
  sansProjet: boolean;
  mentions?: MentionRecue[];
  onMentions: (liste: MentionRecue[]) => void;
  onOuvrir: (prolongation: boolean) => void;
  onDeposerTache?: () => void;
  onFichiers?: (fichiers: FileList) => void;
  fichierEnVol: boolean;
}) {
  const [survol, setSurvol] = useState(false);
  const echeance =
    t.statut === 'remise'
      ? {
          rel: 'En validation',
          date: `v${String(t.version).padStart(2, '0')}${t.remisLe ? ` · déposée le ${formatDayMonth(t.remisLe)}` : ''}`,
        }
      : t.statut === 'bloquee'
        ? {
            rel: 'Attend l’étape précédente',
            date: t.echeance ? `à rendre le ${formatDayMonth(t.echeance)}` : 'pas encore de dates',
          }
        : t.statut === 'prolongee' && t.prolongeeJusquau
          ? {
              rel: `Prolongée · ${relatif(t.prolongeeJusquau, aujourdhui).toLowerCase()}`,
              date: `jusqu’au ${formatDayMonth(t.prolongeeJusquau)}${t.echeance ? ` · prévue le ${formatDayMonth(t.echeance)}` : ''}`,
            }
          : t.echeance
            ? {
                rel:
                  t.statut === 'a_reprendre'
                    ? `Reprise · ${relatif(t.echeance, aujourdhui).toLowerCase()}`
                    : relatif(t.echeance, aujourdhui),
                date:
                  t.statut === 'a_venir' && t.debut
                    ? `démarre le ${formatDayMonth(t.debut)} · à rendre le ${formatDayMonth(t.echeance)}`
                    : `à rendre le ${formatDayMonth(t.echeance)}`,
              }
            : { rel: 'À planifier', date: 'pas encore de dates' };

  const glisser = onFichiers
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setSurvol(true);
        },
        onDragLeave: () => setSurvol(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setSurvol(false);
          if (e.dataTransfer.files.length) onFichiers(e.dataTransfer.files);
        },
      }
    : {};

  return (
    <li
      className={`mt-ligne mt-ligne--ouvrable${survol ? ' is-depot' : fichierEnVol && onFichiers ? ' is-cible' : ''}`}
      data-ton={ton}
      data-tache={t.id}
      style={transition(t.id)}
      // Toute la ligne ouvre la tâche ; ses boutons et liens gardent leur
      // propre action. Au clavier : le titre (bouton) reste le point d'entrée.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, label, select, textarea')) return;
        onOuvrir(false);
      }}
      {...glisser}
    >
      <span className="mt-corps">
        <button type="button" className="mt-titre mt-titre-bouton" onClick={() => onOuvrir(false)}>
          {t.libelle}
        </button>
        <span className="mt-meta">
          {!sansProjet && (
            <>
              <Link className="mt-code" href={`${base}/projets?projet=${t.projetId}`}>
                {t.projetCode}
              </Link>
              <span>{t.projetClient}</span>
              <span className="mt-sep" aria-hidden>
                ·
              </span>
            </>
          )}
          <span>{t.etape}</span>
        </span>
        {t.renvoiMotif && (
          <span className="mt-motif">
            <RotateCcw size={13} aria-hidden /> {t.renvoiMotif}
          </span>
        )}
        {mentions && mentions.length > 0 && (
          <button
            type="button"
            className="mt-pastille-mention"
            title={`« ${mentions[0].texte} »`}
            onClick={() => onMentions(mentions)}
          >
            <AtSign size={13} aria-hidden />
            {mentions.length === 1
              ? `${mentions[0].auteur ?? 'Quelqu’un'} vous mentionne`
              : `${mentions.length} mentions non lues`}
          </button>
        )}
      </span>
      <span className="mt-echeance">
        <span className="mt-echeance-rel">{survol ? 'Lâchez pour déposer' : echeance.rel}</span>
        <span className="mt-echeance-date">{echeance.date}</span>
      </span>
      <span className="mt-action">
        {/* « Demander un délai » : la prolongation est accordée (ou non) par
            le N+1 — le bouton ne prolonge rien lui-même. */}
        {t.statut === 'en_retard' && (
          <>
            <button type="button" className="btn-ghost btn-ghost--sm mt-secondaire" onClick={() => onOuvrir(true)}>
              Demander un délai
            </button>
            <MenuPlus
              actions={[
                { libelle: 'Demander un délai', faire: () => onOuvrir(true) },
                { libelle: 'Ouvrir la tâche', faire: () => onOuvrir(false) },
              ]}
            />
          </>
        )}
        {onDeposerTache && (
          <button
            type="button"
            className={enRetard ? 'btn-primary btn-primary--sm' : 'btn-ghost btn-ghost--sm'}
            data-action="deposer"
            onClick={onDeposerTache}
          >
            Déposer
          </button>
        )}
      </span>
    </li>
  );
}

// « Tâche déposée · Annuler » : barre qui se vide pendant le délai
// d'annulation (au-dessus de la navigation du bas sur téléphone).
function ToastDepot({ libelle, onAnnuler }: { libelle: string; onAnnuler: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="mt-toast" role="status" style={{ '--mt-toast-duree': `${DELAI_ANNULATION_MS}ms` } as CSSProperties}>
      <CheckCircle2 size={17} aria-hidden />
      <span className="mt-toast-texte">« {libelle} » déposée</span>
      <button type="button" className="mt-toast-annuler" onClick={onAnnuler}>
        Annuler
      </button>
      <span className="mt-toast-barre" aria-hidden />
    </div>,
    document.body,
  );
}

// Téléphone : un seul bouton visible par carte (« Déposer ») ; les actions
// secondaires passent dans ce menu « ⋯ » (masqué sur ordinateur, où elles
// apparaissent au survol de la ligne).
function MenuPlus({ actions }: { actions: { libelle: string; faire: () => void }[] }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);
  return (
    <span className="mt-plus" ref={boite}>
      <button
        type="button"
        className="btn-ghost btn-ghost--sm mt-plus-bouton"
        aria-label="Autres actions"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {ouvert && (
        <span className="mt-plus-menu" role="menu">
          {actions.map((a) => (
            <button
              key={a.libelle}
              type="button"
              role="menuitem"
              onClick={() => {
                setOuvert(false);
                a.faire();
              }}
            >
              {a.libelle}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// Mention : lire, répondre dans le fil (l'auteur est mentionné en retour),
// marquer comme lue, ouvrir la tâche.
function LigneMention({
  slug,
  m,
  base,
  onOuvrir,
  onMaj,
}: {
  slug: string;
  m: MentionRecue;
  base: string;
  onOuvrir: () => void;
  onMaj: () => void;
}) {
  const [reponse, setReponse] = useState<string | null>(null);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });

  async function agir(action: () => Promise<unknown>) {
    setEtat({ envoi: true, erreur: null });
    try {
      await action();
      setReponse(null);
      setEtat({ envoi: false, erreur: null });
      onMaj();
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Action impossible.' });
    }
  }

  const repondre = () =>
    agir(async () => {
      await publierCommentaire(slug, m.projetId, {
        ...(m.tacheId ? { tacheId: m.tacheId } : { carteId: m.carteId }),
        parentId: m.racineId,
        texte: reponse!.trim(),
        mentionneId: m.auteurId,
      });
      await marquerMentionLue(slug, m.id);
    });

  return (
    <li
      className={`mt-ligne mt-mention${m.tacheId ? ' mt-ligne--ouvrable' : ''}${m.lue ? ' is-lue' : ''}`}
      data-ton={m.lue ? 'neutre' : 'iris'}
      // Comme une tâche : toute la ligne ouvre la tâche mentionnée.
      onClick={(e) => {
        if (!m.tacheId || (e.target as HTMLElement).closest('button, a, input, label, select, textarea')) return;
        onOuvrir();
      }}
    >
      <span className="mt-corps">
        <span className="mt-titre">
          {!m.lue && <span className="mt-nouveau" aria-label="Non lue" />}
          {m.auteur ?? 'Quelqu’un'} vous mentionne
        </span>
        <span className="mt-mention-texte">« {m.texte} »</span>
        <span className="mt-meta">
          <Link className="mt-code" href={`${base}/projets?projet=${m.projetId}`}>
            {m.projetCode}
          </Link>
          <span>{m.cible}</span>
        </span>
        {reponse !== null && (
          <span className="mt-reponse">
            <textarea
              className="field-input"
              rows={2}
              maxLength={2000}
              placeholder={`Répondre à ${m.auteur ?? 'l’auteur'}…`}
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              autoFocus
            />
            <span className="dmd-actions">
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                disabled={etat.envoi}
                onClick={() => setReponse(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary btn-primary--sm"
                disabled={etat.envoi || !reponse.trim()}
                onClick={repondre}
              >
                Envoyer
              </button>
            </span>
          </span>
        )}
        {etat.erreur && <span className="field-erreur">{etat.erreur}</span>}
      </span>
      <span className="mt-echeance">
        <span className="mt-echeance-rel">le {formatDayMonth(m.creeLe)}</span>
        <span className="mt-echeance-date">{m.lue ? 'lue' : 'non lue'}</span>
      </span>
      <span className="mt-action">
        {reponse === null && (
          <button type="button" className="btn-primary btn-primary--sm" onClick={() => setReponse('')}>
            Répondre
          </button>
        )}
        {!m.lue && reponse === null && (
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            disabled={etat.envoi}
            onClick={() => agir(() => marquerMentionLue(slug, m.id))}
          >
            Marquer lu
          </button>
        )}
        {m.tacheId && reponse === null && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onOuvrir}>
            Ouvrir
          </button>
        )}
      </span>
    </li>
  );
}
