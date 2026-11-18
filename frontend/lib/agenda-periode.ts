import { addDays, addMonths } from '@hub/domain';

// Périodes de l'Agenda (18/11/2026) : les vues, la période affichée autour
// d'un jour, le pas des flèches et le titre de la barre. Pur, testé.

export type Vue = 'jour' | '3jours' | 'semaine' | 'mois' | 'annee' | 'planning';

export const VUES: { cle: Vue; libelle: string; raccourci: string }[] = [
  { cle: 'jour', libelle: 'Jour', raccourci: 'J' },
  { cle: '3jours', libelle: '3 jours', raccourci: 'X' },
  { cle: 'semaine', libelle: 'Semaine', raccourci: 'S' },
  { cle: 'mois', libelle: 'Mois', raccourci: 'M' },
  { cle: 'annee', libelle: 'Année', raccourci: 'A' },
  { cle: 'planning', libelle: 'Planning', raccourci: 'P' },
];
// Vues en grille horaire.
export const enGrille = (v: Vue) => v === 'jour' || v === '3jours' || v === 'semaine';
// Planning : les 30 jours qui viennent, jours chargés seulement.
export const JOURS_PLANNING = 30;

// Lundi de la semaine d'un jour AAAA-MM-JJ.
export function lundi(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(jour, d === 0 ? -6 : 1 - d);
}

// Période affichée autour du jour `ancre` : le jour ; trois jours à partir
// de lui ; sa semaine ; son mois en grille de 6 semaines (jours voisins
// compris) ; son année civile ; le planning des 30 jours à partir de lui.
export function periode(vue: Vue, ancre: string): { du: string; au: string } {
  switch (vue) {
    case 'jour':
      return { du: ancre, au: ancre };
    case '3jours':
      return { du: ancre, au: addDays(ancre, 2) };
    case 'planning':
      return { du: ancre, au: addDays(ancre, JOURS_PLANNING - 1) };
    case 'semaine': {
      const du = lundi(ancre);
      return { du, au: addDays(du, 6) };
    }
    case 'mois': {
      const du = lundi(`${ancre.slice(0, 7)}-01`);
      return { du, au: addDays(du, 41) };
    }
    case 'annee':
      return { du: `${ancre.slice(0, 4)}-01-01`, au: `${ancre.slice(0, 4)}-12-31` };
  }
}

// Le jour où mènent les flèches (sens = 1 : suivant, -1 : précédent).
export function decaler(vue: Vue, ancre: string, sens: 1 | -1): string {
  switch (vue) {
    case 'jour':
      return addDays(ancre, sens);
    case '3jours':
      return addDays(ancre, 3 * sens);
    case 'semaine':
      return addDays(ancre, 7 * sens);
    case 'planning':
      return addDays(ancre, JOURS_PLANNING * sens);
    case 'mois':
      return addMonths(ancre, sens);
    case 'annee':
      return addMonths(ancre, 12 * sens);
  }
}

export const LIBELLES_FLECHES: Record<Vue, [string, string]> = {
  jour: ['Jour précédent', 'Jour suivant'],
  '3jours': ['Trois jours précédents', 'Trois jours suivants'],
  semaine: ['Semaine précédente', 'Semaine suivante'],
  mois: ['Mois précédent', 'Mois suivant'],
  annee: ['Année précédente', 'Année suivante'],
  planning: ['Période précédente', 'Période suivante'],
};

const UTC = { timeZone: 'UTC' } as const;
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { ...UTC, ...o });
const F_MOIS_ANNEE = fmt({ month: 'long', year: 'numeric' });
const F_JOUR_LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const F_MOIS = fmt({ month: 'long' });
const F_MOIS_COURT = fmt({ month: 'short' });
const date = (jour: string) => new Date(`${jour}T12:00:00Z`);
const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (jour: string) => Number(jour.slice(8, 10));

// « 16 – 22 novembre 2026 », « 30 novembre – 6 décembre 2026 »,
// « 29 déc. 2026 – 4 janv. 2027 » (comme Google Agenda).
export function intervalle(du: string, au: string): string {
  if (du === au) return capitale(F_JOUR_LONG.format(date(du)));
  const [ad, md] = [du.slice(0, 4), du.slice(5, 7)];
  const [aa, ma] = [au.slice(0, 4), au.slice(5, 7)];
  if (ad !== aa) {
    return `${num(du)} ${F_MOIS_COURT.format(date(du))} ${ad} – ${num(au)} ${F_MOIS_COURT.format(date(au))} ${aa}`;
  }
  if (md !== ma) return `${num(du)} ${F_MOIS.format(date(du))} – ${num(au)} ${F_MOIS.format(date(au))} ${aa}`;
  return `${num(du)} – ${num(au)} ${F_MOIS.format(date(au))} ${aa}`;
}

const MILIEU: Record<Exclude<Vue, 'mois' | 'annee'>, (du: string) => string> = {
  jour: (du) => du,
  '3jours': (du) => addDays(du, 1),
  semaine: (du) => addDays(du, 3),
  planning: (du) => du,
};

// Titre de la barre. `court` (téléphone) : le mois seulement, comme Google
// Agenda sur mobile — il ouvre le mini-calendrier.
export function titrePeriode(vue: Vue, ancre: string, court = false): string {
  const { du, au } = periode(vue, ancre);
  if (vue === 'annee') return ancre.slice(0, 4);
  if (vue === 'mois') return capitale(F_MOIS_ANNEE.format(date(`${ancre.slice(0, 7)}-15`)));
  // Le mois de son jour central (une semaine à cheval : celui qui en a le plus).
  if (court) return capitale(F_MOIS_ANNEE.format(date(MILIEU[vue](du))));
  return intervalle(du, au);
}
