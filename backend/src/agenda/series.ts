import { expandOccurrences, parseRRule } from '@hub/domain';

// Une exception peut vider un champ de la série pour sa seule date : « '' »
// (vidé) se distingue de null (celui de la série).
export const surcharge = (e: string | null | undefined, serie: string | null) =>
  e === null || e === undefined ? serie : e || null;

// Déroulement d'un rendez-vous dans une période (16/11/2026) : un rendez-vous
// unique, ou chaque occurrence d'une série (règle de @hub/domain), avec ses
// exceptions — une occurrence annulée disparaît, une occurrence modifiée prend
// ses propres heures, titre, lieu, note ou visio. Pur, testé ; partagé par la
// lecture de l'agenda, les disponibilités et les rappels.

type Champs = {
  titre: string;
  lieu: string | null;
  description: string | null;
  lienVisio: string | null;
};

export type ExceptionSerie = {
  occurrence: Date;
  annulee: boolean;
  titre: string | null;
  debut: Date | null;
  fin: Date | null;
  lieu: string | null;
  description: string | null;
  lienVisio: string | null;
};

export type Serie = Champs & {
  debut: Date;
  fin: Date;
  regle: string | null;
  exceptions?: ExceptionSerie[];
};

export type Occurrence = Champs & {
  // Début d'origine de l'occurrence (ce que dit la règle) ; null : unique.
  occurrence: Date | null;
  debut: Date;
  fin: Date;
  modifiee: boolean;
};

// Occurrences qui touchent [du, au[ (début avant `au`, fin après `du`).
export function occurrencesDans(s: Serie, du: Date, au: Date): Occurrence[] {
  const touche = (d: Date, f: Date) => d < au && f > du;
  if (!s.regle) {
    return touche(s.debut, s.fin)
      ? [
          {
            occurrence: null,
            debut: s.debut,
            fin: s.fin,
            titre: s.titre,
            lieu: s.lieu,
            description: s.description,
            lienVisio: s.lienVisio,
            modifiee: false,
          },
        ]
      : [];
  }
  const duree = +s.fin - +s.debut;
  const parOccurrence = new Map((s.exceptions ?? []).map((e) => [+e.occurrence, e]));
  const vues = new Set<number>();
  const resultat: Occurrence[] = [];
  const ajouter = (origine: Date, e?: ExceptionSerie) => {
    if (vues.has(+origine)) return;
    vues.add(+origine);
    if (e?.annulee) return;
    const debut = e?.debut ?? origine;
    const fin = e?.fin ?? new Date(+origine + duree);
    if (!touche(debut, fin)) return;
    resultat.push({
      occurrence: origine,
      debut,
      fin,
      titre: e?.titre || s.titre,
      lieu: surcharge(e?.lieu, s.lieu),
      description: surcharge(e?.description, s.description),
      lienVisio: surcharge(e?.lienVisio, s.lienVisio),
      modifiee: !!e,
    });
  };
  // Une occurrence commencée avant `du` peut encore le toucher.
  const debuts = expandOccurrences(parseRRule(s.regle), s.debut.toISOString(), {
    from: new Date(+du - duree).toISOString(),
    to: au.toISOString(),
  });
  for (const d of debuts) ajouter(new Date(d), parOccurrence.get(Date.parse(d)));
  // Une occurrence déplacée dans la période depuis une autre date (seulement
  // une date que la règle donne encore).
  for (const e of s.exceptions ?? []) {
    if (e.debut && !e.annulee && !vues.has(+e.occurrence) && e.debut < au && estOccurrence(s, e.occurrence)) {
      ajouter(e.occurrence, e);
    }
  }
  return resultat.sort((a, b) => +a.debut - +b.debut);
}

// L'occurrence d'origine existe-t-elle dans la série ? (Avant d'écrire une
// exception : jamais pour une date que la règle ne donne pas.)
export function estOccurrence(s: Pick<Serie, 'debut' | 'regle'>, occurrence: Date): boolean {
  if (!s.regle) return false;
  return expandOccurrences(parseRRule(s.regle), s.debut.toISOString(), {
    from: occurrence.toISOString(),
    to: new Date(+occurrence + 1).toISOString(),
  }).includes(occurrence.toISOString());
}

// Fin de la dernière occurrence (16/11/2026), gardée en base pour ne relire
// que les rendez-vous qui touchent encore une période : la fin d'un
// rendez-vous unique ; null pour une série sans fin.
export function finDeSerie(debut: Date, fin: Date, regle: string | null): Date | null {
  if (!regle) return fin;
  const r = parseRRule(regle);
  if (!r.until && !r.count) return null;
  // Avec un nombre de fois : jusqu'à la dernière, aussi loin soit-elle.
  const limite = r.until ? new Date(`${r.until}T23:59:59.999Z`) : new Date(Date.UTC(9999, 0, 1));
  const debuts = expandOccurrences(
    r,
    debut.toISOString(),
    { from: debut.toISOString(), to: new Date(+limite + 1).toISOString() },
    5000,
  );
  const dernier = debuts[debuts.length - 1];
  return dernier ? new Date(Date.parse(dernier) + (+fin - +debut)) : fin;
}

// Fin de série en tenant compte des occurrences déplacées (16/11/2026) : une
// date déplacée après la dernière occurrence prolonge la série, sinon elle
// échapperait aux lectures filtrées sur `finSerie`.
export function finSerieAvecExceptions(
  debut: Date,
  fin: Date,
  regle: string | null,
  exceptions: Pick<ExceptionSerie, 'annulee' | 'debut' | 'fin' | 'occurrence'>[],
): Date | null {
  const base = finDeSerie(debut, fin, regle);
  if (!base || !regle) return base;
  const duree = +fin - +debut;
  let max = +base;
  for (const e of exceptions) {
    if (e.annulee || !e.debut) continue;
    max = Math.max(max, +(e.fin ?? new Date(+e.debut + duree)));
  }
  return new Date(max);
}
