import { describe, expect, it } from 'vitest';
import { maskDayInput, parseDayInput } from './request-parts';

describe('saisie des dates (JJ/MM/AAAA)', () => {
  it('les « / » sont posés pendant la frappe, chiffres seulement', () => {
    expect(maskDayInput('1')).toBe('1');
    expect(maskDayInput('121')).toBe('12/1');
    expect(maskDayInput('12102026')).toBe('12/10/2026');
    expect(maskDayInput('12/10/2026 9')).toBe('12/10/2026');
  });

  it('date réelle seulement ; sinon null', () => {
    expect(parseDayInput('28/10/2026')).toBe('2026-10-28');
    expect(parseDayInput('31/02/2026')).toBeNull();
    expect(parseDayInput('2026-10-28')).toBeNull();
  });
});
