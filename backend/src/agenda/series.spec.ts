import { estOccurrence, finDeSerie, occurrencesDans, type Serie } from './series';

// Déroulement d'un rendez-vous dans une période (16/11/2026).
const d = (iso: string) => new Date(iso);
const SERIE: Serie = {
  titre: 'Point hebdo',
  lieu: 'Salle A',
  description: null,
  lienVisio: null,
  debut: d('2026-11-16T09:00:00.000Z'),
  fin: d('2026-11-16T10:00:00.000Z'),
  regle: 'FREQ=WEEKLY;BYDAY=MO',
};
const semaine = (lundi: string) =>
  [d(`${lundi}T00:00:00.000Z`), d(new Date(Date.parse(lundi) + 7 * 86_400_000).toISOString())] as const;

describe('occurrencesDans', () => {
  it('rendez-vous unique : lui seul, s’il touche la période', () => {
    const unique = { ...SERIE, regle: null };
    expect(occurrencesDans(unique, ...semaine('2026-11-16'))).toEqual([
      expect.objectContaining({ occurrence: null, debut: SERIE.debut, modifiee: false }),
    ]);
    expect(occurrencesDans(unique, ...semaine('2026-11-23'))).toEqual([]);
  });

  it('série hebdomadaire : l’occurrence de chaque semaine, à la bonne heure', () => {
    expect(occurrencesDans(SERIE, ...semaine('2026-11-30'))).toEqual([
      expect.objectContaining({
        occurrence: d('2026-11-30T09:00:00.000Z'),
        debut: d('2026-11-30T09:00:00.000Z'),
        fin: d('2026-11-30T10:00:00.000Z'),
      }),
    ]);
  });

  it('une occurrence annulée disparaît ; une modifiée prend ses heures et son lieu', () => {
    const s: Serie = {
      ...SERIE,
      exceptions: [
        {
          occurrence: d('2026-11-23T09:00:00.000Z'),
          annulee: true,
          titre: null,
          debut: null,
          fin: null,
          lieu: null,
          description: null,
          lienVisio: null,
        },
        {
          occurrence: d('2026-11-30T09:00:00.000Z'),
          annulee: false,
          titre: null,
          debut: d('2026-11-30T14:00:00.000Z'),
          fin: d('2026-11-30T15:30:00.000Z'),
          lieu: 'Chantier',
          description: null,
          lienVisio: null,
        },
      ],
    };
    expect(occurrencesDans(s, ...semaine('2026-11-23'))).toEqual([]);
    expect(occurrencesDans(s, ...semaine('2026-11-30'))).toEqual([
      expect.objectContaining({
        debut: d('2026-11-30T14:00:00.000Z'),
        lieu: 'Chantier',
        titre: 'Point hebdo',
        modifiee: true,
      }),
    ]);
  });

  it('une occurrence déplacée dans une autre semaine apparaît là où elle est', () => {
    const s: Serie = {
      ...SERIE,
      exceptions: [
        {
          occurrence: d('2026-11-23T09:00:00.000Z'),
          annulee: false,
          titre: null,
          debut: d('2026-12-01T09:00:00.000Z'),
          fin: d('2026-12-01T10:00:00.000Z'),
          lieu: null,
          description: null,
          lienVisio: null,
        },
      ],
    };
    expect(occurrencesDans(s, ...semaine('2026-11-23'))).toEqual([]);
    const semaineDu30 = occurrencesDans(s, ...semaine('2026-11-30'));
    expect(semaineDu30.map((o) => o.debut.toISOString())).toEqual([
      '2026-11-30T09:00:00.000Z',
      '2026-12-01T09:00:00.000Z',
    ]);
  });

  it('une occurrence commencée avant la période mais qui la touche est rendue', () => {
    const nuit: Serie = {
      ...SERIE,
      debut: d('2026-11-15T23:00:00.000Z'),
      fin: d('2026-11-16T01:00:00.000Z'),
      regle: 'FREQ=WEEKLY;BYDAY=SU',
    };
    expect(occurrencesDans(nuit, ...semaine('2026-11-16')).map((o) => o.debut.toISOString())).toEqual([
      '2026-11-15T23:00:00.000Z',
      '2026-11-22T23:00:00.000Z',
    ]);
  });
});

describe('estOccurrence', () => {
  it('seulement une date que la règle donne', () => {
    expect(estOccurrence(SERIE, d('2026-11-23T09:00:00.000Z'))).toBe(true);
    expect(estOccurrence(SERIE, d('2026-11-24T09:00:00.000Z'))).toBe(false);
    expect(estOccurrence(SERIE, d('2026-11-23T09:30:00.000Z'))).toBe(false);
    expect(estOccurrence({ ...SERIE, regle: null }, SERIE.debut)).toBe(false);
  });
});

