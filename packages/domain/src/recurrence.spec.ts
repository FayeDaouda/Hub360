import { describe, expect, it } from 'vitest';
import {
  alignRecurrence,
  describeRecurrence,
  expandOccurrences,
  formatRRule,
  isRecurrenceStart,
  nthOf,
  parseRRule,
  recurrencePresets,
  shiftRecurrence,
  type Recurrence,
} from './recurrence';

// Rendez-vous récurrents (16/11/2026). Le lundi 16 novembre 2026, 09:00.
const DEBUT = '2026-11-16T09:00:00.000Z';
const an = { from: '2026-01-01T00:00:00.000Z', to: '2028-01-01T00:00:00.000Z' };
const jours = (isos: string[]) => isos.map((x) => x.slice(0, 10));

describe('parseRRule / formatRRule', () => {
  it('aller-retour du sous-ensemble pris en charge', () => {
    for (const regle of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
      'FREQ=MONTHLY;BYDAY=2TH',
      'FREQ=MONTHLY;BYDAY=-1FR;COUNT=12',
      'FREQ=YEARLY;UNTIL=20301231T235959Z',
    ]) {
      expect(formatRRule(parseRRule(regle))).toBe(regle);
    }
    expect(parseRRule('RRULE:FREQ=WEEKLY;BYDAY=WE,MO')).toEqual({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE'] });
  });

  it('refuse ce qu’il ne sait pas dérouler, plutôt que de l’ignorer', () => {
    for (const regle of [
      'FREQ=HOURLY',
      'FREQ=WEEKLY;BYSETPOS=1',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=MONTHLY;BYDAY=5MO',
      'FREQ=DAILY;INTERVAL=0',
      'FREQ=DAILY;INTERVAL=100',
      'FREQ=DAILY;COUNT=731',
      'FREQ=DAILY;COUNT=3;UNTIL=20270101',
      'FREQ=DAILY;FREQ=WEEKLY',
      'INTERVAL=2',
    ]) {
      expect(() => parseRRule(regle)).toThrow();
    }
  });
});

describe('expandOccurrences', () => {
  const deroule = (r: Recurrence, debut = DEBUT, fenetre = an) => expandOccurrences(r, debut, fenetre);

  it('chaque jour, à l’heure du premier rendez-vous ; COUNT compté depuis le début', () => {
    const o = deroule({ freq: 'DAILY', interval: 1, count: 3 });
    expect(o).toEqual(['2026-11-16T09:00:00.000Z', '2026-11-17T09:00:00.000Z', '2026-11-18T09:00:00.000Z']);
    // Une fenêtre qui commence après les deux premières n'en rend qu'une.
    expect(
      deroule({ freq: 'DAILY', interval: 1, count: 3 }, DEBUT, { from: '2026-11-18T00:00:00.000Z', to: an.to }),
    ).toEqual(['2026-11-18T09:00:00.000Z']);
  });

  it('jours ouvrés ; toutes les 2 semaines le lundi et le mercredi', () => {
    expect(jours(deroule({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'], count: 7 }))).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-23',
      '2026-11-24',
    ]);
    expect(jours(deroule({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'], count: 4 }))).toEqual([
      '2026-11-16',
      '2026-11-18',
      '2026-11-30',
      '2026-12-02',
    ]);
  });

  it('hebdomadaire commencé un mercredi avec lundi et mercredi : pas de lundi passé', () => {
    expect(
      jours(deroule({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE'], count: 3 }, '2026-11-18T09:00:00.000Z')),
    ).toEqual(['2026-11-18', '2026-11-23', '2026-11-25']);
  });

  it('chaque mois le 31 : les mois sans 31 sont sautés', () => {
    expect(jours(deroule({ freq: 'MONTHLY', interval: 1, count: 4 }, '2027-01-31T09:00:00.000Z'))).toEqual([
      '2027-01-31',
      '2027-03-31',
      '2027-05-31',
      '2027-07-31',
    ]);
  });

  it('le 2e jeudi ; le dernier vendredi', () => {
    expect(
      jours(
        deroule({ freq: 'MONTHLY', interval: 1, nthDay: { nth: 2, day: 'TH' }, count: 3 }, '2026-11-12T09:00:00.000Z'),
      ),
    ).toEqual(['2026-11-12', '2026-12-10', '2027-01-14']);
    expect(
      jours(
        deroule({ freq: 'MONTHLY', interval: 1, nthDay: { nth: -1, day: 'FR' }, count: 3 }, '2026-11-27T09:00:00.000Z'),
      ),
    ).toEqual(['2026-11-27', '2026-12-25', '2027-01-29']);
  });

  it('chaque année le 29 février : seulement les années bissextiles', () => {
    expect(
      jours(
        deroule({ freq: 'YEARLY', interval: 1, count: 2 }, '2028-02-29T09:00:00.000Z', {
          from: an.from,
          to: '2040-01-01T00:00:00.000Z',
        }),
      ),
    ).toEqual(['2028-02-29', '2032-02-29']);
  });

  it('jusqu’à une date (incluse) ; jamais au-delà de la fenêtre ni du plafond', () => {
    expect(jours(deroule({ freq: 'DAILY', interval: 1, until: '2026-11-18' }))).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(expandOccurrences({ freq: 'DAILY', interval: 1 }, DEBUT, an, 10)).toHaveLength(10);
    expect(
      deroule({ freq: 'DAILY', interval: 1 }, DEBUT, {
        from: '2026-11-20T00:00:00.000Z',
        to: '2026-11-22T00:00:00.000Z',
      }),
    ).toEqual(['2026-11-20T09:00:00.000Z', '2026-11-21T09:00:00.000Z']);
  });

  it('sans fin, sur une fenêtre lointaine, s’arrête sans boucler', () => {
    const o = deroule({ freq: 'WEEKLY', interval: 1 }, DEBUT, {
      from: '2036-01-01T00:00:00.000Z',
      to: '2036-01-15T00:00:00.000Z',
    });
    expect(jours(o)).toEqual(['2036-01-07', '2036-01-14']);
  });
});

describe('describeRecurrence / recurrencePresets', () => {
  it('décrit en français', () => {
    expect(describeRecurrence({ freq: 'DAILY', interval: 1 }, DEBUT)).toBe('Chaque jour');
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }, DEBUT)).toBe(
      'Chaque jour ouvré (du lundi au vendredi)',
    );
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'], until: '2027-01-01' }, DEBUT)).toBe(
      'Toutes les 2 semaines le lundi et mercredi, jusqu’au 1 janvier 2027',
    );
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 1, nthDay: { nth: -1, day: 'FR' }, count: 6 }, DEBUT)).toBe(
      'Chaque mois le dernier vendredi, 6 fois',
    );
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 1 }, DEBUT)).toBe('Chaque mois le 16');
    expect(describeRecurrence({ freq: 'YEARLY', interval: 1 }, DEBUT)).toBe('Chaque année le 16 novembre');
  });

  it('les choix proposés suivent la date du premier rendez-vous', () => {
    const cles = (iso: string) => recurrencePresets(iso).map((p) => p.key);
    expect(cles('2026-11-16T09:00:00.000Z')).toEqual([
      'daily',
      'weekdays',
      'weekly',
      'biweekly',
      'monthly-date',
      'monthly-nth',
      'yearly',
    ]);
    // Vendredi 27 novembre 2026 : 4e et dernier vendredi.
    expect(cles('2026-11-27T09:00:00.000Z')).toContain('monthly-last');
    // Le 30 : 5e lundi, pas de « 5e », mais le dernier.
    expect(cles('2026-11-30T09:00:00.000Z')).not.toContain('monthly-nth');
    expect(recurrencePresets(DEBUT).find((p) => p.key === 'monthly-nth')?.label).toBe('Chaque mois le 3e lundi');
    expect(nthOf('2026-11-30')).toEqual({ nth: 5, day: 'MO', last: true });
  });
});

