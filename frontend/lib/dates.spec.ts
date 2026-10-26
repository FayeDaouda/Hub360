import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysSince,
  formatDate,
  formatDayMonth,
  formatDayShortMonth,
  formatLongDate,
  formatMonthYear,
  toIsoDay,
  todayIso,
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

describe('jours', () => {
  it('jour ISO à Dakar (UTC+0, sans heure d’été)', () => {
    expect(toIsoDay(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-24');
    expect(todayIso(new Date('2026-06-15T00:10:00Z'))).toBe('2026-06-15');
  });

  it('addDays traverse mois et années', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
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
    expect(formatDayShortMonth('2026-10-24T12:00:00Z')).toBe(
      new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date('2026-10-24T12:00:00Z')),
    );
  });
});
