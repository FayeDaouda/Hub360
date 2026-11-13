import { describe, expect, it } from 'vitest';
import {
  addDays,
  dakarInstant,
  formatWeekdayShort,
  hhmmOfMinutes,
  minutesOfDay,
  addMonths,
  daysBetween,
  daysSince,
  formatDate,
  formatDateTime,
  formatDayLongMonth,
  formatDayMonth,
  formatDayShortMonth,
  formatWeekdayDayMonth,
  formatLongDate,
  formatLongDateTime,
  formatMonthYear,
  formatNumericMonth,
  formatTime,
  toIsoDay,
  todayIso,
  yearOf,
} from './dates';

// Les anciennes copies (32 « jjmmaaaa », 20 « jjmm »…) : chaque fonction doit
// rendre exactement ce qu'elles rendaient sur les valeurs réelles du HUB.
const ancienJjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const ancienJjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ancienLibelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

describe('formatDate', () => {
  it.each(['2026-10-24', '2026-01-05', '2026-10-24T08:30:00.000Z', '2026-12-31T23:59:59.999Z'])(
    'rend comme les anciennes copies : %s',
    (iso) => {
      expect(formatDate(iso)).toBe(ancienJjmmaaaa(iso));
    },
  );

  it('valeur absente : tiret par défaut, ou le texte demandé', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate(null, 'date inconnue')).toBe('date inconnue');
  });
});

describe('formatDayMonth', () => {
  it.each(['2026-10-24', '2026-03-09T10:00:00Z'])('rend comme les anciennes copies : %s', (iso) => {
    expect(formatDayMonth(iso)).toBe(ancienJjmm(iso));
  });

  it('valeur absente : tiret', () => {
    expect(formatDayMonth(null)).toBe('—');
  });
});

describe('formatMonthYear', () => {
  it.each(['2026-10', '2026-01', '2026-08'])('mois %s, comme les anciennes copies', (m) => {
    expect(formatMonthYear(m)).toBe(ancienLibelleMois(m));
  });

  it('accepte aussi un jour ISO', () => {
    expect(formatMonthYear('2026-10-24')).toBe('octobre 2026');
  });
});

describe('formatNumericMonth', () => {
  it('« 10/2026 », comme les anciennes copies', () => {
    expect(formatNumericMonth('2026-10')).toBe('2026-10'.split('-').reverse().join('/'));
  });
});

describe('jours', () => {
  it('jour ISO à Dakar (UTC+0, sans heure d’été)', () => {
    expect(toIsoDay(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-24');
    expect(todayIso(new Date('2026-06-15T00:10:00Z'))).toBe('2026-06-15');
  });

  it('addDays traverse mois et années', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('daysBetween : comme les anciennes copies « joursEntre »', () => {
    const ancien = (de: string, a: string) =>
      Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
    for (const [de, a] of [
      ['2026-10-01', '2026-10-24'],
      ['2026-12-30', '2027-01-02'],
      ['2026-10-24', '2026-10-21'],
    ])
      expect(daysBetween(de, a)).toBe(ancien(de, a));
    expect(daysBetween('2026-10-01T23:00:00Z', '2026-10-02T01:00:00Z')).toBe(1);
  });

  it('daysSince : jours entiers, négatif si à venir', () => {
    const maintenant = Date.parse('2026-10-24T12:00:00Z');
    expect(daysSince('2026-10-21T12:00:00Z', maintenant)).toBe(3);
    expect(daysSince('2026-10-24T13:00:00Z', maintenant)).toBe(-1);
    expect(daysSince(new Date('2026-10-23T11:00:00Z'), maintenant)).toBe(1);
  });
});

describe('formats longs', () => {
  it('« 24 octobre 2026 »', () => {
    expect(formatLongDate('2026-10-24')).toBe('24 octobre 2026');
  });

  it('« 24 oct. »', () => {
    expect(formatDayShortMonth('2026-10-24T12:00:00Z')).toBe('24 oct.');
  });
});

// Le fuseau de l'appareil est Pacific/Kiritimati (UTC+14, vitest.config.mts) :
// 2026-10-24T22:30Z y est déjà le 25 à 12 h 30, mais à Dakar le 24 à 22 h 30.
describe('heure de Dakar, quel que soit le lieu de l’utilisateur', () => {
  const soir = '2026-10-24T22:30:00Z';

  it('l’appareil est bien loin de Dakar pendant les tests', () => {
    expect(new Date(soir).getDate()).toBe(25);
  });

  it('heures, dates et jours', () => {
    expect(formatTime(soir)).toBe('22:30');
    expect(formatDateTime(soir)).toBe('24/10/2026 22:30');
    expect(formatLongDateTime(soir)).toBe('24 octobre 2026 à 22:30');
    expect(formatDayLongMonth(soir)).toBe('24 octobre');
    expect(formatDayShortMonth(soir)).toBe('24 oct.');
    expect(toIsoDay(new Date(soir))).toBe('2026-10-24');
  });

  it('année courante : celle de Dakar', () => {
    expect(yearOf(new Date('2026-12-31T22:00:00Z'))).toBe(2026);
  });

  it('addMonths traverse les années', () => {
    expect(addMonths('2026-10', -11)).toBe('2025-11');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });

  it('addMonths sur un jour : dernier jour du mois si le jour n’existe pas', () => {
    // Le 31 du mois.
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2026-05-31', 2)).toBe('2026-07-31');
    // Le 29 février d'une année bissextile.
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2028-02-29', 48)).toBe('2032-02-29');
    // Le passage d'année, dans les deux sens.
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2027-01-15', -2)).toBe('2026-11-15');
  });
});

it('jour de la semaine (Agenda)', () => {
  expect(formatWeekdayDayMonth('2026-11-02')).toBe('lundi 2 novembre');
});

// Grille horaire de l'Agenda (12/11/2026).
describe('minutesOfDay · dakarInstant · hhmmOfMinutes', () => {
  it('heure de Dakar (UTC) : minutes depuis minuit, aller-retour', () => {
    expect(minutesOfDay('2026-11-12T09:30:00.000Z')).toBe(570);
    expect(dakarInstant('2026-11-12', '09:30')).toBe('2026-11-12T09:30:00.000Z');
    expect(minutesOfDay(dakarInstant('2026-11-12', hhmmOfMinutes(570)))).toBe(570);
  });
  it('hhmmOfMinutes reste dans la journée', () => {
    expect(hhmmOfMinutes(-5)).toBe('00:00');
    expect(hhmmOfMinutes(24 * 60)).toBe('23:59');
    expect(hhmmOfMinutes(605)).toBe('10:05');
  });
});

describe('formatWeekdayShort', () => {
  it('jour abrégé, quel que soit le format reçu', () => {
    expect(formatWeekdayShort('2026-11-12')).toBe('jeu.');
    expect(formatWeekdayShort('2026-11-16T23:30:00.000Z')).toBe('lun.');
  });
});
