'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, PanelLeft, Plus } from 'lucide-react';
import {
  addDays,
  addMonths,
  formatDayLongMonth,
  formatMonthYear,
  formatTime,
  formatWeekdayDayMonth,
  todayIso,
} from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  annulerRendezVous,
  getAgenda,
  getPersonnesAgenda,
  modifierRendezVous,
  repondreInvitation,
  type ElementAgenda,
  type ReponseInvitation,
  type SemaineAgenda,
} from '@/lib/agenda';
import { LIBELLE_TYPE_ABSENCE, validerFinaleCeo } from '@/lib/demandes';
import { useTitrePage } from '@/lib/layout-contexte';
import { DecisionN1Modal } from '@/components/absences/decision-n1-modal';
import { AbonnementAgendaModal } from '@/components/agenda/abonnement-agenda-modal';
import { CALQUES_MAX, ColonneAgenda, COULEURS_CALQUES } from '@/components/agenda/colonne-agenda';
import { FicheElement, LIBELLES } from '@/components/agenda/fiche-element';
import { useConfirmer } from '@/components/confirmation';
import { GrilleHoraire, styleCalque, titreAffiche, TONS } from '@/components/agenda/grille-horaire';
import { RendezVousFormulaire, valeursVides, type ValeursRendezVous } from '@/components/agenda/rendez-vous-formulaire';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

type Props = { params: Promise<{ slug: string }> };
type Vue = 'jour' | 'semaine' | 'mois' | 'annee' | 'planning';
// Formulaire ouvert : création (pré-remplie d'un créneau) ou modification.
type Formulaire = { rendezVousId?: string; initial: ValeursRendezVous };
type ADecider = NonNullable<ElementAgenda['demande']> & { nom: string };

