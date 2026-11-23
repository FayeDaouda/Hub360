import { addDays, daysBetween } from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';

// Vue Mois façon Google Agenda (U4, 23/11/2026) : dans chaque semaine, les
// éléments sont rangés sur des lignes ; un congé ou une absence de plusieurs
// jours y forme une seule barre (coupée en fin de semaine) ; ce qui ne tient
// pas dans une case passe dans « + n autres ».

export type Segment = {
  e: ElementAgenda; // l'élément de son premier jour dans la semaine
  col: number; // 0 = lundi
  span: number; // nombre de jours couverts dans la semaine
  ligne: number;
  suiteAvant: boolean; // commencé la semaine d'avant
  suiteApres: boolean; // continue la semaine d'après
};
export type SemainePlacee = {
  segments: Segment[]; // ceux qui s'affichent
  plus: { col: number; jour: string; n: number }[]; // « + n autres » par jour
};

// Un élément d'une journée entière réparti jour par jour par le serveur
// (« <id>:<jour> » : congé, absence à décider, journée importée) : la clé
// qui relie ses jours (et l'agenda du collègue, s'il est superposé).
export function cleContinue(e: ElementAgenda): string | null {
  if (e.debut || !e.id.endsWith(`:${e.jour}`)) return null;
  return `${e.calque?.id ?? ''}|${e.id.slice(0, -(e.jour.length + 1))}`;
}

// Nombre de semaines à montrer pour un mois (5 ou 6, 4 en février qui
// commence un lundi), à partir du lundi de sa première semaine.
export function semainesDuMois(du: string, mois: string): number {
  const dernier = addDays(`${addMois(mois)}-01`, -1);
  return Math.ceil((daysBetween(du, dernier) + 1) / 7);
}
function addMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

// Ordre de placement (comme Google Agenda) : la journée entière d'abord, en
// haut des cases, par jour de début puis de la plus longue à la plus courte ;
// puis les rendez-vous par heure.
function ordre(a: Segment, b: Segment): number {
  return (
    (a.e.debut ? 1 : 0) - (b.e.debut ? 1 : 0) ||
    a.col - b.col ||
    b.span - a.span ||
    (a.e.debut ?? '').localeCompare(b.e.debut ?? '') ||
    a.e.titre.localeCompare(b.e.titre, 'fr')
  );
}

// Range les éléments d'une semaine (du lundi) sur `lignes` lignes au plus.
// Une case qui déborde montre ses lignes sauf la dernière, qui devient
// « + n autres » (n = tout ce qu'elle cache, barres comprises).
export function placerSemaine(elements: ElementAgenda[], lundi: string, lignes: number): SemainePlacee {
  const jours = Array.from({ length: 7 }, (_, i) => addDays(lundi, i));
  const dansSemaine = elements.filter((e) => e.jour >= jours[0] && e.jour <= jours[6]);
  // Les jours de chaque élément continu, sur toute la période chargée.
  const joursDe = new Map<string, Set<string>>();
  for (const e of elements) {
    const cle = cleContinue(e);
    if (cle) joursDe.set(cle, (joursDe.get(cle) ?? new Set()).add(e.jour));
  }

  // Les segments : un par élément, sauf les continus, réunis par suite de jours.
  const segments: Segment[] = [];
  const pris = new Set<string>();
  for (const e of [...dansSemaine].sort((a, b) => a.jour.localeCompare(b.jour))) {
    const cle = cleContinue(e);
    const col = jours.indexOf(e.jour);
    if (!cle) {
      segments.push({ e, col, span: 1, ligne: 0, suiteAvant: false, suiteApres: false });
      continue;
    }
    if (pris.has(`${cle}|${e.jour}`)) continue;
    const ses = joursDe.get(cle)!;
    let span = 1;
    while (col + span < 7 && ses.has(jours[col + span])) span++;
    for (let k = 0; k < span; k++) pris.add(`${cle}|${jours[col + k]}`);
    segments.push({
      e,
      col,
      span,
      ligne: 0,
      suiteAvant: col === 0 && ses.has(addDays(jours[0], -1)),
      suiteApres: col + span === 7 && ses.has(addDays(jours[6], 1)),
    });
  }

  // Chaque segment sur la première ligne libre de toutes ses cases.
  segments.sort(ordre);
  const occupees: Set<number>[] = Array.from({ length: 7 }, () => new Set());
  for (const s of segments) {
    let l = 0;
    while (Array.from({ length: s.span }, (_, k) => occupees[s.col + k].has(l)).some(Boolean)) l++;
    s.ligne = l;
    for (let k = 0; k < s.span; k++) occupees[s.col + k].add(l);
  }

  // Débordement : une case qui a plus de lignes que la place disponible.
  const max = Math.max(1, lignes);
  const deborde = occupees.map((o) => [...o].some((l) => l >= max));
  const visible = (s: Segment) =>
    s.ligne < max - 1 ||
    (s.ligne === max - 1 && !Array.from({ length: s.span }, (_, k) => deborde[s.col + k]).some(Boolean));
  // « + n » dans toute case dont un élément est caché (une barre cachée parce
  // qu'une autre de ses cases déborde libère sa dernière ligne ici aussi).
  const plus = jours.flatMap((jour, col) => {
    const n = segments.filter((s) => s.col <= col && col < s.col + s.span && !visible(s)).length;
    return n ? [{ col, jour, n }] : [];
  });
  return { segments: segments.filter(visible), plus };
}
