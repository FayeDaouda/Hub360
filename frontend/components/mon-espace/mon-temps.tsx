'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CalendarX, Clock, Gauge } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { formatHeures, getMonTemps, HEURES_PAR_JOUR, signalerEcartTemps, STATUT_FEUILLE } from '@/lib/temps';
import type { JourCalendrierTemps, MonTemps as DonneesMonTemps } from '@/lib/types';
import { KpiStrip } from '@/components/ui/kpi';
import { LignesCalcul } from '@/components/rh/lignes-calcul';
import { formatDate, formatMonthYear, todayIso } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, FieldError } from '@/components/ui/field';

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
      <EmptyState>{erreur}</EmptyState>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }
  const { feuille } = donnees;
  const controle =
    feuille.statut === 'controlee' && feuille.controleLe
      ? `contrôlée le ${formatDate(feuille.controleLe)}`
      : STATUT_FEUILLE[feuille.statut].libelle.toLowerCase();

  return (
    <>
      <div className="admin-periode temps-mois">
        <div className="admin-periode-toggle" role="group" aria-label="Mois">
          {donnees.periodes.map((m) => (
            <button
              key={m}
              type="button"
              className={m === donnees.mois ? 'is-active' : ''}
              aria-pressed={m === donnees.mois}
              onClick={() => setMois(m)}
            >
              {formatMonthYear(m)}
            </button>
          ))}
        </div>
        <span className="me-pastille">Contrôle RH : {controle}</span>
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}

      <KpiStrip
        tiles={[
          {
            id: 'imputees',
            label: 'Heures imputées',
            value: formatHeures(feuille.heuresImputees),
            hint: `${feuille.lignes.length} assignation(s)`,
            icon: Clock,
          },
          {
            id: 'disponibles',
            label: 'Heures disponibles',
            value: formatHeures(feuille.heuresDisponibles),
            hint: `jours ouvrés écoulés × ${HEURES_PAR_JOUR} h`,
            icon: CalendarClock,
          },
          {
            id: 'absences',
            label: 'Absences',
            value: `${feuille.joursAbsence} j`,
            hint: 'congés et absences validés',
            icon: CalendarX,
          },
          {
            id: 'occupation',
            label: 'Taux d’occupation',
            value: `${feuille.occupation ?? 0} %`,
            hint: 'imputé / disponible',
            icon: Gauge,
          },
        ]}
      />

      {feuille.calendrier && <CalendrierMois jours={feuille.calendrier} />}

      <section className="panel glass-panel dmd-section temps-panel">
        <h2 className="dmd-titre">Détail du calcul · {formatMonthYear(feuille.mois)}</h2>
        <LignesCalcul lignes={feuille.lignes} variante="salarie" />
        <p className="dmd-note">
          Calcul automatique : durée standard de chaque tâche assignée, répartie sur les jours ouvrés de sa fenêtre,
          hors absences validées. Vous ne saisissez rien ; la RH contrôle la feuille chaque mois.
        </p>
      </section>

      {donnees.signalable && <EcartTemps slug={slug} donnees={donnees} onMaj={setDonnees} />}
    </>
  );
}

// Écart : signalé tant que la RH n'a pas contrôlé le mois ; un seul ouvert.
function EcartTemps({
  slug,
  donnees,
  onMaj,
}: {
  slug: string;
  donnees: DonneesMonTemps;
  onMaj: (d: DonneesMonTemps) => void;
}) {
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
            <Pill className={ouvert ? 'pill--attention' : 'pill--succes'}>
              {ouvert ? 'Signalé · en attente de la RH' : 'Traité'}
            </Pill>{' '}
            Vous avez signalé le {formatDate(ecart.signaleLe)} : « {ecart.commentaire} »
          </p>
          {ecart.reponse && ecart.traiteLe && (
            <p className="dmd-note">
              Réponse de la RH le {formatDate(ecart.traiteLe)} : « {ecart.reponse} »
            </p>
          )}
        </div>
      )}
      {signalable && saisie === null && (
        <div className="mt-decider">
          <p className="dmd-note">
            Absence oubliée, tâche mal datée… Si le calcul vous semble faux, signalez-le : la RH vérifie et corrige si
            besoin. Sans signalement, la feuille est considérée comme juste.
          </p>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setSaisie('')}>
            Signaler un écart
          </button>
        </div>
      )}
      {saisie !== null && (
        <>
          <Field label={<>Ce qui ne va pas · {formatMonthYear(donnees.mois)}</>}>
            <textarea
              className="field-input"
              rows={3}
              maxLength={1000}
              placeholder="Ex. : absence du 12 au 14 non prise en compte ; la tâche « Plans RDC » a commencé le 20, pas le 6."
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              autoFocus
            />
          </Field>
          {etat.erreur && <FieldError>{etat.erreur}</FieldError>}
          <div className="dmd-actions">
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={etat.envoi}
              onClick={() => setSaisie(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={etat.envoi || saisie.trim().length < 5}
              onClick={envoyer}
            >
              Envoyer à la RH
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const NATURE: Record<JourCalendrierTemps['nature'], string> = {
  travail: 'Travaillé',
  absence: 'Absence',
  ferie: 'Férié',
  weekend: 'Week-end',
  hors: 'À venir',
};

// Le mois en grille (19/10/2026) : la feuille se lit d'un coup d'œil, un
// écart (absence oubliée, jour vide) se repère tout seul. Intensité de la
// case = heures du jour sur 8 h.
function CalendrierMois({ jours }: { jours: JourCalendrierTemps[] }) {
  const aujourdhui = todayIso();
  // Cases vides avant le 1er (semaine du lundi).
  const decalage = (new Date(`${jours[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">Mon mois jour par jour</h2>
      <div className="tc-grille" role="table" aria-label="Heures par jour">
        {JOURS_SEMAINE.map((j) => (
          <span key={j} className="tc-entete" role="columnheader">
            {j}
          </span>
        ))}
        {Array.from({ length: decalage }, (_, i) => (
          <span key={`v${i}`} className="tc-jour tc-jour--vide" aria-hidden />
        ))}
        {jours.map((j) => (
          <span
            key={j.date}
            role="cell"
            className={`tc-jour tc-jour--${j.nature}${j.date === aujourdhui ? ' is-aujourdhui' : ''}`}
            style={
              j.nature === 'travail'
                ? ({ '--tc-charge': Math.min(1, j.heures / HEURES_PAR_JOUR) } as React.CSSProperties)
                : undefined
            }
            title={`${formatDate(j.date)} · ${NATURE[j.nature]}${j.heures ? ` · ${formatHeures(j.heures)}` : ''}`}
          >
            <span className="tc-numero">{Number(j.date.slice(8, 10))}</span>
            <span className="tc-valeur">
              {j.nature === 'travail'
                ? j.heures
                  ? formatHeures(j.heures)
                  : '0 h'
                : j.nature === 'absence' || j.nature === 'ferie'
                  ? NATURE[j.nature]
                  : ''}
            </span>
          </span>
        ))}
      </div>
      <p className="tc-legende">
        <span className="tc-puce tc-puce--travail" /> heures imputées (plus foncé = plus chargé)
        <span className="tc-puce tc-puce--absence" /> absence validée
        <span className="tc-puce tc-puce--ferie" /> jour férié
        <span className="tc-puce tc-puce--hors" /> à venir
      </p>
    </section>
  );
}
