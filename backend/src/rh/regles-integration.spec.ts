import { ajouterJours, enSuivi, statutPoint } from './regles-integration';

describe("règles d'intégration", () => {
  it('jalons calendaires : dates de la maquette', () => {
    expect([30, 60, 90].map((n) => ajouterJours('2026-09-15', n))).toEqual(['2026-10-15', '2026-11-14', '2026-12-14']);
    expect([30, 60, 90].map((n) => ajouterJours('2026-07-20', n))).toEqual(['2026-08-19', '2026-09-18', '2026-10-18']);
  });
  it('nouvel arrivant : créé avant la fin de ses 90 jours, ni confirmé ni archivé', () => {
    const base = {
      dateEntree: '2026-07-20',
      createdAt: new Date('2026-09-28T10:00:00Z'),
      confirmeLe: null,
      archiveLe: null,
    };
    expect(enSuivi(base)).toBe(true);
    expect(enSuivi({ ...base, dateEntree: '2023-03-06' })).toBe(false); // existant repris
    expect(enSuivi({ ...base, dateEntree: '2026-12-01' })).toBe(true); // entrée à venir
    expect(enSuivi({ ...base, dateEntree: null })).toBe(false);
    expect(enSuivi({ ...base, confirmeLe: '2026-10-18' })).toBe(false);
    expect(enSuivi({ ...base, archiveLe: new Date() })).toBe(false);
  });
  it('statut d’un point', () => {
    expect(statutPoint('2026-09-18', false, '2026-09-28')).toBe('a_faire');
    expect(statutPoint('2026-09-28', false, '2026-09-28')).toBe('a_faire');
    expect(statutPoint('2026-10-18', false, '2026-09-28')).toBe('a_venir');
    expect(statutPoint('2026-10-18', true, '2026-09-28')).toBe('fait');
  });
});