// Compléments (16/11/2026) : intervalles mensuels et annuels, bornes de la
// fenêtre et de la fin, plafond, WKST, descriptions avec intervalle.
describe('expandOccurrences · bornes et intervalles', () => {
  const deroule = (r: Recurrence, debut = DEBUT, fenetre = an) => expandOccurrences(r, debut, fenetre);

  it('tous les 2 mois à la même date', () => {
    expect(jours(deroule({ freq: 'MONTHLY', interval: 2, count: 3 }))).toEqual([
      '2026-11-16',
      '2027-01-16',
      '2027-03-16',
    ]);
  });

  it('tous les 3 mois le 2e jeudi : le rang est recalculé dans chaque mois', () => {
    expect(
      jours(
        deroule({ freq: 'MONTHLY', interval: 3, nthDay: { nth: 2, day: 'TH' }, count: 3 }, '2026-11-12T09:00:00.000Z'),
      ),
    ).toEqual(['2026-11-12', '2027-02-11', '2027-05-13']);
  });

  it('tous les 2 ans à la même date', () => {
    expect(
      jours(
        deroule({ freq: 'YEARLY', interval: 2, count: 3 }, DEBUT, { from: an.from, to: '2035-01-01T00:00:00.000Z' }),
      ),
    ).toEqual(['2026-11-16', '2028-11-16', '2030-11-16']);
  });

  it('le dernier lundi d’un mois de cinq lundis est le 5e, pas le 4e', () => {
    // Novembre 2026 compte cinq lundis (2, 9, 16, 23, 30).
    expect(
      jours(
        deroule({ freq: 'MONTHLY', interval: 1, nthDay: { nth: -1, day: 'MO' }, count: 3 }, '2026-11-30T09:00:00.000Z'),
      ),
    ).toEqual(['2026-11-30', '2026-12-28', '2027-01-25']);
    expect(
      jours(
        deroule({ freq: 'MONTHLY', interval: 1, nthDay: { nth: 4, day: 'MO' }, count: 2 }, '2026-11-23T09:00:00.000Z'),
      ),
    ).toEqual(['2026-11-23', '2026-12-28']);
  });

  it('une fin le jour même du premier rendez-vous : une seule occurrence', () => {
    expect(deroule({ freq: 'DAILY', interval: 1, until: '2026-11-16' })).toEqual([DEBUT]);
    // Même tard dans la journée : UNTIL couvre le jour entier.
    expect(deroule({ freq: 'WEEKLY', interval: 1, until: '2026-11-16' }, '2026-11-16T23:30:00.000Z')).toEqual([
      '2026-11-16T23:30:00.000Z',
    ]);
  });

  it('la fenêtre est [du, au[ : une occurrence qui commence pile à la fin est exclue, pile au début incluse', () => {
    expect(
      deroule({ freq: 'DAILY', interval: 1 }, DEBUT, {
        from: '2026-11-17T09:00:00.000Z',
        to: '2026-11-19T09:00:00.000Z',
      }),
    ).toEqual(['2026-11-17T09:00:00.000Z', '2026-11-18T09:00:00.000Z']);
  });

  it('une fenêtre entièrement avant le premier rendez-vous, ou après la fin : rien', () => {
    expect(
      deroule({ freq: 'DAILY', interval: 1 }, DEBUT, {
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-16T09:00:00.000Z',
      }),
    ).toEqual([]);
    expect(
      deroule({ freq: 'DAILY', interval: 1, count: 3 }, DEBUT, {
        from: '2026-12-01T00:00:00.000Z',
        to: '2027-01-01T00:00:00.000Z',
      }),
    ).toEqual([]);
  });

  it('le plafond `max` ne compte que les occurrences de la fenêtre', () => {
    expect(
      expandOccurrences(
        { freq: 'DAILY', interval: 1, count: 100 },
        DEBUT,
        { from: '2026-11-20T00:00:00.000Z', to: an.to },
        2,
      ),
    ).toEqual(['2026-11-20T09:00:00.000Z', '2026-11-21T09:00:00.000Z']);
    expect(expandOccurrences({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE'] }, DEBUT, an, 3)).toHaveLength(3);
  });
});

describe('parseRRule · WKST', () => {
  it('WKST=MO est accepté, et disparaît de la forme normale', () => {
    expect(parseRRule('FREQ=WEEKLY;WKST=MO;BYDAY=MO,TH')).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      byDay: ['MO', 'TH'],
    });
    expect(formatRRule(parseRRule('FREQ=WEEKLY;INTERVAL=2;WKST=MO;BYDAY=MO'))).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO');
  });

  // BUG (à vérifier, mineur) : la valeur de WKST n'est jamais lue. « WKST=XX »
  // passe, alors que l'en-tête promet qu'une partie hors du sous-ensemble est
  // refusée, « jamais ignorée en silence ». Et « WKST=SU » avec INTERVAL>1 et
  // plusieurs jours change les dates selon la RFC 5545 (exemple de la RFC :
  // FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU) ; ici elles sont déroulées
  // comme avec WKST=MO.
  it('refuse un WKST invalide ou autre que MO, plutôt que de l’ignorer', () => {
    expect(() => parseRRule('FREQ=WEEKLY;WKST=XX;BYDAY=MO')).toThrow();
    expect(() => parseRRule('FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=TU,SU')).toThrow();
  });
});

describe('premier rendez-vous et règle alignés (corrigé le 16/11/2026)', () => {
  // La RFC 5545 compte toujours le premier rendez-vous (DTSTART) comme
  // première occurrence. Le HUB n'enregistre que des règles qui le donnent :
  // il détecte un début hors de la règle et la recale, comme Google Agenda.
  it('détecte un premier rendez-vous hors de la règle', () => {
    expect(isRecurrenceStart({ freq: 'WEEKLY', interval: 1, byDay: ['MO'] }, '2026-12-01T09:00:00.000Z')).toBe(false);
    expect(isRecurrenceStart({ freq: 'WEEKLY', interval: 1, byDay: ['TU'] }, '2026-12-01T09:00:00.000Z')).toBe(true);
    expect(
      isRecurrenceStart({ freq: 'MONTHLY', interval: 1, nthDay: { nth: 2, day: 'TH' } }, '2026-12-01T09:00:00.000Z'),
    ).toBe(false);
    expect(isRecurrenceStart({ freq: 'DAILY', interval: 1, count: 3 }, '2026-12-01T09:00:00.000Z')).toBe(true);
  });

  it('recale : jour unique remplacé, jours multiples complétés, rang du mois recalculé', () => {
    const mardi = '2026-12-01T09:00:00.000Z';
    expect(alignRecurrence({ freq: 'WEEKLY', interval: 1, byDay: ['MO'] }, mardi).byDay).toEqual(['TU']);
    expect(alignRecurrence({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE'] }, mardi).byDay).toEqual([
      'MO',
      'TU',
      'WE',
    ]);
    expect(alignRecurrence({ freq: 'MONTHLY', interval: 1, nthDay: { nth: 2, day: 'TH' } }, mardi).nthDay).toEqual({
      nth: 1,
      day: 'TU',
    });
    // Le dernier vendredi déplacé au dernier lundi du mois.
    expect(
      alignRecurrence({ freq: 'MONTHLY', interval: 1, nthDay: { nth: -1, day: 'FR' } }, '2026-11-30T09:00:00.000Z')
        .nthDay,
    ).toEqual({
      nth: -1,
      day: 'MO',
    });
    // Recalée, la règle donne bien le premier rendez-vous.
    const r = alignRecurrence({ freq: 'WEEKLY', interval: 1, byDay: ['MO'], count: 3 }, mardi);
    expect(jours(expandOccurrences(r, mardi, an))).toEqual(['2026-12-01', '2026-12-08', '2026-12-15']);
  });
});

describe('describeRecurrence · intervalles', () => {
  it('tous les N jours, mois, ans ; jours ouvrés une semaine sur deux', () => {
    expect(describeRecurrence({ freq: 'DAILY', interval: 3 }, DEBUT)).toBe('Tous les 3 jours');
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 2 }, DEBUT)).toBe('Tous les 2 mois le 16');
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 2, nthDay: { nth: 3, day: 'MO' } }, DEBUT)).toBe(
      'Tous les 2 mois le 3e lundi',
    );
    expect(describeRecurrence({ freq: 'YEARLY', interval: 2, count: 4 }, DEBUT)).toBe(
      'Tous les 2 ans le 16 novembre, 4 fois',
    );
    // Les jours ouvrés n'ont leur libellé que chaque semaine.
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }, DEBUT)).toBe(
      'Toutes les 2 semaines le lundi, mardi, mercredi, jeudi et vendredi',
    );
    // Sans jours : celui du premier rendez-vous.
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 1 }, DEBUT)).toBe('Chaque semaine le lundi');
  });
});

describe('shiftRecurrence', () => {
  it('décale tous les jours d’une série ; aller-retour sans jour ajouté', () => {
    const r: Recurrence = { freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE'] };
    expect(shiftRecurrence(r, 1).byDay).toEqual(['TU', 'TH']);
    expect(shiftRecurrence(shiftRecurrence(r, 1), -1).byDay).toEqual(['MO', 'WE']);
    expect(shiftRecurrence({ freq: 'WEEKLY', interval: 1, byDay: ['SU'] }, 1).byDay).toEqual(['MO']);
    expect(shiftRecurrence({ freq: 'MONTHLY', interval: 1, nthDay: { nth: 2, day: 'TU' } }, 2).nthDay).toEqual({
      nth: 2,
      day: 'TH',
    });
    expect(shiftRecurrence({ freq: 'DAILY', interval: 1 }, 3)).toEqual({ freq: 'DAILY', interval: 1 });
    expect(shiftRecurrence(r, 7)).toBe(r);
  });
});
