import type { ProcessusCellule, StatutTacheProjet } from '@prisma/client';
import type { EtatTache } from '../projets/gabarit/etats';
import { arrondi, bornesMois, heuresTache, joursAbsents, type Feries, type Periode } from '../rh/regles-temps';

// Équipes (maquette du boss, oct. 2026) — règles pures : nomenclature des
// cellules (ISO 9001, SOCIÉTÉ-PROCESSUS-NN) et indicateurs tirés des tâches
// du gabarit (TacheProjet). Dates AAAA-MM-JJ.

// Initiales de la société : « Grey Concrete » → GC (même règle que la
// migration qui a codé les cellules existantes).
export const companyPrefix = (nom: string) =>
  nom
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((m) => m[0])
    .join('')
    .toUpperCase();

export const cellCode = (prefixe: string, processus: ProcessusCellule, numero: number) =>
  `${prefixe}-${processus}-${String(numero).padStart(2, '0')}`;

export type TeamTask = {
  debut: string | null;
  echeance: string | null; // échéance de référence (délai figé)
  heures: number | null; // durée standard
  statut: StatutTacheProjet;
  valideeLe: string | null; // AAAA-MM-JJ
};

const pourcent = (n: number, sur: number) => Math.round((n / sur) * 100);

// Part des tâches validées au plus tard à leur échéance ; null = aucune
// tâche encore validée (« pas encore d'étape livrée »).
export function onTimeShare(taches: TeamTask[]): number | null {
  const livrees = taches.filter((t) => t.statut === 'validee' && t.valideeLe && t.echeance);
  if (livrees.length === 0) return null;
  return pourcent(livrees.filter((t) => t.valideeLe! <= t.echeance!).length, livrees.length);
}

// Tâches en cours (revue CTO, 22/10/2026) : démarrées et pas encore faites,
// selon l'état commun des projets (etats.ts) — le même que Production et le
// reporting de la direction. Une prolongation accordée qualifie le retard :
// la tâche n'est pas comptée en retard.
const EN_COURS: ReadonlySet<EtatTache['code']> = new Set([
  'en_cours',
  'en_retard',
  'prolongee',
  'a_valider',
  'reprise',
  'a_viser',
]);
export const isInProgress = (code: EtatTache['code']) => EN_COURS.has(code);
export function tasksInProgress(codes: EtatTache['code'][]) {
  const enCours = codes.filter(isInProgress);
  const enRetard = enCours.filter((c) => c === 'en_retard').length;
  return {
    enCours: enCours.length,
    enRetard,
    pctATemps: enCours.length ? pourcent(enCours.length - enRetard, enCours.length) : null,
  };
}

// Charge du mois en cours d'un collaborateur : tâches dont la fenêtre touche
// le mois, et heures imputées jusqu'à aujourd'hui (calcul RH : durée standard
// répartie sur les jours de présence de la fenêtre).
export function monthlyLoad(taches: TeamTask[], absences: Periode[], aujourdhui: string, feries: Feries) {
  const mois = bornesMois(aujourdhui.slice(0, 7));
  const actives = taches.filter(
    (t) =>
      t.statut !== 'non_necessaire' && !!t.debut && !!t.echeance && t.debut <= mois.fin && t.echeance >= mois.debut,
  );
  const absents = joursAbsents(absences, feries);
  const periode = { debut: mois.debut, fin: aujourdhui };
  return {
    taches: actives.length,
    heures: arrondi(
      actives.reduce(
        (s, t) =>
          s + heuresTache({ id: '', debut: t.debut, echeance: t.echeance, heures: t.heures }, absents, periode, feries),
        0,
      ),
    ),
  };
}
