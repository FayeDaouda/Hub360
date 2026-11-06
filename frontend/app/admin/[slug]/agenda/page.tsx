'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, MapPin, Plus } from 'lucide-react';
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
  creerRendezVous,
  getAgenda,
  getPersonnesAgenda,
  type ElementAgenda,
  type SemaineAgenda,
} from '@/lib/agenda';
import { LIBELLE_TYPE_ABSENCE, validerFinaleCeo } from '@/lib/demandes';
import { useTitrePage } from '@/lib/layout-contexte';
import { DecisionN1Modal } from '@/components/absences/decision-n1-modal';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

type Props = { params: Promise<{ slug: string }> };
type Vue = 'semaine' | 'mois' | 'annee';
type ADecider = NonNullable<ElementAgenda['demande']> & { nom: string };

// Lundi de la semaine d'un jour AAAA-MM-JJ.
const lundi = (jour: string) => {
  const d = new Date(`${jour}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(jour, d === 0 ? -6 : 1 - d);
};
const TYPES: Record<ElementAgenda['type'], { libelle: string; tone: 'info' | 'attention' | 'neutre' | 'risque' }> = {
  rendez_vous: { libelle: 'Rendez-vous', tone: 'info' },
  echeance: { libelle: 'Échéance', tone: 'attention' },
  conge: { libelle: 'Absence', tone: 'neutre' },
  demande: { libelle: 'À décider', tone: 'risque' },
};
// Vue Année : la pastille d'un jour prend la couleur de son élément le plus pressant.
const PRIORITE: ElementAgenda['type'][] = ['demande', 'echeance', 'rendez_vous', 'conge'];
const VUES: { cle: Vue; libelle: string }[] = [
  { cle: 'semaine', libelle: 'Semaine' },
  { cle: 'mois', libelle: 'Mois' },
  { cle: 'annee', libelle: 'Année' },
];
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Période affichée autour du jour `ancre` : la semaine ; le mois en grille de
// 6 semaines (jours voisins compris) ; l'année civile.
function periode(vue: Vue, ancre: string) {
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
// Créer, inviter et voir l'agenda d'un collègue suivent la matrice (le
// serveur le dit dans la réponse et revérifie).
export default function AgendaPage(props: Props) {
  const { slug } = use(props.params);
  useTitrePage('Agenda');
  const aujourdhui = todayIso();
  const [vue, setVue] = useState<Vue>('semaine');
  const [ancre, setAncre] = useState(aujourdhui);
  const [personne, setPersonne] = useState<string | undefined>(undefined);
  const [agenda, setAgenda] = useState<SemaineAgenda | null>(null);
  const [personnes, setPersonnes] = useState<{ id: string; nom: string }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [aDecider, setADecider] = useState<ADecider | null>(null);
  const { du, au } = periode(vue, ancre);

  const charger = useCallback(() => {
    getAgenda(slug, du, au, personne)
      .then((s) => {
        setAgenda(s);
        setErreur(null);
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Agenda indisponible.'));
  }, [slug, du, au, personne]);

  useEffect(charger, [charger]);
  useEffect(() => {
    getPersonnesAgenda(slug)
      .then(setPersonnes)
      .catch(() => setPersonnes([]));
  }, [slug]);

  async function annuler(e: ElementAgenda) {
    try {
      await annulerRendezVous(slug, e.id);
      charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Annulation impossible.');
    }
  }

  function decaler(sens: 1 | -1) {
    if (vue === 'semaine') setAncre(addDays(ancre, 7 * sens));
    else setAncre(addMonths(ancre, (vue === 'mois' ? 1 : 12) * sens));
  }
  function ouvrir(v: Vue, jour: string) {
    setVue(v);
    setAncre(jour);
  }

  const titre =
    vue === 'semaine'
      ? `${formatDayLongMonth(du)} → ${formatDayLongMonth(au)}`
      : vue === 'mois'
        ? formatMonthYear(ancre)
        : ancre.slice(0, 4);
  const pas = { semaine: 'Semaine', mois: 'Mois', annee: 'Année' }[vue];
  // Une ligne par demande (pas une par jour couvert).
  const demandes = agenda
    ? [
        ...new Map(
          agenda.elements.filter((e) => e.demande).map((e) => [e.demande!.id, { ...e.demande!, nom: e.titre, e }]),
        ).values(),
      ]
    : [];
  const actions = { onAnnuler: annuler, onDecider: setADecider };

  return (
    <div className="agenda">
      <div className="agenda-barre">
        <div className="agenda-nav">
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            aria-label={`${pas} précédente`}
            onClick={() => decaler(-1)}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <strong className="agenda-titre">{titre}</strong>
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            aria-label={`${pas} suivante`}
            onClick={() => decaler(1)}
          >
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
          {agenda?.peutVoirAutres && (
            <select
              className="field-input"
              aria-label="Agenda de"
              value={personne ?? ''}
              onChange={(e) => setPersonne(e.target.value || undefined)}
            >
              <option value="">Mon agenda</option>
              {personnes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          )}
          {agenda?.peutCreer && !personne && (
            <button type="button" className="btn-primary" onClick={() => setCreation(true)}>
              <Plus size={16} aria-hidden /> Nouveau rendez-vous
            </button>
          )}
        </div>
      </div>

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
      ) : vue === 'semaine' ? (
        <div className="agenda-semaine">
          {Array.from({ length: 7 }, (_, i) => addDays(du, i)).map((j) => {
            const du_jour = agenda.elements.filter((e) => e.jour === j);
            return (
              <section key={j} className={`agenda-jour${j === aujourdhui ? ' is-aujourdhui' : ''}`}>
                <h3>{formatWeekdayDayMonth(j)}</h3>
                {du_jour.length === 0 ? (
                  <p className="agenda-vide">—</p>
                ) : (
                  <ul>
                    {du_jour.map((e) => (
                      <Element key={e.id} e={e} {...actions} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : vue === 'mois' ? (
        <VueMois
          du={du}
          mois={ancre.slice(0, 7)}
          aujourdhui={aujourdhui}
          elements={agenda.elements}
          onJour={(j) => ouvrir('semaine', j)}
        />
      ) : (
        <VueAnnee
          annee={ancre.slice(0, 4)}
          aujourdhui={aujourdhui}
          elements={agenda.elements}
          onMois={(m) => ouvrir('mois', `${m}-01`)}
          onJour={(j) => ouvrir('semaine', j)}
        />
      )}

      {creation && agenda && (
        <NouveauRendezVous
          slug={slug}
          jour={du <= aujourdhui && aujourdhui <= au ? aujourdhui : du}
          personnes={agenda.peutInviter ? personnes : []}
          onClose={() => setCreation(false)}
          onCree={() => {
            setCreation(false);
            charger();
          }}
        />
      )}

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

function Element({
  e,
  onAnnuler,
  onDecider,
}: {
  e: ElementAgenda;
  onAnnuler: (e: ElementAgenda) => void;
  onDecider: (d: ADecider) => void;
}) {
  return (
    <li className={`agenda-element agenda-element--${e.type}`}>
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
      {e.annulable && (
        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onAnnuler(e)}>
          Annuler
        </button>
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

// Mois : 6 semaines du lundi au dimanche ; 3 éléments par jour au plus, puis
// « +n ». Un jour ouvre sa semaine.
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
              <span key={e.id} className={`agenda-puce agenda-puce--${TYPES[e.type].tone}`}>
                {e.debut ? `${formatTime(e.debut)} ` : ''}
                {e.titre}
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
// mois ouvre le mois, un jour ouvre sa semaine.
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

function NouveauRendezVous({
  slug,
  jour,
  personnes,
  onClose,
  onCree,
}: {
  slug: string;
  jour: string;
  personnes: { id: string; nom: string }[];
  onClose: () => void;
  onCree: () => void;
}) {
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(jour);
  const [debut, setDebut] = useState('09:00');
  const [fin, setFin] = useState('10:00');
  const [lieu, setLieu] = useState('');
  const [description, setDescription] = useState('');
  const [invites, setInvites] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      // Heure de Dakar = UTC (pas d'heure d'été).
      await creerRendezVous(slug, {
        titre,
        debut: `${date}T${debut}:00.000Z`,
        fin: `${date}T${fin}:00.000Z`,
        lieu: lieu || undefined,
        description: description || undefined,
        inviteIds: invites,
      });
      onCree();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Le rendez-vous n’a pas été créé.');
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="rdv-titre">
      <header className="modal-header">
        <h2 id="rdv-titre">
          <CalendarClock size={18} aria-hidden /> Nouveau rendez-vous
        </h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <form className="modal-body agenda-formulaire" onSubmit={enregistrer}>
        <Field label="Objet">
          <input
            className="field-input"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            required
            minLength={2}
          />
        </Field>
        <div className="agenda-formulaire-ligne">
          <Field label="Date">
            <input
              type="date"
              className="field-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Début">
            <input
              type="time"
              className="field-input"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              required
            />
          </Field>
          <Field label="Fin">
            <input type="time" className="field-input" value={fin} onChange={(e) => setFin(e.target.value)} required />
          </Field>
        </div>
        <Field label="Lieu (facultatif)">
          <input className="field-input" value={lieu} onChange={(e) => setLieu(e.target.value)} />
        </Field>
        <Field label="Note (facultatif)">
          <textarea
            className="field-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {personnes.length > 0 && (
          <fieldset className="agenda-invites">
            <legend className="field-label">Inviter (facultatif)</legend>
            {personnes.map((p) => (
              <label key={p.id} className="agenda-invite">
                <input
                  type="checkbox"
                  checked={invites.includes(p.id)}
                  onChange={() => setInvites((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                />
                {p.nom}
              </label>
            ))}
          </fieldset>
        )}
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
