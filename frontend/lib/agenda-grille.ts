import { minutesOfDay } from '@hub/domain';
import type { ElementAgenda } from './agenda';

// Grille horaire de l'Agenda (12/11/2026) : où placer chaque rendez-vous d'un
// jour. Pur, testé. Deux rendez-vous qui se chevauchent se partagent la
// largeur, comme dans Google Agenda : chaque groupe de rendez-vous qui se
// touchent prend autant de colonnes que de rendez-vous simultanés au plus.

export const MINUTES_JOUR = 24 * 60;
// Un rendez-vous très court reste cliquable : 20 minutes de haut au moins.
const DUREE_VISIBLE_MIN = 20;

export type Place = {
  e: ElementAgenda;
  debut: number; // minutes depuis minuit
  fin: number;
  colonne: number;
  colonnes: number;
};

// Début et fin dans le jour `jour` (un rendez-vous qui déborde sur le
// lendemain s'arrête à minuit ; commencé la veille, il part de minuit).
function bornes(e: ElementAgenda, jour: string): [number, number] {
  const debut = e.debut!.slice(0, 10) < jour ? 0 : minutesOfDay(e.debut!);
  const fin = e.fin!.slice(0, 10) > jour ? MINUTES_JOUR : minutesOfDay(e.fin!);
  return [debut, Math.max(fin, debut + DUREE_VISIBLE_MIN)];
}

export function placerJour(elements: ElementAgenda[], jour: string): Place[] {
  const horaires = elements
    .filter((e) => e.debut && e.fin)
    .map((e) => {
      const [debut, fin] = bornes(e, jour);
      return { e, debut, fin, colonne: 0, colonnes: 1 };
    })
    .sort((a, b) => a.debut - b.debut || b.fin - a.fin);

  const places: Place[] = [];
  let groupe: Place[] = [];
  let finGroupe = -1;
  const fermer = () => {
    const n = Math.max(1, ...groupe.map((p) => p.colonne + 1));
    for (const p of groupe) p.colonnes = n;
    places.push(...groupe);
    groupe = [];
  };
  for (const p of horaires) {
    if (groupe.length && p.debut >= finGroupe) fermer();
    // Première colonne libre : celle dont le dernier rendez-vous est fini.
    const prises = new Set(groupe.filter((q) => q.fin > p.debut).map((q) => q.colonne));
    let c = 0;
    while (prises.has(c)) c++;
    p.colonne = c;
    groupe.push(p);
    finGroupe = Math.max(finGroupe, p.fin);
  }
  if (groupe.length) fermer();
  return places;
}

// Créneau cliqué : arrondi à la demi-heure inférieure, une heure par défaut.
export function creneauClique(minutes: number): { debut: number; fin: number } {
  const debut = Math.min(Math.floor(minutes / 30) * 30, MINUTES_JOUR - 60);
  return { debut, fin: debut + 60 };
}
