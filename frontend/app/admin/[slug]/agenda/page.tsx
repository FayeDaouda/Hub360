'use client';

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  addMonths,
  daysBetween,
  formatMonthYear,
  formatRRule,
  formatTime,
  formatWeekdayDayMonth,
  parseRRule,
  shiftRecurrence,
  todayIso,
} from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  afficherAgendaExterne,
  annulerRendezVous,
  getConnexions,
  type ConnexionAgenda,
  getAgenda,
  getPersonnesAgenda,
  cibleDe,
  modifierRendezVous,
  type PorteeSerie,
  repondreInvitation,
  type ElementAgenda,
  type ReponseInvitation,
  type SemaineAgenda,
} from '@/lib/agenda';
import {
  actionClavier,
  decaler as decalerAncre,
  enGrille,
  periode,
  periodeLue,
  toucheIgnoree,
  VUES,
  VUES_TELEPHONE,
  type Vue,
} from '@/lib/agenda-periode';
import type { Rect } from '@/lib/agenda-placement';
import { LIBELLE_TYPE_ABSENCE, validerFinaleCeo } from '@/lib/demandes';
import { useTitrePage } from '@/lib/layout-contexte';
import { useMediaQuery } from '@/lib/media';
import { DecisionN1Modal } from '@/components/absences/decision-n1-modal';
import { AbonnementAgendaModal } from '@/components/agenda/abonnement-agenda-modal';
import { AgendasConnectes } from '@/components/agenda/agendas-connectes';
import { BarreAgenda, BoutonCreerFlottant } from '@/components/agenda/barre-agenda';
import { SqueletteAgenda } from '@/components/agenda/squelette-agenda';
import { TiroirAgenda } from '@/components/agenda/tiroir-agenda';
import { CALQUES_MAX, ColonneAgenda, COULEURS_CALQUES, MiniCalendrier } from '@/components/agenda/colonne-agenda';
import { CreationRapide, type Creneau } from '@/components/agenda/creation-rapide';
import { FicheElement, LIBELLES } from '@/components/agenda/fiche-element';
import { VueMois } from '@/components/agenda/vue-mois';
import { VueMoisJour } from '@/components/agenda/vue-mois-jour';
import { VuePlanning } from '@/components/agenda/vue-planning';
import { useChoixPortee } from '@/components/agenda/choix-portee';
import { useConfirmer } from '@/components/confirmation';
import { GrilleHoraire, TONS } from '@/components/agenda/grille-horaire';
import { RendezVousFormulaire, valeursVides, type ValeursRendezVous } from '@/components/agenda/rendez-vous-formulaire';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

type Props = { params: Promise<{ slug: string }> };
// Formulaire ouvert : création (pré-remplie d'un créneau) ou modification.
type Formulaire = {
  rendezVousId?: string;
  occurrence?: string;
  portee?: PorteeSerie;
  initial: ValeursRendezVous;
};
type ADecider = NonNullable<ElementAgenda['demande']> & { nom: string };

const TYPES = Object.fromEntries(
  (Object.keys(LIBELLES) as ElementAgenda['type'][]).map((t) => [t, { libelle: LIBELLES[t], tone: TONS[t] }]),
) as Record<ElementAgenda['type'], { libelle: string; tone: (typeof TONS)[ElementAgenda['type']] }>;
// Vue Année : la pastille d'un jour prend la couleur de son élément le plus pressant.
const PRIORITE: ElementAgenda['type'][] = ['demande', 'echeance', 'rendez_vous', 'externe', 'conge'];
// Téléphone (18/11/2026) : barre compacte, tiroir, 3 jours par défaut.
const ECRAN_ETROIT = '(max-width: 640px)';
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// Balayage horizontal du doigt : au moins 60 px, franchement horizontal.
const BALAYAGE_PX = 60;

