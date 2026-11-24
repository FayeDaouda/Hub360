import { addDays, addMonths } from '@hub/domain';

// Périodes de l'Agenda (18/11/2026) : les vues, la période affichée autour
// d'un jour, le pas des flèches et le titre de la barre. Pur, testé.

export type Vue = 'moisjour' | 'jour' | '3jours' | 'semaine' | 'mois' | 'annee' | 'planning';

export const VUES: { cle: Vue; libelle: string; raccourci: string }[] = [
  { cle: 'moisjour', libelle: 'Mois et jour', raccourci: 'O' },
  { cle: 'jour', libelle: 'Jour', raccourci: 'J' },
  { cle: '3jours', libelle: '3 jours', raccourci: 'X' },
  { cle: 'semaine', libelle: 'Semaine', raccourci: 'S' },
  { cle: 'mois', libelle: 'Mois', raccourci: 'M' },
  { cle: 'annee', libelle: 'Année', raccourci: 'A' },
  { cle: 'planning', libelle: 'Planning', raccourci: 'P' },
];
// Vues du téléphone seulement (18/11/2026) : sur ordinateur, la semaine.
export const VUES_TELEPHONE: Vue[] = ['moisjour', '3jours'];
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
    // Mois et jour : la grille du mois, le jour choisi dessous.
    case 'moisjour':
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
    case 'moisjour':
    case 'mois':
      return addMonths(ancre, sens);
    case 'annee':
      return addMonths(ancre, 12 * sens);
  }
}

export const LIBELLES_FLECHES: Record<Vue, [string, string]> = {
  moisjour: ['Mois précédent', 'Mois suivant'],
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

const MILIEU: Record<Exclude<Vue, 'mois' | 'moisjour' | 'annee'>, (du: string) => string> = {
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
  if (vue === 'mois' || vue === 'moisjour') return capitale(F_MOIS_ANNEE.format(date(`${ancre.slice(0, 7)}-15`)));
  // Le mois de son jour central (une semaine à cheval : celui qui en a le plus).
  if (court) return capitale(F_MOIS_ANNEE.format(date(MILIEU[vue](du))));
  return intervalle(du, au);
}

// Ce qu'annonce un lecteur d'écran au changement de période (U5,
// 23/11/2026) : la vue et la période entière — sur téléphone aussi, où le
// titre visible n'est que le mois.
export function periodeLue(vue: Vue, ancre: string): string {
  const libelle = VUES.find((v) => v.cle === vue)?.libelle ?? '';
  // Un jour (« Mois et jour » : le jour choisi, le titre n'est que le mois).
  if (vue === 'jour' || vue === 'moisjour') return `${libelle}, ${F_JOUR_LONG.format(date(ancre))}`;
  return `${libelle}, ${titrePeriode(vue, ancre)}`;
}

// Raccourcis clavier (U5, 23/11/2026), façon Google Agenda : la lettre d'une
// vue, T aujourd'hui, ← et → la période, C créer. Jamais avec Ctrl, ⌘ ou
// Alt (raccourcis du navigateur) ; la page les ignore pendant une saisie ou
// une fenêtre ouverte.
export type ActionClavier =
  { type: 'vue'; vue: Vue } | { type: 'aujourdhui' } | { type: 'creer' } | { type: 'decaler'; sens: 1 | -1 };

export function actionClavier(
  touche: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  vuesProposees: Vue[],
): ActionClavier | null {
  if (touche.ctrlKey || touche.metaKey || touche.altKey) return null;
  if (touche.key === 'ArrowLeft') return { type: 'decaler', sens: -1 };
  if (touche.key === 'ArrowRight') return { type: 'decaler', sens: 1 };
  const lettre = touche.key.length === 1 ? touche.key.toUpperCase() : '';
  if (lettre === 'T') return { type: 'aujourdhui' };
  if (lettre === 'C') return { type: 'creer' };
  const vue = VUES.find((v) => v.raccourci === lettre && vuesProposees.includes(v.cle));
  return vue ? { type: 'vue', vue: vue.cle } : null;
}

// Ce qui ne déclenche rien : une touche tapée dans un champ de saisie, un
// menu ouvert, un panneau (chat, menu du compte) ou quand une fenêtre
// modale est ouverte ; une flèche sur un groupe de choix ou une case (elle
// y a déjà un sens). Une vue cliquée ou une case cochée gardent le focus :
// les lettres y restent actives.
export function toucheIgnoree(cible: EventTarget | null, touche = ''): boolean {
  const el = cible instanceof Element ? cible : null;
  if (el?.closest('textarea, select, [contenteditable]:not([contenteditable="false"])')) return true;
  if (el?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return true;
  const champ = el?.closest('input');
  if (champ && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(champ.type)) return true;
  if (touche.startsWith('Arrow') && el?.closest('[role="radiogroup"], input')) return true;
  return !!document.querySelector('[aria-modal="true"]');
}
