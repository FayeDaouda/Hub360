'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Clock } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  controlerFeuilleTemps,
  formatHeures,
  getFeuillesTemps,
  HEURES_PAR_JOUR,
  LIBELLE_MANQUE,
  libelleMois,
  STATUT_FEUILLE,
} from '@/lib/temps';
import type { FeuilleTempsSalarie, FeuillesTemps } from '@/lib/types';
import { ConfirmModal } from '@/components/admin/confirm-modal';
import { LignesCalcul } from './lignes-calcul';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
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

  if (!donnees) return erreur ? <p className="field-erreur">{erreur}</p> : <div className="skeleton admin-skeleton-panel" aria-hidden />;

  const aControler = donnees.periodes.reduce((n, p) => n + p.aControler, 0);
  const courante = donnees.feuilles.find((f) => f.dossierId === choisi) ?? null;

  return (
    <>
      <div className="temps-grille">
        <section className="panel glass-panel dmd-section temps-panel">
          <div className="temps-entete">
            <div>
              <h2 className="dmd-titre">Feuilles de temps · {libelleMois(donnees.mois)}</h2>
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
                  {libelleMois(p.mois)}
                  {p.aControler > 0 && ` · ${p.aControler}`}
                </button>
              ))}
            </div>
          </div>
          {erreur && <p className="field-erreur">{erreur}</p>}

          {donnees.feuilles.length === 0 ? (
            <p className="empty-state">Aucun salarié présent ce mois-là.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table temps-table">
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
                        <button type="button" className="rh-nom" aria-pressed={f.dossierId === choisi} onClick={() => choisir(f.dossierId)}>
                          {nomDe(f)}
                        </button>
                        <span className="cell-sub">{f.poste || 'poste à renseigner'}</span>
                      </td>
                      <td data-label="Cellule">{f.cellule ?? <span className="cell-sub">—</span>}</td>
                      <td data-label="Imputées" className="num">{formatHeures(f.heuresImputees)}</td>
                      <td data-label="Disponibles" className="num">{formatHeures(f.heuresDisponibles)}</td>
                      <td data-label="Absences" className="num">{f.joursAbsence} j</td>
                      <td data-label="Occupation" className="num">{f.occupation == null ? '—' : `${f.occupation} %`}</td>
                      <td data-label="Contrôle RH">
                        <span className={`pill ${STATUT_FEUILLE[f.statut].pill}`}>
                          {f.statut === 'controlee' && f.controleLe
                            ? `Contrôlée le ${jjmmaaaa(f.controleLe)}`
                            : STATUT_FEUILLE[f.statut].libelle}
                        </span>
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
            <DetailFeuille key={`${courante.dossierId}:${courante.mois}`} slug={slug} f={courante} ecriture={ecriture} onControle={charger} />
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
  const controlable = ecriture && (f.statut === 'a_controler' || f.statut === 'sans_heures');
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
            {incompletes} bloc(s) sans heure : {[...new Set(f.lignes.flatMap((l) => (l.manque ? [LIBELLE_MANQUE[l.manque]] : [])))].join(', ')}.
          </p>
        )}
        {f.blocsNonPlanifies > 0 && (
          <p className="dmd-note temps-alerte">
            {f.blocsNonPlanifies} autre(s) bloc(s) assigné(s) sans début ou sans échéance : aucune heure tant qu’ils ne
            sont pas planifiés.
          </p>
        )}
      </div>

      {f.statut === 'controlee' && f.controleLe ? (
        <p className="dmd-note">Feuille contrôlée le {jjmmaaaa(f.controleLe)} : chiffres figés à cette date.</p>
      ) : f.statut === 'en_cours' ? (
        <p className="dmd-note">
          <Clock size={13} strokeWidth={2} aria-hidden /> Mois en cours : le contrôle s’ouvre une fois le mois clos.
        </p>
      ) : (
        controlable && (
          <div className="integ-confirmer">
            <button type="button" className="btn-primary" onClick={() => setConfirmation(true)}>
              <ClipboardCheck size={16} strokeWidth={2} aria-hidden /> Contrôler la feuille
            </button>
          </div>
        )
      )}

      {confirmation && (
        <ConfirmModal
          titre="Contrôler la feuille de temps"
          message={`La feuille de ${nomDe(f)} pour ${libelleMois(f.mois)} sera figée telle qu’affichée (${formatHeures(f.heuresImputees)} imputées sur ${formatHeures(f.heuresDisponibles)} disponibles).`}
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
