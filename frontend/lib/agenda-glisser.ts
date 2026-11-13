import { dakarInstant, hhmmOfMinutes, minutesOfDay } from '@hub/domain';
import { MINUTES_JOUR } from './agenda-grille';

// Glisser-déplacer dans la grille de l'Agenda (12/11/2026) : pur, testé.
// Les heures se calent au quart d'heure ; un rendez-vous reste dans sa
// journée (de 00:00 à 24:00) et dure 15 minutes au moins.

export const PAS_MINUTES = 15;
const caler = (m: number) => Math.round(m / PAS_MINUTES) * PAS_MINUTES;

export type Creneau = { jour: string; debut: number; fin: number }; // minutes depuis minuit

export const creneauDe = (debutIso: string, finIso: string): Creneau => {
  const debut = minutesOfDay(debutIso);
  // Fin à minuit pile le lendemain : 24:00 du même jour.
  const fin = finIso.slice(0, 10) > debutIso.slice(0, 10) ? MINUTES_JOUR : minutesOfDay(finIso);
  return { jour: debutIso.slice(0, 10), debut, fin };
};

// Déplacer : même durée, décalée de `delta` minutes, vers le jour `jour`.
export function deplacer(c: Creneau, delta: number, jour: string): Creneau {
  const duree = c.fin - c.debut;
  const debut = Math.min(Math.max(caler(c.debut + delta), 0), MINUTES_JOUR - duree);
  return { jour, debut, fin: debut + duree };
}

// Allonger ou raccourcir par le bas : 15 minutes au moins, minuit au plus.
export function redimensionner(c: Creneau, delta: number): Creneau {
  const fin = Math.min(Math.max(caler(c.fin + delta), c.debut + PAS_MINUTES), MINUTES_JOUR);
  return { ...c, fin };
}

// Instants ISO (heure de Dakar) ; 24:00 = minuit du lendemain moins rien :
// on garde 23:59 pour rester dans la journée, comme le formulaire.
export function instants(c: Creneau): { debut: string; fin: string } {
  return {
    debut: dakarInstant(c.jour, hhmmOfMinutes(c.debut)),
    fin: dakarInstant(c.jour, hhmmOfMinutes(Math.min(c.fin, MINUTES_JOUR - 1))),
  };
}

export const memeCreneau = (a: Creneau, b: Creneau) => a.jour === b.jour && a.debut === b.debut && a.fin === b.fin;