// Lundi de la semaine d'un jour AAAA-MM-JJ.
const lundi = (jour: string) => {
  const d = new Date(`${jour}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(jour, d === 0 ? -6 : 1 - d);
};
const TYPES = Object.fromEntries(
  (Object.keys(LIBELLES) as ElementAgenda['type'][]).map((t) => [t, { libelle: LIBELLES[t], tone: TONS[t] }]),
) as Record<ElementAgenda['type'], { libelle: string; tone: (typeof TONS)[ElementAgenda['type']] }>;
// Une réunion qu'on a déclinée : visible, mais effacée (sa propre réponse).
const decline = (e: ElementAgenda) => e.maReponse === 'non' && !e.calque;
// Vue Année : la pastille d'un jour prend la couleur de son élément le plus pressant.
const PRIORITE: ElementAgenda['type'][] = ['demande', 'echeance', 'rendez_vous', 'conge'];
const VUES: { cle: Vue; libelle: string }[] = [
  { cle: 'jour', libelle: 'Jour' },
  { cle: 'semaine', libelle: 'Semaine' },
  { cle: 'mois', libelle: 'Mois' },
  { cle: 'annee', libelle: 'Année' },
  { cle: 'planning', libelle: 'Planning' },
];
// Planning : la liste des 30 jours qui viennent, jours chargés seulement.
const JOURS_PLANNING = 30;
// Téléphone : la liste se lit mieux qu'une grille (vue par défaut).
const ECRAN_ETROIT = '(max-width: 640px)';
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Période affichée autour du jour `ancre` : le jour ; la semaine ; le mois en
// grille de 6 semaines (jours voisins compris) ; l'année civile ; le planning
// des 30 jours à partir de l'ancre.
function periode(vue: Vue, ancre: string) {
  if (vue === 'jour') return { du: ancre, au: ancre };
  if (vue === 'planning') return { du: ancre, au: addDays(ancre, JOURS_PLANNING - 1) };
  if (vue === 'semaine') {
    const du = lundi(ancre);
    return { du, au: addDays(du, 6) };
  }
  if (vue === 'mois') {
    const du = lundi(`${ancre.slice(0, 7)}-01`);
    return { du, au: addDays(du, 41) };
  }
  return { du: `${ancre.slice(0, 4)}-01-01`, au: `${ancre.slice(0, 4)}-12-31` };
}

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
  const [agenda, setAgenda] = useState<SemaineAgenda | null>(null);
  const [personnes, setPersonnes] = useState<{ id: string; nom: string }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null);
  const [fiche, setFiche] = useState<ElementAgenda | null>(null);
  const [abonnement, setAbonnement] = useState(false);
  const [aDecider, setADecider] = useState<ADecider | null>(null);
  const confirmer = useConfirmer();
  const { du, au } = periode(vue, ancre);

  // Seule la dernière demande compte : une réponse lente (la semaine, avant
  // le planning d'un téléphone) n'écrase jamais une période plus récente.
  const derniere = useRef(0);
  const charger = useCallback(() => {
    const n = ++derniere.current;
    getAgenda(slug, du, au)
      .then((s) => {
        if (n !== derniere.current) return;
        setAgenda(s);
        setErreur(null);
      })
      .catch((e) => {
        if (n === derniere.current) setErreur(e instanceof ApiError ? e.message : 'Agenda indisponible.');
      });
  }, [slug, du, au]);

  useEffect(charger, [charger]);
  // Téléphone : le planning d'abord (une fois, à l'arrivée). Lu après le
  // premier rendu : le rendu serveur ne connaît pas la largeur de l'écran.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia?.(ECRAN_ETROIT).matches) setVue('planning');
  }, []);
  // Préférences de la colonne : propres à ce navigateur et à ce compte
  // (commodité ; un navigateur partagé ne mêle pas deux personnes).
  const moiId = agenda?.personne.id;
  const clePreferences = moiId ? `hub.agenda.${slug}.${moiId}` : null;
  useEffect(() => {
    if (!clePreferences) return;
    try {
      const p = JSON.parse(localStorage.getItem(clePreferences) ?? '{}') as {
        masques?: ElementAgenda['type'][];
        collegues?: string[];
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(p.masques)) setMasques(p.masques);
      if (Array.isArray(p.collegues)) setCollegues(p.collegues.slice(0, CALQUES_MAX));
    } catch {
      // Stockage indisponible : réglages par défaut.
    }
  }, [clePreferences]);
  function preferences(m: ElementAgenda['type'][], c: string[]) {
    setMasques(m);
    setCollegues(c);
    if (!clePreferences) return;
    try {
      localStorage.setItem(clePreferences, JSON.stringify({ masques: m, collegues: c }));
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite.
    }
  }

  // Agendas de collègues superposés : seulement des collègues actuels de la
  // société (un ancien, resté dans les préférences, est ignoré), relus avec
  // la période ; seule la dernière lecture compte.
  const peutVoirAutres = !!agenda?.peutVoirAutres;
  const collegaux = peutVoirAutres && moiId ? personnes.filter((p) => p.id !== moiId) : [];
  const colleguesValides = collegues.filter((id) => collegaux.some((p) => p.id === id));
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
    try {
      await annulerRendezVous(slug, e.id);
      charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Annulation impossible.');
    }
  }

  function decaler(sens: 1 | -1) {
    if (vue === 'jour') setAncre(addDays(ancre, sens));
    else if (vue === 'semaine') setAncre(addDays(ancre, 7 * sens));
    else if (vue === 'planning') setAncre(addDays(ancre, JOURS_PLANNING * sens));
    else setAncre(addMonths(ancre, (vue === 'mois' ? 1 : 12) * sens));
  }
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
  const creer = (jour: string, debut?: string, fin?: string) =>
    setFormulaire({ initial: valeursVides(jour, debut, fin) });
  function modifier(e: ElementAgenda) {
    setFiche(null);
    setFormulaire({
      rendezVousId: e.id,
      initial: {
        titre: e.titre,
        jour: e.jour,
        debut: formatTime(e.debut!),
        fin: formatTime(e.fin!),
        lieu: e.lieu ?? '',
        description: e.description ?? '',
        inviteIds: e.inviteIds,
        lienVisio: e.lienVisio ?? '',
        rappelMinutes: e.rappelMinutes,
      },
    });
  }
  // Glissé dans la grille : affiché tout de suite à sa nouvelle place, puis
  // enregistré (invités prévenus comme pour une modification) ; en cas
  // d'échec, l'agenda est relu tel qu'il est.
  async function deplacerRendezVous(e: ElementAgenda, debut: string, fin: string) {
    if (
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
    try {
      await modifierRendezVous(slug, e.id, {
        titre: e.titre,
        debut,
        fin,
        lieu: e.lieu ?? undefined,
        description: e.description ?? undefined,
        inviteIds: e.inviteIds,
        lienVisio: e.lienVisio,
        rappelMinutes: e.rappelMinutes,
      });
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Le rendez-vous n’a pas été déplacé.');
    }
    charger();
  }
  // Répondre à une invitation depuis sa fiche (12/11/2026) : la fiche suit.
  async function repondre(e: ElementAgenda, reponse: ReponseInvitation) {
    try {
      await repondreInvitation(slug, e.id, reponse);
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
    setVue(v);
    setAncre(jour);
  }

  const titre =
    vue === 'jour'
      ? formatWeekdayDayMonth(ancre)
      : vue === 'semaine' || vue === 'planning'
        ? `${formatDayLongMonth(du)} → ${formatDayLongMonth(au)}`
        : vue === 'mois'
          ? formatMonthYear(ancre)
          : ancre.slice(0, 4);
  const [precedent, suivant] = {
    jour: ['Jour précédent', 'Jour suivant'],
    semaine: ['Semaine précédente', 'Semaine suivante'],
    mois: ['Mois précédent', 'Mois suivant'],
    annee: ['Année précédente', 'Année suivante'],
    planning: ['Période précédente', 'Période suivante'],
  }[vue];
  // Une ligne par demande (pas une par jour couvert).
  const demandes = agenda
    ? [
        ...new Map(
          agenda.elements.filter((e) => e.demande).map((e) => [e.demande!.id, { ...e.demande!, nom: e.titre, e }]),
        ).values(),
      ]
    : [];
  const actions = { onAnnuler: annuler, onDecider: setADecider, onModifier: modifier };

  return (
    <div className="agenda">
      <div className="agenda-barre">
        <div className="agenda-nav">
          <button type="button" className="btn-ghost btn-ghost--sm" aria-label={precedent} onClick={() => decaler(-1)}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <strong className="agenda-titre">{titre}</strong>
          <button type="button" className="btn-ghost btn-ghost--sm" aria-label={suivant} onClick={() => decaler(1)}>
            <ChevronRight size={16} aria-hidden />
          </button>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setAncre(aujourdhui)}>
            Aujourd’hui
          </button>
        </div>
        <div className="agenda-actions">
          <div className="vue-toggle" role="radiogroup" aria-label="Vue">
            {VUES.map((v) => (
              <button
                key={v.cle}
                type="button"
                role="radio"
                aria-checked={vue === v.cle}
                className={vue === v.cle ? 'is-active' : ''}
                onClick={() => setVue(v.cle)}
              >
                {v.libelle}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-ghost agenda-bouton-colonne"
            aria-expanded={colonneOuverte}
            aria-controls="agenda-colonne"
            onClick={() => setColonneOuverte((o) => !o)}
          >
            <PanelLeft size={16} aria-hidden /> Agendas
          </button>
          {/* Son propre agenda dans Google, Apple ou Outlook (12/11/2026). */}
          {agenda && (
            <button type="button" className="btn-ghost" onClick={() => setAbonnement(true)}>
              <CalendarPlus size={16} aria-hidden /> Ajouter à mon agenda
            </button>
          )}
          {peutCreer && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => creer(du <= aujourdhui && aujourdhui <= au ? aujourdhui : du)}
            >
              <Plus size={16} aria-hidden /> Nouveau rendez-vous
            </button>
          )}
        </div>
      </div>

      <div className={`agenda-disposition${colonneOuverte ? ' is-colonne-ouverte' : ''}`}>
        {agenda && (
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
          />
        )}
        <div className="agenda-principal">
          {erreur && <FieldError>{erreur}</FieldError>}

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

          {!agenda ? (
            <Skeleton size="sm" />
          ) : vue === 'jour' || vue === 'semaine' ? (
            <GrilleHoraire
              key={du}
              jours={Array.from({ length: vue === 'jour' ? 1 : 7 }, (_, k) => addDays(du, k))}
              aujourdhui={aujourdhui}
              elements={elements}
              peutCreer={peutCreer}
              onCreneau={creer}
              onOuvrir={setFiche}
              onJour={vue === 'semaine' ? (j) => ouvrir('jour', j) : undefined}
              onDeplacer={deplacerRendezVous}
            />
          ) : vue === 'planning' ? (
            <VuePlanning du={du} aujourdhui={aujourdhui} elements={elements} actions={actions} />
          ) : vue === 'mois' ? (
            <VueMois
              du={du}
              mois={ancre.slice(0, 7)}
              aujourdhui={aujourdhui}
              elements={elements}
              onJour={(j) => ouvrir('jour', j)}
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

      {formulaire && agenda && (
        <RendezVousFormulaire
          slug={slug}
          rendezVousId={formulaire.rendezVousId}
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
          onClose={() => setFiche(null)}
          onModifier={modifier}
          onAnnuler={annuler}
          onDecider={deciderDepuisFiche}
          onRepondre={repondre}
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

type Actions = {
  onAnnuler: (e: ElementAgenda) => void;
  onDecider: (d: ADecider) => void;
  onModifier: (e: ElementAgenda) => void;
};

function Element({ e, onAnnuler, onDecider, onModifier }: { e: ElementAgenda } & Actions) {
  // Comme depuis la fiche : on confirme avant d'annuler.
  const confirmer = useConfirmer();
  async function annulerApresConfirmation(x: ElementAgenda) {
    const ok = await confirmer({
      titre: 'Annuler ce rendez-vous ?',
      message: x.invites.length
        ? 'Les invités sont prévenus, dans le HUB et par e-mail : la réunion disparaît de leur agenda.'
        : 'Il disparaît de votre agenda.',
      confirmer: 'Annuler le rendez-vous',
      annuler: 'Garder',
      danger: true,
    });
    if (ok) onAnnuler(x);
  }
  return (
    <li className={`agenda-element agenda-element--${e.type}${decline(e) ? ' is-decline' : ''}`}>
      {e.calque && (
        <span className="agenda-detail">
          <span className="agenda-cote-pastille" style={styleCalque(e)} aria-hidden /> Agenda de {e.calque.nom}
        </span>
      )}
      <span className="agenda-element-tete">
        <Pill tone={TYPES[e.type].tone}>{TYPES[e.type].libelle}</Pill>
        {e.debut && e.fin && (
          <span className="agenda-heure">
            {formatTime(e.debut)} – {formatTime(e.fin)}
          </span>
        )}
      </span>
      <strong>{e.titre}</strong>
      {e.demande && (
        <span className="agenda-detail">
          {LIBELLE_TYPE_ABSENCE[e.demande.type]} · {e.demande.jours} j
        </span>
      )}
      {e.lieu && (
        <span className="agenda-detail">
          <MapPin size={13} aria-hidden /> {e.lieu}
        </span>
      )}
      {e.detail && <span className="agenda-detail">{e.detail}</span>}
      {e.invites.length > 0 && (
        <span className="agenda-detail">
          Avec {e.invites.join(', ')}
          {e.organisateur ? ` · organisé par ${e.organisateur}` : ''}
        </span>
      )}
      {(e.modifiable || e.annulable) && (
        <span className="agenda-element-actions">
          {e.modifiable && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onModifier(e)}>
              Modifier
            </button>
          )}
          {e.annulable && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => annulerApresConfirmation(e)}>
              Annuler
            </button>
          )}
        </span>
      )}
      {e.demande && (
        <button
          type="button"
          className="btn-primary btn-primary--sm"
          onClick={() => onDecider({ ...e.demande!, nom: e.titre })}
        >
          Décider
        </button>
      )}
    </li>
  );
}

// Planning (12/11/2026) : les 30 jours à partir de `du`, les jours chargés
// seulement, en liste — la vue du téléphone.
function VuePlanning({
  du,
  aujourdhui,
  elements,
  actions,
}: {
  du: string;
  aujourdhui: string;
  elements: ElementAgenda[];
  actions: Actions;
}) {
  const jours = [...new Set(elements.map((e) => e.jour))].filter((j) => j >= du).sort();
  if (!jours.length) return <p className="agenda-vide">Rien de prévu sur ces 30 jours.</p>;
  return (
    <div className="agenda-planning">
      {jours.map((j) => (
        <section key={j} className={`agenda-jour${j === aujourdhui ? ' is-aujourdhui' : ''}`}>
          <h3>{formatWeekdayDayMonth(j)}</h3>
          <ul>
            {elements
              .filter((e) => e.jour === j)
              .map((e) => (
                <Element key={e.id} e={e} {...actions} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Mois : 6 semaines du lundi au dimanche ; 3 éléments par jour au plus, puis
// « +n ». Un jour ouvre sa vue Jour.
function VueMois({
  du,
  mois,
  aujourdhui,
  elements,
  onJour,
}: {
  du: string;
  mois: string;
  aujourdhui: string;
  elements: ElementAgenda[];
  onJour: (jour: string) => void;
}) {
  return (
    <div className="agenda-mois">
      {JOURS_COURTS.map((j, i) => (
        <span key={i} className="agenda-mois-entete" aria-hidden>
          {j}
        </span>
      ))}
      {Array.from({ length: 42 }, (_, i) => addDays(du, i)).map((j) => {
        const du_jour = elements.filter((e) => e.jour === j);
        const classes = [
          'agenda-mois-jour',
          j.slice(0, 7) !== mois && 'is-hors-mois',
          j === aujourdhui && 'is-aujourdhui',
        ].filter(Boolean);
        return (
          <button
            key={j}
            type="button"
            className={classes.join(' ')}
            onClick={() => onJour(j)}
            aria-label={`${formatWeekdayDayMonth(j)} · ${du_jour.length} élément${du_jour.length > 1 ? 's' : ''}`}
          >
            <span className="agenda-mois-numero">{Number(j.slice(8))}</span>
            {du_jour.slice(0, 3).map((e) => (
              <span
                key={e.id}
                className={`agenda-puce agenda-puce--${TYPES[e.type].tone}${decline(e) ? ' is-decline' : ''}`}
                style={styleCalque(e)}
              >
                {e.debut ? `${formatTime(e.debut)} ` : ''}
                {titreAffiche(e)}
              </span>
            ))}
            {du_jour.length > 3 && <span className="agenda-plus">+{du_jour.length - 3}</span>}
          </button>
        );
      })}
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
