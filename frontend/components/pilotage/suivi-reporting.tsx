'use client';

import { useState } from 'react';
import { CheckCheck, MessageCircleQuestion } from 'lucide-react';
import { lireReporting, poserQuestionReporting, repondreQuestionReporting } from '@/lib/pilotage';
import type { ReportingPilotage, VuePilotage } from '@/lib/types';
import { formatDate, formatDayMonth, formatTime, toIsoDay } from '@/lib/dates';

const dateHeure = (iso: string) => `${formatDate(toIsoDay(new Date(iso)))} à ${formatTime(iso)}`;
const message = (e: unknown, repli: string) => (e instanceof Error && e.message ? e.message : repli);

// Pastilles de suivi d'un reporting déposé (liste et fiche) : « Lu le » et
// « Question en cours » coexistent — une question n'efface pas la lecture.
export function PastillesSuivi({ r }: { r: ReportingPilotage }) {
  if (!r.suivi) return null;
  return (
    <>
      {r.suivi.lecture && (
        <span className="pill pill--succes">Lu le {formatDayMonth(toIsoDay(new Date(r.suivi.lecture.le)))}</span>
      )}
      {r.suivi.questionsOuvertes > 0 && <span className="pill pill--attention">Question en cours</span>}
    </>
  );
}

// Suivi d'un reporting déposé (revue CFO 20/10/2026, lot 5) : le destinataire
// accuse réception ou pose une question ; l'émetteur répond dans le même fil.
// Le serveur ne remet le fil qu'aux deux parties et revérifie chaque action.
export function SuiviReporting({
  slug,
  r,
  onVue,
}: {
  slug: string;
  r: ReportingPilotage;
  onVue: (v: VuePilotage) => void;
}) {
  const [question, setQuestion] = useState<string | null>(null); // null = formulaire fermé
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState<string | null>(null); // action en cours (anti double clic)
  const [erreur, setErreur] = useState<string | null>(null);
  const s = r.suivi;
  if (!s) return null;

  async function lancer(cle: string, action: () => Promise<VuePilotage>, apres?: () => void) {
    if (envoi) return;
    setEnvoi(cle);
    setErreur(null);
    try {
      onVue(await action());
      apres?.();
    } catch (e) {
      setErreur(message(e, 'L’envoi a échoué. Vérifiez la connexion et réessayez.'));
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <div className="sr">
      <div className="sr-tete">
        <p className="po-kicker">Suivi du destinataire</p>
        {s.lecture ? (
          <p className="sr-lu">
            <CheckCheck size={15} aria-hidden /> Lu le {dateHeure(s.lecture.le)}
            {s.lecture.par && ` par ${s.lecture.par}`}
          </p>
        ) : (
          <p className="sr-attente">Pas encore lu par le destinataire.</p>
        )}
        {(s.peutLire || s.peutQuestionner) && (
          <div className="sr-actions">
            {s.peutLire && !s.luParMoi && (
              <button
                type="button"
                className="btn-primary"
                disabled={!!envoi}
                onClick={() => lancer('lu', () => lireReporting(slug, r.type, r.mois))}
              >
                <CheckCheck size={15} aria-hidden /> {envoi === 'lu' ? 'Enregistrement…' : 'Marquer comme lu'}
              </button>
            )}
            {s.peutQuestionner && question === null && (
              <button type="button" className="btn-ghost" disabled={!!envoi} onClick={() => setQuestion('')}>
                <MessageCircleQuestion size={15} aria-hidden /> Poser une question
              </button>
            )}
          </div>
        )}
      </div>

      {s.peutQuestionner && question !== null && (
        <div className="sr-formulaire">
          <label className="field">
            <span className="field-label">Votre question à {r.emetteur}</span>
            <textarea
              className="field-input"
              rows={3}
              maxLength={2000}
              value={question}
              disabled={!!envoi}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus
            />
          </label>
          <div className="sr-boutons">
            <button type="button" className="btn-ghost" disabled={!!envoi} onClick={() => setQuestion(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!!envoi || question.trim().length < 3}
              onClick={() =>
                lancer(
                  'question',
                  () => poserQuestionReporting(slug, r.type, r.mois, question.trim()),
                  () => setQuestion(null),
                )
              }
            >
              {envoi === 'question' ? 'Envoi…' : 'Envoyer la question'}
            </button>
          </div>
        </div>
      )}

      {s.fil && s.fil.length > 0 && (
        <ol className="sr-fil">
          {s.fil.map((q) => (
            <li key={q.id} className="sr-question" data-etat={q.reponse ? 'repondue' : 'ouverte'}>
              <div className="sr-message">
                <p className="sr-auteur">
                  <strong>{q.par ?? 'Destinataire'}</strong> · {dateHeure(q.le)}
                  <span className={`pill ${q.reponse ? 'pill--succes' : 'pill--attention'}`}>
                    {q.reponse ? 'Répondue' : 'Ouverte'}
                  </span>
                </p>
                <p className="sr-texte">{q.texte}</p>
              </div>
              {q.reponse ? (
                <div className="sr-message sr-message--reponse">
                  <p className="sr-auteur">
                    <strong>{q.reponduPar ?? r.emetteur}</strong> · {q.reponduLe ? dateHeure(q.reponduLe) : ''}
                  </p>
                  <p className="sr-texte">{q.reponse}</p>
                </div>
              ) : (
                s.peutRepondre && (
                  <div className="sr-formulaire">
                    <label className="field">
                      <span className="field-label">Votre réponse</span>
                      <textarea
                        className="field-input"
                        rows={3}
                        maxLength={2000}
                        value={reponses[q.id] ?? ''}
                        disabled={!!envoi}
                        onChange={(e) => setReponses((x) => ({ ...x, [q.id]: e.target.value }))}
                      />
                    </label>
                    <div className="sr-boutons">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!!envoi || (reponses[q.id] ?? '').trim().length < 3}
                        onClick={() =>
                          lancer(q.id, () =>
                            repondreQuestionReporting(slug, r.type, r.mois, q.id, (reponses[q.id] ?? '').trim()),
                          )
                        }
                      >
                        {envoi === q.id ? 'Envoi…' : 'Répondre'}
                      </button>
                    </div>
                  </div>
                )
              )}
            </li>
          ))}
        </ol>
      )}
      {erreur && <p className="field-erreur">{erreur}</p>}
    </div>
  );
}