// Agenda (lot 11, 01/11/2026) : rendez-vous et réunions, plus les échéances
// des tâches et les congés validés, ajoutés d'office ; vues Semaine, Mois et
// Année, et les demandes d'absence à trancher, décidées d'ici (01/11/2026).
// Façon Google Agenda (12/11/2026) : Jour et Semaine en grille horaire, un
// créneau cliqué propose un rendez-vous, un élément cliqué ouvre sa fiche
// (modifier, annuler, décider) ; Planning en liste, par défaut sur téléphone.
// « Ajouter à mon agenda » (12/11/2026) : le même agenda dans Google, Apple
// ou Outlook, par un lien personnel.
// Créer, inviter et superposer l'agenda d'un collègue (colonne de gauche,
// 12/11/2026) suivent la matrice (le serveur le dit et revérifie).
export default function AgendaPage(props: Props) {
  const { slug } = use(props.params);
  useTitrePage('Agenda');
  const aujourdhui = todayIso();
  const [vue, setVue] = useState<Vue>('semaine');
  const [ancre, setAncre] = useState(aujourdhui);
  // Colonne de gauche (12/11/2026) : types masqués, agendas de collègues
  // superposés (gardés dans ce navigateur), ouverte d'un bouton sur téléphone.
  const [masques, setMasques] = useState<ElementAgenda['type'][]>([]);
  const [collegues, setCollegues] = useState<string[]>([]);
  // Calques lus, avec la période qu'ils couvrent (jamais affichés hors d'elle).
  const [calques, setCalques] = useState<{ periode: string; parId: Record<string, ElementAgenda[]> }>({
    periode: '',
    parId: {},
  });
  const [colonneOuverte, setColonneOuverte] = useState(false);
  // Ordinateur (plus de 1100 px) : la colonne en place, repliable (choix
  // gardé) ; en dessous, dans un tiroir.
  const large = useMediaQuery('(min-width: 1101px)');
  const [colonneMasquee, setColonneMasquee] = useState(false);
  const [miniOuvert, setMiniOuvert] = useState(false);
  const etroit = useMediaQuery(ECRAN_ETROIT);
  const [agenda, setAgenda] = useState<SemaineAgenda | null>(null);
  const [personnes, setPersonnes] = useState<{ id: string; nom: string }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null);
  const [fiche, setFiche] = useState<ElementAgenda | null>(null);
  // Où poser la fiche (le bloc ou la ligne cliqués) ; sans ancre : centrée.
  const [ficheAncre, setFicheAncre] = useState<Rect | null>(null);
  // Création rapide (18/11/2026) : un créneau cliqué ou tracé dans la grille.
  const [rapide, setRapide] = useState<{ creneau: Creneau; ancre: Rect | null } | null>(null);
  const [abonnement, setAbonnement] = useState(false);
  // Ses comptes reliés (Google…), pour la colonne de gauche (18/11/2026).
  const [comptes, setComptes] = useState<ConnexionAgenda[]>([]);
  const lireComptes = useCallback(() => {
    getConnexions(slug)
      .then((e) => setComptes(e.connexions))
      .catch(() => setComptes([]));
  }, [slug]);
  useEffect(lireComptes, [lireComptes]);
  async function afficherExterne(connexionId: string, agendaId: string, importe: boolean) {
    setErreur(null);
    try {
      setComptes((await afficherAgendaExterne(slug, connexionId, agendaId, importe)).connexions);
      setErreur(null);
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’agenda n’a pas pu être affiché.');
    }
  }
  // Agendas connectés (Google) : ouverte d'un bouton, ou au retour de Google
  // avec son résultat (« ?connexion=…[#ticket=…] », retiré de l'adresse
  // aussitôt ; le ticket est confirmé par la session, à usage unique).
  const [connectes, setConnectes] = useState<{ resultat: string | null; ticket?: string } | null>(null);
  useEffect(() => {
    const resultat = new URLSearchParams(window.location.search).get('connexion');
    if (!resultat) return;
    // Le ticket arrive dans le fragment (#ticket=…) : il ne quitte jamais le navigateur.
    const ticket = new URLSearchParams(window.location.hash.slice(1)).get('ticket') ?? undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnectes({ resultat, ticket });
    const url = new URL(window.location.href);
    url.searchParams.delete('connexion');
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  }, []);
  const [aDecider, setADecider] = useState<ADecider | null>(null);
  const confirmer = useConfirmer();
  // Sur une série : cet événement, les suivants ou tous (16/11/2026).
  const portee = useChoixPortee();
  const { du, au } = periode(vue, ancre);

  // Seule la dernière demande compte : une réponse lente (la semaine, avant
  // le planning d'un téléphone) n'écrase jamais une période plus récente.
  // U5 (23/11/2026) : la lecture en cours (barre de progression, période
  // d'avant estompée) et son échec, à part des erreurs d'action (« Réessayer »).
  const [chargement, setChargement] = useState(true);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const derniere = useRef(0);
  const charger = useCallback(() => {
    const n = ++derniere.current;
    setChargement(true);
    // Une nouvelle tentative remplace le message (le squelette revient).
    setErreurLecture(null);
    getAgenda(slug, du, au)
      .then((s) => {
        if (n !== derniere.current) return;
        setAgenda(s);
        setErreurLecture(null);
      })
      .catch((e) => {
        if (n === derniere.current) setErreurLecture(e instanceof ApiError ? e.message : 'Agenda indisponible.');
      })
      .finally(() => {
        if (n === derniere.current) setChargement(false);
      });
  }, [slug, du, au]);

  useEffect(charger, [charger]);
  // Téléphone : « Mois et jour » (le mois, la journée sur la grille des heures dessous) ;
  // revenu sur un grand écran, la semaine (les vues du téléphone n'y sont pas
  // proposées). Un choix fait par la personne est respecté (une rotation de
  // l'écran ne le défait pas). Lu après le premier rendu : le rendu serveur
  // ne connaît pas la largeur de l'écran.
  const vueChoisie = useRef(false);
  const choisirVue = (v: Vue) => {
    vueChoisie.current = true;
    setVue(v);
  };
  useEffect(() => {
    if (etroit) setVue((v) => (vueChoisie.current ? v : v === 'semaine' ? 'moisjour' : v));
    else setVue((v) => (VUES_TELEPHONE.includes(v) ? 'semaine' : v));
  }, [etroit]);
  // Préférences de la colonne : propres à ce navigateur et à ce compte
  // (commodité ; un navigateur partagé ne mêle pas deux personnes).
  const moiId = agenda?.personne.id;
  const clePreferences = moiId ? `hub.agenda.${slug}.${moiId}` : null;
  // Avant l'affichage : une colonne repliée ne s'affiche pas une image d'abord.
  useLayoutEffect(() => {
    if (!clePreferences) return;
    try {
      const p = JSON.parse(localStorage.getItem(clePreferences) ?? '{}') as {
        masques?: ElementAgenda['type'][];
        collegues?: string[];
        colonneMasquee?: boolean;
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(p.masques)) setMasques(p.masques);
      if (Array.isArray(p.collegues)) setCollegues(p.collegues);
      if (typeof p.colonneMasquee === 'boolean') setColonneMasquee(p.colonneMasquee);
    } catch {
      // Stockage indisponible : réglages par défaut.
    }
    // « Voir son agenda » depuis l'annuaire (22/11/2026) : ?collegue=… le
    // superpose pour cette visite (seul un collègue actuel s'affiche, comme
    // toujours), puis le paramètre quitte l'adresse.
    const url = new URL(window.location.href);
    const demande = url.searchParams.get('collegue');
    if (demande) {
      setCollegues((c) => [demande, ...c.filter((x) => x !== demande)]);
      url.searchParams.delete('collegue');
      window.history.replaceState(null, '', url.toString());
    }
  }, [clePreferences]);
  function preferences(m: ElementAgenda['type'][], c: string[], masquee = colonneMasquee) {
    setMasques(m);
    setCollegues(c);
    setColonneMasquee(masquee);
    if (!clePreferences) return;
    try {
      localStorage.setItem(clePreferences, JSON.stringify({ masques: m, collegues: c, colonneMasquee: masquee }));
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite.
    }
  }

  // Agendas de collègues superposés : seulement des collègues actuels de la
  // société (un ancien, resté dans les préférences, est ignoré), relus avec
  // la période ; seule la dernière lecture compte.
  const peutVoirAutres = !!agenda?.peutVoirAutres;
  const collegaux = peutVoirAutres && moiId ? personnes.filter((p) => p.id !== moiId) : [];
  // Coupés à CALQUES_MAX après le tri : un id inconnu (lien périmé, collègue
  // parti) ne prend la place de personne.
  const colleguesValides = collegues.filter((id) => collegaux.some((p) => p.id === id)).slice(0, CALQUES_MAX);
  const cleCollegues = colleguesValides.join(',');
  const periodeCle = `${du}|${au}`;
  const derniereCalques = useRef(0);
  useEffect(() => {
    const n = ++derniereCalques.current;
    // Rien à lire : seuls les collègues cochés s'affichent.
    if (!cleCollegues) return;
    Promise.all(
      cleCollegues.split(',').map((id) =>
        getAgenda(slug, du, au, id)
          .then((a) => [id, a.elements] as const)
          .catch(() => [id, [] as ElementAgenda[]] as const),
      ),
    ).then((lus) => {
      if (n === derniereCalques.current) setCalques({ periode: `${du}|${au}`, parId: Object.fromEntries(lus) });
    });
  }, [slug, du, au, cleCollegues]);

  useEffect(() => {
    getPersonnesAgenda(slug)
      .then(setPersonnes)
      .catch(() => setPersonnes([]));
  }, [slug]);

  async function annuler(e: ElementAgenda) {
    setFiche(null);
    setErreur(null);
    // Une occurrence d'une série : laquelle annuler ?
    const choix = e.serieId ? await portee.demander('Annuler un événement récurrent', 'Confirmer') : undefined;
    if (choix === null) return;
    try {
      await annulerRendezVous(slug, cibleDe(e), choix, e.occurrence ?? undefined);
      charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Annulation impossible.');
    }
  }

  const decaler = (sens: 1 | -1) => setAncre((a) => decalerAncre(vue, a, sens));
  // Changement de période : la nouvelle arrive en glissant du côté où l'on va
  // (état tiré du rendu précédent, motif React).
  // Une autre vue (même jour ou non) : sans glissement.
  const [vu, setVu] = useState({ vue, du });
  const [sensVue, setSensVue] = useState<'suivant' | 'precedent' | 'fixe'>('fixe');
  if (vue !== vu.vue || du !== vu.du) {
    setVu({ vue, du });
    // Le message d'une action échouée ne suit pas dans une autre période.
    setErreur(null);
    setSensVue(vue !== vu.vue ? 'fixe' : du > vu.du ? 'suivant' : 'precedent');
  }
  // Grand écran : plus de tiroir (la colonne est en place).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (large) setColonneOuverte(false);
  }, [large]);
  // Le mini-calendrier déroulant (téléphone) se ferme à Échap ou d'un geste à côté.
  useEffect(() => {
    if (!miniOuvert) return;
    const touche = (ev: KeyboardEvent) => ev.key === 'Escape' && setMiniOuvert(false);
    const dehors = (ev: PointerEvent) => {
      const cible = ev.target as Element;
      if (!cible.closest?.('#agenda-mini-deroulant, .agenda-titre-bouton')) setMiniOuvert(false);
    };
    window.addEventListener('keydown', touche);
    document.addEventListener('pointerdown', dehors);
    return () => {
      window.removeEventListener('keydown', touche);
      document.removeEventListener('pointerdown', dehors);
    };
  }, [miniOuvert]);
  // Téléphone : glisser vers la gauche avance, vers la droite recule.
  // « Mois et jour » : sur la journée, un balayage change de jour (comme la
  // vue Jour) ; sur le mois, de mois.
  const toucher = useRef<{ x: number; y: number; surJournee: boolean } | null>(null);
  const balayage = {
    onTouchStart: (ev: TouchEvent) => {
      toucher.current =
        ev.touches.length === 1
          ? {
              x: ev.touches[0].clientX,
              y: ev.touches[0].clientY,
              surJournee: !!(ev.target as Element).closest?.('.agenda-moisjour-liste'),
            }
          : null;
    },
    onTouchCancel: () => {
      toucher.current = null;
    },
    onTouchEnd: (ev: TouchEvent) => {
      const t = toucher.current;
      toucher.current = null;
      // Un deuxième doigt (zoom) ou un geste annulé : pas un balayage.
      if (!t || !etroit || ev.touches.length > 0) return;
      const dx = ev.changedTouches[0].clientX - t.x;
      const dy = ev.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) < BALAYAGE_PX || Math.abs(dx) <= 1.5 * Math.abs(dy)) return;
      if (vue === 'moisjour' && t.surJournee) setAncre((a) => addDays(a, dx < 0 ? 1 : -1));
      else decaler(dx < 0 ? 1 : -1);
    },
  };
  // Création : depuis le bouton (aujourd'hui s'il est affiché) ou un créneau.
  const peutCreer = !!agenda?.peutCreer;
  // Ce qui s'affiche : son agenda, puis ceux des collègues cochés (dans leur
  // couleur), sans les types masqués ; une réunion commune n'apparaît qu'une
  // fois (la sienne d'abord).
  const nomDe = new Map(personnes.map((p) => [p.id, p.nom]));
  const elements: ElementAgenda[] = [];
  const vus = new Set<string>();
  const ajouter = (e: ElementAgenda) => {
    if (masques.includes(e.type) || vus.has(e.id)) return;
    vus.add(e.id);
    elements.push(e);
  };
  agenda?.elements.forEach(ajouter);
  if (calques.periode === periodeCle)
    colleguesValides.forEach((id, rang) =>
      (calques.parId[id] ?? []).forEach((e) =>
        ajouter({ ...e, calque: { id, nom: nomDe.get(id) ?? '—', couleur: COULEURS_CALQUES[rang] } }),
      ),
    );
  // Un créneau de la grille, sur ordinateur : la création rapide à côté ;
  // sinon (bouton Créer, téléphone) le formulaire complet.
  const creer = (jour: string, debut?: string, fin?: string, ancre?: Rect) => {
    if (!etroit && debut && fin && ancre) setRapide({ creneau: { jour, debut, fin }, ancre });
    else setFormulaire({ initial: valeursVides(jour, debut, fin) });
  };
  const ouvrirFiche = (e: ElementAgenda, ancre?: Rect) => {
    setFicheAncre(ancre ?? null);
    setFiche(e);
  };
  // « Créer » : aujourd'hui s'il est affiché, sinon le premier jour affiché.
  const creerMaintenant = () => creer(du <= aujourdhui && aujourdhui <= au ? aujourdhui : du);
  // Raccourcis clavier (U5, 23/11/2026) : la lettre d'une vue proposée sur
  // cet écran, T, ← →, C ; rien pendant une saisie ou une fenêtre ouverte.
  // Les gestes du rendu courant, lus par un écouteur posé une fois.
  const gestesClavier = useRef({ choisirVue, decaler, creerMaintenant, peutCreer, etroit, aujourdhui });
  useEffect(() => {
    gestesClavier.current = { choisirVue, decaler, creerMaintenant, peutCreer, etroit, aujourdhui };
  });
  useEffect(() => {
    const touche = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.repeat || toucheIgnoree(ev.target, ev.key)) return;
      const g = gestesClavier.current;
      const proposees = VUES.map((v) => v.cle).filter((v) => g.etroit || !VUES_TELEPHONE.includes(v));
      const action = actionClavier(ev, proposees);
      if (!action || (action.type === 'creer' && !g.peutCreer)) return;
      ev.preventDefault();
      if (action.type === 'vue') g.choisirVue(action.vue);
      else if (action.type === 'aujourdhui') setAncre(g.aujourdhui);
      else if (action.type === 'decaler') g.decaler(action.sens);
      else g.creerMaintenant();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);
  // Une occurrence d'une série : la portée d'abord (comme Google Agenda),
  // puis le formulaire rempli avec ce qu'elle vise — cette date, ou toute la
  // série (ses propres valeurs, jamais celles de l'occurrence).
  async function modifier(e: ElementAgenda) {
    setFiche(null);
    setErreur(null);
    const choix = e.serieId ? await portee.demander('Modifier un événement récurrent', 'Continuer') : undefined;
    if (choix === null) return;
    const source = choix === 'toutes' && e.serie ? e.serie : { ...e, debut: e.debut!, fin: e.fin! };
    setFormulaire({
      rendezVousId: cibleDe(e),
      occurrence: e.occurrence ?? undefined,
      portee: choix,
      initial: {
        titre: source.titre,
        jour: source.debut.slice(0, 10),
        debut: formatTime(source.debut),
        fin: formatTime(source.fin),
        lieu: source.lieu ?? '',
        description: source.description ?? '',
        inviteIds: e.inviteIds,
        lienVisio: source.lienVisio ?? '',
        rappelMinutes: e.rappelMinutes,
        regle: e.regle,
      },
    });
  }
  // Glissé dans la grille : affiché tout de suite à sa nouvelle place, puis
  // enregistré (invités prévenus comme pour une modification) ; en cas
  // d'échec, l'agenda est relu tel qu'il est.
  async function deplacerRendezVous(e: ElementAgenda, debut: string, fin: string) {
    setErreur(null);
    // Une occurrence d'une série : cet événement, les suivants ou tous (la
    // question tient lieu de confirmation) ; sinon, confirmer si invités.
    const choix = e.serieId ? await portee.demander('Déplacer un événement récurrent', 'Déplacer') : undefined;
    if (choix === null) return;
    if (
      !choix &&
      e.invites.length &&
      !(await confirmer({
        titre: 'Déplacer la réunion ?',
        message: `Les invités reçoivent la nouvelle heure (${formatTime(debut)} – ${formatTime(fin)}), dans le HUB et par e-mail.`,
        confirmer: 'Déplacer',
        annuler: 'Laisser',
      }))
    )
      return;
    setAgenda(
      (a) =>
        a && {
          ...a,
          elements: a.elements.map((x) => (x.id === e.id ? { ...x, jour: debut.slice(0, 10), debut, fin } : x)),
        },
    );
    // Toute la série : elle se décale du même écart que cette occurrence,
    // avec ses propres valeurs.
    // Ses jours de la semaine se décalent d'autant (« lundi et mercredi »
    // glissés d'un jour : « mardi et jeudi ») ; sa durée ne change que si
    // le bloc a été étiré.
    const ecart = Date.parse(debut) - Date.parse(e.debut!);
    const etire = Date.parse(fin) - Date.parse(debut) !== Date.parse(e.fin!) - Date.parse(e.debut!);
    let regle = e.regle;
    const serie = e.serie;
    if (choix === 'toutes' && !serie) {
      setErreur('Série introuvable : rouvrez l’agenda puis réessayez.');
      charger();
      return;
    }
    if (choix === 'toutes' && regle) {
      regle = formatRRule(shiftRecurrence(parseRRule(regle), daysBetween(e.debut!.slice(0, 10), debut.slice(0, 10))));
    }
    const source =
      choix === 'toutes' && serie
        ? {
            ...serie,
            debut: new Date(Date.parse(serie.debut) + ecart).toISOString(),
            fin: new Date(
              Date.parse(serie.debut) +
                ecart +
                (etire ? Date.parse(fin) - Date.parse(debut) : Date.parse(serie.fin) - Date.parse(serie.debut)),
            ).toISOString(),
          }
        : { titre: e.titre, debut, fin, lieu: e.lieu, description: e.description, lienVisio: e.lienVisio };
    try {
      await modifierRendezVous(slug, cibleDe(e), {
        titre: source.titre,
        debut: source.debut,
        fin: source.fin,
        lieu: source.lieu ?? undefined,
        description: source.description ?? undefined,
        inviteIds: e.inviteIds,
        lienVisio: source.lienVisio,
        rappelMinutes: e.rappelMinutes,
        ...(choix && e.occurrence && { portee: choix, occurrence: e.occurrence, regle }),
      });
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Le rendez-vous n’a pas été déplacé.');
    }
    charger();
  }
  // Répondre à une invitation depuis sa fiche (12/11/2026) : la fiche suit.
  async function repondre(e: ElementAgenda, reponse: ReponseInvitation) {
    setErreur(null);
    try {
      await repondreInvitation(slug, cibleDe(e), reponse);
      // Sa réponse et sa ligne dans la liste des participants.
      const moi = agenda?.personne.nom;
      setFiche((f) =>
        f && f.id === e.id
          ? {
              ...f,
              maReponse: reponse,
              participants: f.participants.map((p) => (p.nom === moi ? { ...p, reponse } : p)),
            }
          : f,
      );
      setErreur(null);
      charger();
    } catch (err) {
      setFiche(null);
      setErreur(err instanceof ApiError ? err.message : 'La réponse n’a pas été enregistrée.');
    }
  }
  function deciderDepuisFiche(e: ElementAgenda) {
    setFiche(null);
    if (e.demande) setADecider({ ...e.demande, nom: e.titre });
  }
  // Invitables : tous les collègues avec « Réunions » ; sinon, en
  // modification, les seuls invités déjà là (on peut les retirer).
  function invitables(f: Formulaire) {
    if (agenda?.peutInviter) return personnes;
    const deja = new Set(f.initial.inviteIds);
    return personnes.filter((p) => deja.has(p.id));
  }
  function ouvrir(v: Vue, jour: string) {
    choisirVue(v);
    setAncre(jour);
  }

  // Une ligne par demande (pas une par jour couvert).
  const demandes = agenda
    ? [
        ...new Map(
          agenda.elements.filter((e) => e.demande).map((e) => [e.demande!.id, { ...e.demande!, nom: e.titre, e }]),
        ).values(),
      ]
    : [];

  return (
    <div className="agenda">
      <BarreAgenda
        vue={vue}
        ancre={ancre}
        aujourdhui={aujourdhui}
        etroit={etroit}
        peutCreer={peutCreer}
        colonneOuverte={large ? !colonneMasquee : colonneOuverte}
        miniOuvert={miniOuvert}
        onVue={choisirVue}
        onAujourdhui={() => setAncre(aujourdhui)}
        onDecaler={decaler}
        onColonne={() => (large ? preferences(masques, collegues, !colonneMasquee) : setColonneOuverte((o) => !o))}
        onMini={() => setMiniOuvert((o) => !o)}
        onCreer={creerMaintenant}
        onAbonnement={() => setAbonnement(true)}
        onConnectes={() => setConnectes({ resultat: null })}
      />

      {/* Téléphone : le mini-calendrier sous le mois (comme Google Agenda). */}
      {etroit && miniOuvert && vue !== 'moisjour' && (
        <div id="agenda-mini-deroulant" className="agenda-mini-deroulant">
          <MiniCalendrier
            key={ancre.slice(0, 7)}
            ancre={ancre}
            du={du}
            au={au}
            aujourdhui={aujourdhui}
            onJour={(j) => {
              setAncre(j);
              setMiniOuvert(false);
            }}
          />
        </div>
      )}

      <div className={`agenda-disposition${large && colonneMasquee ? ' is-colonne-masquee' : ''}`}>
        {agenda && (
          <ColonneAgenda
            ancre={ancre}
            du={du}
            au={au}
            aujourdhui={aujourdhui}
            onJour={setAncre}
            masques={masques}
            onMasques={(m) => preferences(m, collegues)}
            personnes={collegaux}
            collegues={colleguesValides}
            onCollegues={(c) => preferences(masques, c)}
            connectes={comptes}
            onAfficherExterne={afficherExterne}
            onGererConnexions={() => setConnectes({ resultat: null })}
          />
        )}
        <div className="agenda-principal" {...balayage}>
          {erreur && <FieldError>{erreur}</FieldError>}
          {erreurLecture && (
            <div className="agenda-erreur" role="alert">
              <span>{erreurLecture}</span>
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={charger}>
                Réessayer
              </button>
            </div>
          )}
          {/* Lecteur d'écran : la vue et la période, à chaque changement. */}
          <p className="sr-only" aria-live="polite">
            {periodeLue(vue, ancre)}
          </p>
          {chargement && agenda && (
            <div className="agenda-progression" role="progressbar" aria-label="Chargement de l’agenda" />
          )}

          {/* Demandes d'absence de la période qui attendent sa décision. */}
          {demandes.length > 0 && (
            <section className="agenda-demandes" aria-label="Demandes d’absence à décider">
              <strong>
                {demandes.length} demande{demandes.length > 1 ? 's' : ''} d’absence à décider
              </strong>
              <ul>
                {demandes.map((d) => (
                  <li key={d.id}>
                    <span>
                      <strong>{d.nom}</strong>
                      <span className="agenda-detail">
                        {LIBELLE_TYPE_ABSENCE[d.type]} · {d.jours} j · {d.e.detail}
                        {d.validationFinale && ' · validation finale'}
                      </span>
                    </span>
                    <button type="button" className="btn-primary btn-primary--sm" onClick={() => setADecider(d)}>
                      Décider
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div
            key={`${vue}|${du}`}
            className={`agenda-vue agenda-vue--${sensVue}${chargement && agenda ? ' is-chargement' : ''}`}
            aria-busy={chargement}
          >
            {!agenda ? (
              erreurLecture ? null : (
                <SqueletteAgenda />
              )
            ) : enGrille(vue) ? (
              <GrilleHoraire
                key={`${vue}|${du}`}
                jours={Array.from({ length: daysBetween(du, au) + 1 }, (_, k) => addDays(du, k))}
                aujourdhui={aujourdhui}
                elements={elements}
                peutCreer={peutCreer}
                brouillon={rapide?.creneau ?? null}
                onCreneau={creer}
                onOuvrir={ouvrirFiche}
                onJour={vue === 'jour' ? undefined : (j) => ouvrir('jour', j)}
                onDeplacer={deplacerRendezVous}
              />
            ) : vue === 'moisjour' ? (
              <VueMoisJour
                du={du}
                mois={ancre.slice(0, 7)}
                jour={ancre}
                aujourdhui={aujourdhui}
                elements={elements}
                onJour={setAncre}
                journee={
                  // La journée choisie sur la grille des heures (23/11/2026).
                  <GrilleHoraire
                    key={ancre}
                    jours={[ancre]}
                    aujourdhui={aujourdhui}
                    elements={elements}
                    peutCreer={peutCreer}
                    brouillon={rapide?.creneau ?? null}
                    onCreneau={creer}
                    onOuvrir={ouvrirFiche}
                    onDeplacer={deplacerRendezVous}
                    sousLeMois
                  />
                }
              />
            ) : vue === 'planning' ? (
              <VuePlanning
                du={du}
                aujourdhui={aujourdhui}
                elements={elements}
                peutCreer={peutCreer}
                onOuvrir={ouvrirFiche}
                onCreer={creerMaintenant}
              />
            ) : vue === 'mois' ? (
              <VueMois
                du={du}
                mois={ancre.slice(0, 7)}
                aujourdhui={aujourdhui}
                elements={elements}
                etroit={etroit}
                peutCreer={peutCreer}
                onJour={(j) => ouvrir('jour', j)}
                onOuvrir={ouvrirFiche}
                onCreer={(j, position) => creer(j, '09:00', '10:00', position)}
              />
            ) : (
              <VueAnnee
                annee={ancre.slice(0, 4)}
                aujourdhui={aujourdhui}
                elements={elements}
                onMois={(m) => ouvrir('mois', `${m}-01`)}
                onJour={(j) => ouvrir('jour', j)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Sous 1100 px : la colonne dans un tiroir (vues, mini-calendrier,
          agendas, collègues). Dans un portail : jamais rognée par le verre. */}
      {colonneOuverte && !large && agenda && (
        <TiroirAgenda onClose={() => setColonneOuverte(false)}>
          <ColonneAgenda
            ancre={ancre}
            du={du}
            au={au}
            aujourdhui={aujourdhui}
            onJour={(j) => {
              setAncre(j);
              setColonneOuverte(false);
            }}
            masques={masques}
            onMasques={(m) => preferences(m, collegues)}
            personnes={collegaux}
            collegues={colleguesValides}
            onCollegues={(c) => preferences(masques, c)}
            connectes={comptes}
            onAfficherExterne={afficherExterne}
            onGererConnexions={() => {
              setColonneOuverte(false);
              setConnectes({ resultat: null });
            }}
            {...(etroit && {
              vue,
              onVue: (v: Vue) => {
                choisirVue(v);
                setColonneOuverte(false);
              },
            })}
          />
        </TiroirAgenda>
      )}

      {etroit &&
        peutCreer &&
        !formulaire &&
        createPortal(<BoutonCreerFlottant onCreer={creerMaintenant} />, document.body)}

      {formulaire && agenda && (
        <RendezVousFormulaire
          slug={slug}
          rendezVousId={formulaire.rendezVousId}
          occurrence={formulaire.occurrence}
          portee={formulaire.portee}
          initial={formulaire.initial}
          personnes={invitables(formulaire)}
          avecDisponibilites={!!agenda.peutInviter}
          onClose={() => setFormulaire(null)}
          onEnregistre={() => {
            setFormulaire(null);
            charger();
          }}
        />
      )}

      {fiche && (
        <FicheElement
          e={fiche}
          ancre={ficheAncre}
          etroit={etroit}
          onClose={() => setFiche(null)}
          onModifier={modifier}
          onAnnuler={annuler}
          onDecider={deciderDepuisFiche}
          onRepondre={repondre}
        />
      )}

      {rapide && (
        <CreationRapide
          slug={slug}
          creneau={rapide.creneau}
          ancre={rapide.ancre}
          onClose={() => setRapide(null)}
          onCree={() => {
            setRapide(null);
            charger();
          }}
          onPlusOptions={(titre) => {
            const { jour, debut, fin } = rapide.creneau;
            setRapide(null);
            setFormulaire({ initial: { ...valeursVides(jour, debut, fin), titre } });
          }}
        />
      )}

      {portee.fenetre}

      {connectes && (
        <AgendasConnectes
          slug={slug}
          resultat={connectes.resultat}
          ticket={connectes.ticket}
          onClose={() => setConnectes(null)}
          onChange={() => {
            charger();
            lireComptes();
          }}
        />
      )}

      {abonnement && <AbonnementAgendaModal slug={slug} onClose={() => setAbonnement(false)} />}

      {/* La décision du N+1 : le même formulaire que « À valider » (solde,
          cellule, tâches à confier) ; la validation finale du CEO à part. */}
      {aDecider &&
        (aDecider.validationFinale ? (
          <ValidationFinale
            slug={slug}
            demande={aDecider}
            onClose={() => setADecider(null)}
            onFait={() => {
              setADecider(null);
              charger();
            }}
          />
        ) : (
          <DecisionN1Modal
            slug={slug}
            id={aDecider.id}
            onClose={() => setADecider(null)}
            onFait={() => {
              setADecider(null);
              charger();
            }}
          />
        ))}
    </div>
  );
}

// Année : 12 petits mois ; une pastille sur les jours chargés. Le nom d'un
// mois ouvre le mois, un jour ouvre sa vue Jour.
function VueAnnee({
  annee,
  aujourdhui,
  elements,
  onMois,
  onJour,
}: {
  annee: string;
  aujourdhui: string;
  elements: ElementAgenda[];
  onMois: (mois: string) => void;
  onJour: (jour: string) => void;
}) {
  const parJour = new Map<string, ElementAgenda[]>();
  for (const e of elements) parJour.set(e.jour, [...(parJour.get(e.jour) ?? []), e]);
  return (
    <div className="agenda-annee">
      {Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`).map((m) => {
        const premier = `${m}-01`;
        const decalage = (new Date(`${premier}T12:00:00Z`).getUTCDay() + 6) % 7;
        const nbJours = Number(addDays(addMonths(premier, 1), -1).slice(8));
        const total = elements.filter((e) => e.jour.startsWith(m)).length;
        return (
          <section key={m} className="agenda-annee-mois">
            <button type="button" className="agenda-annee-titre" onClick={() => onMois(m)}>
              <span>{formatMonthYear(m).split(' ')[0]}</span>
              {total > 0 && <span className="agenda-detail">{total}</span>}
            </button>
            <div className="agenda-annee-grille">
              {JOURS_COURTS.map((j, i) => (
                <span key={i} className="agenda-annee-entete" aria-hidden>
                  {j}
                </span>
              ))}
              {Array.from({ length: decalage }, (_, i) => (
                <span key={`v${i}`} />
              ))}
              {Array.from({ length: nbJours }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`).map((j) => {
                const du_jour = parJour.get(j) ?? [];
                const type = PRIORITE.find((t) => du_jour.some((e) => e.type === t));
                return (
                  <button
                    key={j}
                    type="button"
                    className={`agenda-annee-jour${j === aujourdhui ? ' is-aujourdhui' : ''}`}
                    onClick={() => onJour(j)}
                    aria-label={`${formatWeekdayDayMonth(j)} · ${du_jour.length} élément${du_jour.length > 1 ? 's' : ''}`}
                  >
                    {Number(j.slice(8))}
                    {type && <span className={`agenda-point agenda-puce--${TYPES[type].tone}`} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Validation finale du CEO (demande de la RH, après l'accord du N+1).
function ValidationFinale({
  slug,
  demande,
  onClose,
  onFait,
}: {
  slug: string;
  demande: ADecider;
  onClose: () => void;
  onFait: () => void;
}) {
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function decider(valide: boolean) {
    setEnvoi(true);
    setErreur(null);
    try {
      await validerFinaleCeo(slug, demande.id, valide, valide ? undefined : motif.trim());
      onFait();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Décision non enregistrée.');
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="finale-titre">
      <header className="modal-header">
        <div>
          <span className="cell-sub">Demande d’absence · validation finale</span>
          <h2 id="finale-titre">{demande.nom}</h2>
        </div>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body agenda-formulaire">
        <p>
          <strong>{LIBELLE_TYPE_ABSENCE[demande.type]}</strong> · {demande.jours} j ouvrables · accord du N+1 donné
        </p>
        {refus && (
          <Field label="Motif du refus">
            <textarea className="field-input" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
          </Field>
        )}
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          {refus ? (
            <>
              <button type="button" className="btn-ghost" onClick={() => setRefus(false)} disabled={envoi}>
                Retour
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => decider(false)}
                disabled={envoi || motif.trim().length < 2}
              >
                Refuser
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={() => setRefus(true)} disabled={envoi}>
                Refuser…
              </button>
              <button type="button" className="btn-primary" onClick={() => decider(true)} disabled={envoi}>
                Valider
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