// Compléments (16/11/2026) : exceptions déplacées hors de la période, dates
// que la règle ne donne plus, champs hérités de la série.
describe('occurrencesDans · exceptions', () => {
  const exception = (x: Partial<NonNullable<Serie['exceptions']>[number]>) => ({
    occurrence: d('2026-11-30T09:00:00.000Z'),
    annulee: false,
    titre: null,
    debut: null,
    fin: null,
    lieu: null,
    description: null,
    lienVisio: null,
    ...x,
  });

  it('une occurrence déplacée hors de la période disparaît de sa semaine d’origine', () => {
    const s: Serie = {
      ...SERIE,
      exceptions: [exception({ debut: d('2026-12-15T09:00:00.000Z'), fin: d('2026-12-15T10:00:00.000Z') })],
    };
    expect(occurrencesDans(s, ...semaine('2026-11-30'))).toEqual([]);
    // Et réapparaît dans la semaine où elle a été posée, à côté du lundi normal.
    expect(
      occurrencesDans(s, ...semaine('2026-12-14')).map((o) => [o.occurrence!.toISOString(), o.debut.toISOString()]),
    ).toEqual([
      ['2026-12-14T09:00:00.000Z', '2026-12-14T09:00:00.000Z'],
      ['2026-11-30T09:00:00.000Z', '2026-12-15T09:00:00.000Z'],
    ]);
    // Jamais en double sur une période qui couvre les deux dates.
    const mois = occurrencesDans(s, d('2026-11-30T00:00:00.000Z'), d('2026-12-31T00:00:00.000Z'));
    expect(mois.filter((o) => +o.occurrence! === +d('2026-11-30T09:00:00.000Z'))).toHaveLength(1);
  });

  it('une exception sur une date que la règle ne donne plus (après UNTIL) ne fait rien réapparaître', () => {
    const s: Serie = {
      ...SERIE,
      regle: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261123T235959Z',
      exceptions: [
        exception({ titre: 'Point hebdo (renommé)' }),
        exception({ occurrence: d('2026-12-07T09:00:00.000Z'), annulee: true }),
      ],
    };
    expect(occurrencesDans(s, ...semaine('2026-11-30'))).toEqual([]);
    expect(occurrencesDans(s, ...semaine('2026-12-07'))).toEqual([]);
    // La série elle-même s'arrête bien au 23.
    expect(occurrencesDans(s, ...semaine('2026-11-23')).map((o) => o.debut.toISOString())).toEqual([
      '2026-11-23T09:00:00.000Z',
    ]);
  });

  it('une occurrence modifiée garde le titre, le lieu, la note et la visio de la série quand les siens sont vides', () => {
    const s: Serie = {
      ...SERIE,
      description: 'Ordre du jour',
      lienVisio: 'https://meet.google.com/abc-defg-hij',
      exceptions: [exception({})],
    };
    expect(occurrencesDans(s, ...semaine('2026-11-30'))).toEqual([
      {
        occurrence: d('2026-11-30T09:00:00.000Z'),
        debut: d('2026-11-30T09:00:00.000Z'),
        fin: d('2026-11-30T10:00:00.000Z'),
        titre: 'Point hebdo',
        lieu: 'Salle A',
        description: 'Ordre du jour',
        lienVisio: 'https://meet.google.com/abc-defg-hij',
        modifiee: true,
      },
    ]);
  });

  it('une occurrence annulée puis déplacée ailleurs ne réapparaît nulle part', () => {
    const s: Serie = {
      ...SERIE,
      exceptions: [
        exception({ annulee: true, debut: d('2026-12-15T09:00:00.000Z'), fin: d('2026-12-15T10:00:00.000Z') }),
      ],
    };
    expect(occurrencesDans(s, ...semaine('2026-11-30'))).toEqual([]);
    expect(occurrencesDans(s, ...semaine('2026-12-14')).map((o) => o.debut.toISOString())).toEqual([
      '2026-12-14T09:00:00.000Z',
    ]);
  });
});

describe('finDeSerie', () => {
  it('unique : sa fin ; nombre de fois ou date de fin : la dernière occurrence ; sans fin : null', () => {
    const debut = d('2026-11-16T09:00:00.000Z');
    const fin = d('2026-11-16T10:00:00.000Z');
    expect(finDeSerie(debut, fin, null)).toEqual(fin);
    expect(finDeSerie(debut, fin, 'FREQ=WEEKLY;COUNT=3')).toEqual(d('2026-11-30T10:00:00.000Z'));
    expect(finDeSerie(debut, fin, 'FREQ=DAILY;UNTIL=20261118T235959Z')).toEqual(d('2026-11-18T10:00:00.000Z'));
    expect(finDeSerie(debut, fin, 'FREQ=WEEKLY')).toBeNull();
    // Chaque année, 30 fois : bien au-delà de vingt ans.
    expect(finDeSerie(debut, fin, 'FREQ=YEARLY;COUNT=30')).toEqual(d('2055-11-16T10:00:00.000Z'));
  });

  it('un champ vidé pour une seule date (chaîne vide) ne reprend pas celui de la série', () => {
    const s: Serie = {
      ...SERIE,
      exceptions: [
        {
          occurrence: d('2026-11-23T09:00:00.000Z'),
          annulee: false,
          titre: null,
          debut: null,
          fin: null,
          lieu: '',
          description: null,
          lienVisio: null,
        },
      ],
    };
    expect(occurrencesDans(s, ...semaine('2026-11-23'))[0].lieu).toBeNull();
    expect(occurrencesDans(s, ...semaine('2026-11-30'))[0].lieu).toBe('Salle A');
  });
});
