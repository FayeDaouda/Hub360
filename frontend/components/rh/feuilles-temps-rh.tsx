'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Clock } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  controlerFeuilleTemps,
  formatHeures,
  traiterEcartTemps,
  getFeuillesTemps,
  HEURES_PAR_JOUR,
  LIBELLE_MANQUE,
  STATUT_FEUILLE,
} from '@/lib/temps';
import type { FeuilleTempsSalarie, FeuillesTemps } from '@/lib/types';
import { ConfirmModal } from '@/components/admin/confirm-modal';
import { BoutonExport } from '@/components/bouton-export';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { LignesCalcul } from './lignes-calcul';
import { formatDate, formatMonthYear } from '@/lib/dates';
import { plural } from '@/lib/text';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Chargement impossible.');
const nomDe = (f: FeuilleTempsSalarie) => `${f.prenom} ${f.nom}`.trim() || f.matricule;

// Onglet « Feuilles de temps » de la page RH (lot 4) : calcul automatique à
// partir des blocs assignés dans les projets, hors absences validées.
// Personne ne saisit d'heures ; la RH contrôle les mois clos (chiffres figés).
export function FeuillesTempsRh({ slug, ecriture }: { slug: string; ecriture: boolean }) {
  const [donnees, setDonnees] = useState<FeuillesTemps | null>(null);
  const [mois, setMois] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const detail = useRef<HTMLElement>(null);

  // Sous 1500 px le détail passe sous le tableau : on l'amène à l'écran.
  function choisir(dossierId: string) {
    setChoisi(dossierId);
    requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  const charger = useCallback(() => {
    setErreur(null);
    getFeuillesTemps(slug, mois)
      .then(setDonnees)
      .catch((e) => setErreur(msg(e)));
  }, [slug, mois]);
  useEffect(charger, [charger]);

  if (!donnees)
    return erreur ? (
      <p className="field-erreur">{erreur}</p>
    ) : (
      <div className="skeleton admin-skeleton-panel" aria-hidden />
    );

  const courante = donnees.feuilles.find((f) => f.dossierId === choisi) ?? null;

  return (
    <>
      <div className="temps-grille">
        <section className="panel glass-panel dmd-section temps-panel">
          <div className="temps-entete">
            <div>
              <h2 className="dmd-titre">Feuilles de temps · {formatMonthYear(donnees.mois)}</h2>
              <p className="dmd-note">
                Calcul automatique à partir des blocs assignés dans les projets (durée standard répartie du début à
                l’échéance), hors absences validées. Personne ne saisit ni ne modifie les heures.
              </p>
            </div>
            <div className="admin-periode-toggle" role="group" aria-label="Mois">
              {donnees.periodes.map((p) => (
                <button
                  key={p.mois}
                  type="button"
                  className={p.mois === donnees.mois ? 'is-active' : ''}
                  aria-pressed={p.mois === donnees.mois}
                  onClick={() => {
                    setChoisi(null);
                    setMois(p.mois);
                  }}
                >
                  {formatMonthYear(p.mois)}
                  {p.aControler > 0 && ` · ${p.aControler}`}
                  {p.ecarts > 0 && ` · ${plural(p.ecarts, 'écart')}`}
                </button>
              ))}
            </div>
          </div>
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="temps-export">
            <BoutonExport
              desactive={!donnees.feuilles.length}
              onExporter={() =>
                exporterCsv(
                  `feuilles-temps-${donnees.mois}`,
                  [
                    { titre: 'Matricule', valeur: (f) => f.matricule },
                    { titre: 'Salarié', valeur: nomDe },
                    { titre: 'Poste', valeur: (f) => f.poste },
                    { titre: 'Cellule', valeur: (f) => f.cellule },
                    { titre: 'Heures imputées', valeur: (f) => f.heuresImputees },
                    { titre: 'Heures disponibles', valeur: (f) => f.heuresDisponibles },
                    { titre: 'Jours d’absence', valeur: (f) => f.joursAbsence },
                    { titre: 'Occupation (%)', valeur: (f) => f.occupation },
                    { titre: 'Contrôle RH', valeur: (f) => STATUT_FEUILLE[f.statut].libelle },
                    { titre: 'Contrôlée le', valeur: (f) => dateExport(f.controleLe) },
                  ],
                  donnees.feuilles,
                )
              }
            />
          </div>

          {donnees.feuilles.length === 0 ? (
            <p className="empty-state">Aucun salarié présent ce mois-là.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table temps-table temps-liste">
                <thead>
                  <tr>
                    <th>Salarié</th>
                    <th>Cellule</th>
                    <th className="num">Imputées</th>
                    <th className="num">Disponibles</th>
                    <th className="num">Absences</th>
                    <th className="num">Occupation</th>
                    <th>Contrôle RH</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.feuilles.map((f) => (
                    <tr key={f.dossierId} className={f.dossierId === choisi ? 'is-active' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="rh-nom"
                          aria-pressed={f.dossierId === choisi}
                          onClick={() => choisir(f.dossierId)}
                        >
                          {nomDe(f)}
                        </button>
                        <span className="cell-sub">{f.poste || 'poste à renseigner'}</span>
                      </td>
                      <td data-label="Cellule" className="tl-cellule">
                        {f.cellule ?? <span className="cell-sub">—</span>}
                      </td>
                      <td data-label="Imputées" className="num">
                        {formatHeures(f.heuresImputees)}
                      </td>
                      <td data-label="Disponibles" className="num">
                        {formatHeures(f.heuresDisponibles)}
                      </td>
                      <td data-label="Absences" className="num">
                        {f.joursAbsence} j
                      </td>
                      <td data-label="Occupation" className="num">
                        {f.occupation == null ? '—' : `${f.occupation} %`}
                      </td>
                      <td data-label="Contrôle RH" className="tl-statut">
                        <span className={`pill ${STATUT_FEUILLE[f.statut].pill}`}>
                          {f.statut === 'controlee' && f.controleLe
                            ? `Contrôlée le ${formatDate(f.controleLe)}`
                            : STATUT_FEUILLE[f.statut].libelle}
                        </span>
                        {f.ecart && !f.ecart.traiteLe && <span className="pill pill--attention">Écart signalé</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section ref={detail} className="panel glass-panel dmd-section temps-panel">
          {!courante ? (
            <p className="dmd-note">Sélectionnez un salarié pour voir le détail du calcul et contrôler sa feuille.</p>
          ) : (
            <DetailFeuille
              key={`${courante.dossierId}:${courante.mois}`}
              slug={slug}
              f={courante}
              ecriture={ecriture}
              onControle={charger}
            />
          )}
        </section>
      </div>
    </>
  );
}

function DetailFeuille({
  slug,
  f,
  ecriture,
  onControle,
}: {
  slug: string;
  f: FeuilleTempsSalarie;
  ecriture: boolean;
  onControle: () => void;
}) {
  const [confirmation, setConfirmation] = useState(false);
  const joursPresents = f.heuresDisponibles / HEURES_PAR_JOUR;
  const ecartOuvert = !!f.ecart && !f.ecart.traiteLe;
  const controlable = ecriture && !ecartOuvert && (f.statut === 'a_controler' || f.statut === 'sans_heures');
  const incompletes = f.lignes.filter((l) => l.manque).length;

  return (
    <>
      <div>
        <h2 className="dmd-titre">{nomDe(f)}</h2>
        <span className="cell-sub">
          {f.matricule} · {f.poste || 'poste à renseigner'} · {f.societe}
          {f.cellule && ` · ${f.cellule}`}
        </span>
      </div>

      <dl className="temps-chiffres">
        <div>
          <dt>Imputées</dt>
          <dd>{formatHeures(f.heuresImputees)}</dd>
        </div>
        <div>
          <dt>Disponibles</dt>
          <dd>{formatHeures(f.heuresDisponibles)}</dd>
        </div>
        <div>
          <dt>Absences</dt>
          <dd>{f.joursAbsence} j</dd>
        </div>
        <div>
          <dt>Occupation</dt>
          <dd>{f.occupation == null ? '—' : `${f.occupation} %`}</dd>
        </div>
      </dl>
      <p className="dmd-note">
        Disponibles : {joursPresents} jour(s) ouvré(s) de présence × {HEURES_PAR_JOUR} h
        {f.statut === 'en_cours' && ', jusqu’à aujourd’hui'}. Occupation = imputées ÷ disponibles.
      </p>

      <div>
        <h3 className="rh-section">Blocs du mois</h3>
        {f.lignes.length === 0 ? (
          <p className="dmd-note">Aucun bloc assigné dont la fenêtre touche ce mois.</p>
        ) : (
          <LignesCalcul lignes={f.lignes} />
        )}
        {incompletes > 0 && (
          <p className="dmd-note temps-alerte">
            {incompletes} bloc(s) sans heure :{' '}
            {[...new Set(f.lignes.flatMap((l) => (l.manque ? [LIBELLE_MANQUE[l.manque]] : [])))].join(', ')}.
          </p>
        )}
        {f.blocsNonPlanifies > 0 && (
          <p className="dmd-note temps-alerte">
            {f.blocsNonPlanifies} autre(s) bloc(s) assigné(s) sans début ou sans échéance : aucune heure tant qu’ils ne
            sont pas planifiés.
          </p>
        )}
      </div>

      {f.ecart && <EcartRh key={f.ecart.id} slug={slug} f={f} ecriture={ecriture} onTraite={onControle} />}

      {f.statut === 'controlee' && f.controleLe ? (
        <p className="dmd-note">Feuille contrôlée le {formatDate(f.controleLe)} : chiffres figés à cette date.</p>
      ) : f.statut === 'en_cours' ? (
        <p className="dmd-note">
          <Clock size={13} aria-hidden /> Mois en cours : le contrôle s’ouvre une fois le mois clos.
        </p>
      ) : f.statut === 'cloture' ? (
        <p className="dmd-note">
          <Clock size={13} aria-hidden /> Mois clos : le contrôle s’ouvre le 3 du mois suivant, le temps que les
          dernières absences et remises soient saisies.
        </p>
      ) : (
        controlable && (
          <div className="integ-confirmer">
            <button type="button" className="btn-primary" onClick={() => setConfirmation(true)}>
              <ClipboardCheck size={16} aria-hidden /> Contrôler la feuille
            </button>
          </div>
        )
      )}

      {confirmation && (
        <ConfirmModal
          titre="Contrôler la feuille de temps"
          message={`La feuille de ${nomDe(f)} pour ${formatMonthYear(f.mois)} sera figée telle qu’affichée (${formatHeures(f.heuresImputees)} imputées sur ${formatHeures(f.heuresDisponibles)} disponibles).`}
          onConfirm={async () => {
            await controlerFeuilleTemps(slug, f.dossierId, f.mois);
            onControle();
          }}
          onClose={() => setConfirmation(false)}
        />
      )}
    </>
  );
}

// Écart signalé par le salarié (revue Salarié 19/10/2026) : la RH corrige la
// source si besoin (absence, fenêtre de tâche) — le calcul suit — puis
// répond, ce qui clôt l'écart et rouvre le contrôle du mois.
function EcartRh({
  slug,
  f,
  ecriture,
  onTraite,
}: {
  slug: string;
  f: FeuilleTempsSalarie;
  ecriture: boolean;
  onTraite: () => void;
}) {
  const e = f.ecart!;
  const [reponse, setReponse] = useState('');
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });

  async function repondre() {
    setEtat({ envoi: true, erreur: null });
    try {
      await traiterEcartTemps(slug, e.id, reponse);
      onTraite();
    } catch (err) {
      setEtat({ envoi: false, erreur: err instanceof ApiError ? err.message : 'Réponse non enregistrée.' });
    }
  }

  return (
    <div className="temps-ecart">
      <h3 className="rh-section">Écart signalé par le salarié</h3>
      <p className="dmd-note">
        <span className={`pill ${e.traiteLe ? 'pill--succes' : 'pill--attention'}`}>
          {e.traiteLe ? 'Traité' : 'À traiter'}
        </span>{' '}
        Le {formatDate(e.signaleLe)} : « {e.commentaire} »
      </p>
      {e.traiteLe ? (
        <p className="dmd-note">
          Réponse du {formatDate(e.traiteLe)} : « {e.reponse} »
        </p>
      ) : ecriture ? (
        <>
          <p className="dmd-note">
            Corrigez la source si besoin (absence à enregistrer, dates de la tâche dans Projets) : la feuille se
            recalcule. Puis répondez au salarié ; le contrôle du mois se rouvre.
          </p>
          <label className="field">
            <span className="field-label">Réponse au salarié</span>
            <textarea
              className="field-input"
              rows={2}
              maxLength={1000}
              value={reponse}
              onChange={(ev) => setReponse(ev.target.value)}
            />
          </label>
          {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
          <div className="dmd-actions">
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={etat.envoi || reponse.trim().length < 3}
              onClick={repondre}
            >
              Répondre et clore
            </button>
          </div>
        </>
      ) : (
        <p className="dmd-note">En attente de la réponse de la RH.</p>
      )}
    </div>
  );
}
