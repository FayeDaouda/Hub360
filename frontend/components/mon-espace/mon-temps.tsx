'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CalendarX, Clock, Gauge } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { formatHeures, getMonTemps, HEURES_PAR_JOUR, libelleMois, signalerEcartTemps, STATUT_FEUILLE } from '@/lib/temps';
import type { MonTemps as DonneesMonTemps } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { LignesCalcul } from '@/components/rh/lignes-calcul';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Impossible de charger votre temps.');

// « Mon espace » · Mon temps (RH lot 4, maquette du boss) : la feuille du
// mois, calculée automatiquement à partir des tâches assignées (durée
// standard répartie sur les jours ouvrés de la fenêtre), hors absences
// validées. Lecture seule ; la RH contrôle chaque mois. Pas de confirmation
// (revue Salarié 19/10/2026) : sans écart signalé, la feuille est juste.
export function MonTemps({ slug }: { slug: string }) {
  const [donnees, setDonnees] = useState<DonneesMonTemps | null>(null);
  const [mois, setMois] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    getMonTemps(slug, mois)
      .then(setDonnees)
      .catch((e) => setErreur(msg(e)));
  }, [slug, mois]);
  useEffect(charger, [charger]);

  if (!donnees) {
    return erreur ? (
      <p className="empty-state">{erreur}</p>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }
  const { feuille } = donnees;
  const controle =
    feuille.statut === 'controlee' && feuille.controleLe
      ? `contrôlée le ${jjmmaaaa(feuille.controleLe)}`
      : STATUT_FEUILLE[feuille.statut].libelle.toLowerCase();

  return (
    <>
      <div className="admin-periode temps-mois">
        <div className="admin-periode-toggle" role="group" aria-label="Mois">
          {donnees.periodes.map((m) => (
            <button key={m} type="button" className={m === donnees.mois ? 'is-active' : ''} aria-pressed={m === donnees.mois} onClick={() => setMois(m)}>
              {libelleMois(m)}
            </button>
          ))}
        </div>
        <span className="me-pastille">Contrôle RH : {controle}</span>
      </div>
      {erreur && <p className="field-erreur">{erreur}</p>}

      <KpiStrip
        tuiles={[
          {
            cle: 'imputees',
            label: 'Heures imputées',
            valeur: formatHeures(feuille.heuresImputees),
            sousTexte: `${feuille.lignes.length} assignation(s)`,
            icone: Clock,
          },
          {
            cle: 'disponibles',
            label: 'Heures disponibles',
            valeur: formatHeures(feuille.heuresDisponibles),
            sousTexte: `jours ouvrés écoulés × ${HEURES_PAR_JOUR} h`,
            icone: CalendarClock,
          },
          {
            cle: 'absences',
            label: 'Absences',
            valeur: `${feuille.joursAbsence} j`,
            sousTexte: 'congés et absences validés',
            icone: CalendarX,
          },
          {
            cle: 'occupation',
            label: 'Taux d’occupation',
            valeur: `${feuille.occupation ?? 0} %`,
            sousTexte: 'imputé / disponible',
            icone: Gauge,
          },
        ]}
      />

      <section className="panel glass-panel dmd-section temps-panel">
        <h2 className="dmd-titre">Détail du calcul · {libelleMois(feuille.mois)}</h2>
        <LignesCalcul lignes={feuille.lignes} variante="salarie" />
        <p className="dmd-note">
          Calcul automatique : durée standard de chaque tâche assignée, répartie sur les jours ouvrés de sa fenêtre, hors
          absences validées. Vous ne saisissez rien ; la RH contrôle la feuille chaque mois.
        </p>
      </section>

      {donnees.signalable && <EcartTemps slug={slug} donnees={donnees} onMaj={setDonnees} />}
    </>
  );
}

// Écart : signalé tant que la RH n'a pas contrôlé le mois ; un seul ouvert.
function EcartTemps({ slug, donnees, onMaj }: { slug: string; donnees: DonneesMonTemps; onMaj: (d: DonneesMonTemps) => void }) {
  const [saisie, setSaisie] = useState<string | null>(null);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  const { ecart, feuille } = donnees;
  const ouvert = !!ecart && !ecart.traiteLe;
  const signalable = !ouvert && feuille.statut !== 'controlee';

  async function envoyer() {
    setEtat({ envoi: true, erreur: null });
    try {
      onMaj(await signalerEcartTemps(slug, donnees.mois, saisie!));
      setSaisie(null);
      setEtat({ envoi: false, erreur: null });
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Signalement non envoyé.' });
    }
  }

  if (!ecart && !signalable) return null;
  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">Un écart sur cette feuille ?</h2>
      {ecart && (
        <div className="temps-ecart">
          <p className="dmd-note">
            <span className={`pill ${ouvert ? 'pill--attention' : 'pill--succes'}`}>{ouvert ? 'Signalé · en attente de la RH' : 'Traité'}</span>{' '}
            Vous avez signalé le {jjmmaaaa(ecart.signaleLe)} : « {ecart.commentaire} »
          </p>
          {ecart.reponse && ecart.traiteLe && (
            <p className="dmd-note">
              Réponse de la RH le {jjmmaaaa(ecart.traiteLe)} : « {ecart.reponse} »
            </p>
          )}
        </div>
      )}
      {signalable && saisie === null && (
        <div className="mt-decider">
          <p className="dmd-note">
            Absence oubliée, tâche mal datée… Si le calcul vous semble faux, signalez-le : la RH vérifie et corrige si besoin. Sans
            signalement, la feuille est considérée comme juste.
          </p>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setSaisie('')}>
            Signaler un écart
          </button>
        </div>
      )}
      {saisie !== null && (
        <>
          <label className="field">
            <span className="field-label">Ce qui ne va pas · {libelleMois(donnees.mois)}</span>
            <textarea
              className="field-input"
              rows={3}
              maxLength={1000}
              placeholder="Ex. : absence du 12 au 14 non prise en compte ; la tâche « Plans RDC » a commencé le 20, pas le 6."
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              autoFocus
            />
          </label>
          {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
          <div className="dmd-actions">
            <button type="button" className="btn-ghost btn-ghost--sm" disabled={etat.envoi} onClick={() => setSaisie(null)}>
              Annuler
            </button>
            <button type="button" className="btn-primary btn-primary--sm" disabled={etat.envoi || saisie.trim().length < 5} onClick={envoyer}>
              Envoyer à la RH
            </button>
          </div>
        </>
      )}
    </section>
  );
}
