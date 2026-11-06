'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, MapPin, Plus } from 'lucide-react';
import { addDays, formatDayLongMonth, formatTime, formatWeekdayDayMonth, todayIso } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  annulerRendezVous,
  creerRendezVous,
  getPersonnesAgenda,
  getSemaine,
  type ElementAgenda,
  type SemaineAgenda,
} from '@/lib/agenda';
import { useTitrePage } from '@/lib/layout-contexte';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

type Props = { params: Promise<{ slug: string }> };

// Lundi de la semaine d'un jour AAAA-MM-JJ.
const lundi = (jour: string) => {
  const d = new Date(`${jour}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(jour, d === 0 ? -6 : 1 - d);
};
const TYPES: Record<ElementAgenda['type'], { libelle: string; tone: 'info' | 'attention' | 'neutre' }> = {
  rendez_vous: { libelle: 'Rendez-vous', tone: 'info' },
  echeance: { libelle: 'Échéance', tone: 'attention' },
  conge: { libelle: 'Absence', tone: 'neutre' },
};

// Agenda (lot 11, 01/11/2026) : la semaine — rendez-vous et réunions, plus
// les échéances des tâches et les congés validés, ajoutés d'office. Créer,
// inviter et voir l'agenda d'un collègue suivent la matrice (le serveur le
// dit dans la réponse et revérifie).
export default function AgendaPage(props: Props) {
  const { slug } = use(props.params);
  useTitrePage('Agenda');
  const [du, setDu] = useState(() => lundi(todayIso()));
  const [personne, setPersonne] = useState<string | undefined>(undefined);
  const [semaine, setSemaine] = useState<SemaineAgenda | null>(null);
  const [personnes, setPersonnes] = useState<{ id: string; nom: string }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  const charger = useCallback(() => {
    getSemaine(slug, du, personne)
      .then((s) => {
        setSemaine(s);
        setErreur(null);
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Agenda indisponible.'));
  }, [slug, du, personne]);

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

  const jours = Array.from({ length: 7 }, (_, i) => addDays(du, i));
  const aujourdhui = todayIso();

  return (
    <div className="agenda">
      <div className="agenda-barre">
        <div className="agenda-nav">
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            aria-label="Semaine précédente"
            onClick={() => setDu(addDays(du, -7))}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <strong>
            {formatDayLongMonth(du)} → {formatDayLongMonth(addDays(du, 6))}
          </strong>
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            aria-label="Semaine suivante"
            onClick={() => setDu(addDays(du, 7))}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setDu(lundi(aujourdhui))}>
            Aujourd’hui
          </button>
        </div>
        <div className="agenda-actions">
          {semaine?.peutVoirAutres && (
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
          {semaine?.peutCreer && !personne && (
            <button type="button" className="btn-primary" onClick={() => setCreation(true)}>
              <Plus size={16} aria-hidden /> Nouveau rendez-vous
            </button>
          )}
        </div>
      </div>

      {erreur && <FieldError>{erreur}</FieldError>}
      {!semaine ? (
        <Skeleton size="sm" />
      ) : (
        <div className="agenda-semaine">
          {jours.map((j) => {
            const du_jour = semaine.elements.filter((e) => e.jour === j);
            return (
              <section key={j} className={`agenda-jour${j === aujourdhui ? ' is-aujourdhui' : ''}`}>
                <h3>{formatWeekdayDayMonth(j)}</h3>
                {du_jour.length === 0 ? (
                  <p className="agenda-vide">—</p>
                ) : (
                  <ul>
                    {du_jour.map((e) => (
                      <li key={e.id} className={`agenda-element agenda-element--${e.type}`}>
                        <span className="agenda-element-tete">
                          <Pill tone={TYPES[e.type].tone}>{TYPES[e.type].libelle}</Pill>
                          {e.debut && e.fin && (
                            <span className="agenda-heure">
                              {formatTime(e.debut)} – {formatTime(e.fin)}
                            </span>
                          )}
                        </span>
                        <strong>{e.titre}</strong>
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
                          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => annuler(e)}>
                            Annuler
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {creation && semaine && (
        <NouveauRendezVous
          slug={slug}
          jour={du <= aujourdhui && aujourdhui <= semaine.au ? aujourdhui : du}
          personnes={semaine.peutInviter ? personnes : []}
          onClose={() => setCreation(false)}
          onCree={() => {
            setCreation(false);
            charger();
          }}
        />
      )}
    </div>
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
