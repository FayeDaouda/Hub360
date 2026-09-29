'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarX, Clock, Gauge, Hourglass } from 'lucide-react';
import { useTitrePage } from '@/lib/layout-contexte';
import { ApiError } from '@/lib/client-api';
import {
  formatHeures,
  getMonTemps,
  HEURES_PAR_JOUR,
  LIBELLE_MANQUE,
  LIBELLE_SECTION,
  libelleMois,
  STATUT_FEUILLE,
} from '@/lib/temps';
import type { EtatTacheTemps, MonTemps, TacheTemps } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { LignesCalcul } from '@/components/rh/lignes-calcul';

type Props = { params: { slug: string } };
type Filtre = 'toutes' | EtatTacheTemps | 'a_planifier';

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Impossible de charger ton temps.');

const jourMs = 86_400_000;
const ecartJours = (de: string, a: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / jourMs);

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'toutes', libelle: 'Toutes' },
  { cle: 'en_cours', libelle: 'En cours' },
  { cle: 'a_venir', libelle: 'À venir' },
  { cle: 'terminee', libelle: 'Terminées' },
  { cle: 'a_planifier', libelle: 'À planifier' },
];
const correspond = (t: TacheTemps, f: Filtre) =>
  f === 'toutes' || (f === 'a_planifier' ? t.etat === null : t.etat === f);

function statutTache(t: TacheTemps, aujourdhui: string): { libelle: string; pill: string } {
  if (t.etat === null) return { libelle: 'À planifier', pill: 'pill--neutre' };
  if (t.etat === 'a_venir') return { libelle: `À venir · J-${ecartJours(aujourdhui, t.debut!)}`, pill: 'pill--neutre' };
  if (t.etat === 'terminee') return { libelle: 'Fenêtre close', pill: 'pill--succes' };
  const reste = ecartJours(aujourdhui, t.echeance!);
  return { libelle: reste === 0 ? 'Échéance aujourd’hui' : `Échéance dans ${reste} j`, pill: 'pill--info' };
}

// « Mon temps » (RH lot 4) : le temps du salarié, calculé automatiquement à
// partir des blocs qui lui sont assignés (durée standard répartie du début à
// l'échéance), hors absences validées. Lecture seule.
export default function MonTempsPage({ params }: Props) {
  useTitrePage('Mon temps');
  const { slug } = params;
  const [donnees, setDonnees] = useState<MonTemps | null>(null);
  const [mois, setMois] = useState<string | undefined>(undefined);
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [erreur, setErreur] = useState<string | null>(null);
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
  const { feuille, taches } = donnees;
  const visibles = taches.filter((t) => correspond(t, filtre));
  const statut = STATUT_FEUILLE[feuille.statut];

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
      </div>
      {erreur && <p className="field-erreur">{erreur}</p>}

      <KpiStrip
        tuiles={[
          {
            cle: 'imputees',
            label: `Temps imputé · ${libelleMois(feuille.mois)}`,
            valeur: formatHeures(feuille.heuresImputees),
            sousTexte: feuille.statut === 'en_cours' ? 'jusqu’à aujourd’hui · calcul automatique' : 'calcul automatique',
            icone: Clock,
          },
          {
            cle: 'occupation',
            label: 'Occupation',
            valeur: feuille.occupation == null ? '—' : `${feuille.occupation} %`,
            sousTexte: `sur ${formatHeures(feuille.heuresDisponibles)} disponibles`,
            icone: Gauge,
          },
          {
            cle: 'absences',
            label: 'Absences',
            valeur: `${feuille.joursAbsence} j`,
            sousTexte: 'absences validées, déduites',
            icone: CalendarX,
          },
          {
            cle: 'controle',
            label: 'Contrôle RH',
            valeur: feuille.statut === 'controlee' && feuille.controleLe ? jjmmaaaa(feuille.controleLe) : statut.libelle,
            sousTexte: feuille.statut === 'controlee' ? 'feuille contrôlée, chiffres figés' : 'la RH contrôle les mois clos',
            icone: Hourglass,
          },
        ]}
      />

      <section className="panel glass-panel dmd-section temps-panel">
        <h2 className="dmd-titre">Détail de {libelleMois(feuille.mois)}</h2>
        <p className="dmd-note">
          Disponibles : jours ouvrés de présence × {HEURES_PAR_JOUR} h. Chaque bloc compte pour la part de sa durée
          standard qui tombe dans le mois.
        </p>
        {feuille.lignes.length === 0 ? (
          <p className="empty-state">Aucun bloc assigné dont la fenêtre touche ce mois.</p>
        ) : (
          <LignesCalcul lignes={feuille.lignes} />
        )}
      </section>

      <section className="panel glass-panel dmd-section temps-panel">
        <div className="temps-entete">
          <div>
            <h2 className="dmd-titre">Mes tâches assignées</h2>
            <p className="dmd-note">
              Seul ce qui t’est assigné compte. Le temps est calculé automatiquement (durée standard de chaque bloc,
              répartie sur sa fenêtre), hors absences ; il n’est pas modifiable.
            </p>
          </div>
          <div className="vue-toggle" role="group" aria-label="Filtrer les tâches">
            {FILTRES.map((f) => (
              <button key={f.cle} type="button" className={filtre === f.cle ? 'is-active' : ''} aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
                {f.libelle} · {taches.filter((t) => correspond(t, f.cle)).length}
              </button>
            ))}
          </div>
        </div>
        {visibles.length === 0 ? (
          <p className="empty-state">Aucune tâche.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table temps-table">
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Tâche</th>
                  <th className="num">Durée std</th>
                  <th>Période</th>
                  <th className="num">Prévu · imputé</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => {
                  const s = statutTache(t, aujourdhui);
                  return (
                    <tr key={t.id}>
                      <td className="rh-matricule">{t.projetCode}</td>
                      <td data-label="Tâche">
                        {t.libelle}
                        <span className="cell-sub">
                          {LIBELLE_SECTION[t.section]} · {t.projetProgramme}
                        </span>
                      </td>
                      <td data-label="Durée std" className="num">{t.dureeStandard == null ? '—' : formatHeures(t.dureeStandard)}</td>
                      <td data-label="Période">
                        {t.debut && t.echeance ? `du ${jjmm(t.debut)} au ${jjmm(t.echeance)}` : '—'}
                        {t.manque && <span className="cell-sub temps-alerte">{LIBELLE_MANQUE[t.manque]}</span>}
                      </td>
                      <td data-label="Prévu · imputé" className="num">
                        {t.dureeStandard == null ? '—' : `${formatHeures(t.dureeStandard)} · ${formatHeures(t.heuresImputees)}`}
                      </td>
                      <td data-label="Statut">
                        <span className={`pill ${s.pill}`}>{s.libelle}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
