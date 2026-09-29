'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarX, Clock, Gauge, Hourglass } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { formatHeures, getMonTemps, HEURES_PAR_JOUR, libelleMois, STATUT_FEUILLE } from '@/lib/temps';
import type { MonTemps as DonneesMonTemps } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { LignesCalcul } from '@/components/rh/lignes-calcul';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Impossible de charger ton temps.');

// « Mon espace » · Mon temps (RH lot 4) : la feuille du mois, calculée
// automatiquement à partir des blocs assignés (durée standard répartie du
// début à l'échéance), hors absences validées. Lecture seule. Le détail par
// tâche (prévu · imputé) vit dans « Mes performances ».
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
          standard qui tombe dans le mois. Personne ne saisit ni ne modifie ces heures.
        </p>
        {feuille.lignes.length === 0 ? (
          <p className="empty-state">Aucun bloc assigné dont la fenêtre touche ce mois.</p>
        ) : (
          <LignesCalcul lignes={feuille.lignes} />
        )}
      </section>
    </>
  );
}
