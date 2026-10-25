import { statsPerformances, statutSelonEtat, statutTache } from './regles-taches';

const J = '2026-09-23';
const fenetre = (debut: string | null, echeance: string | null) => ({ debut, echeance });
const v = (o: Partial<{ remisLe: Date; valideLe: Date; renvoyeLe: Date }>) => ({
  remisLe: null,
  valideLe: null,
  renvoyeLe: null,
  ...o,
});

describe('regles-taches', () => {
  it('statut : validation, remise et renvoi priment sur la fenêtre', () => {
    const passee = fenetre('2026-09-01', '2026-09-10');
    expect(statutTache(passee, v({ valideLe: new Date() }), J)).toBe('validee');
    expect(statutTache(passee, v({ remisLe: new Date() }), J)).toBe('remise');
    expect(statutTache(passee, v({ renvoyeLe: new Date() }), J)).toBe('a_reprendre');
    expect(statutTache(passee, null, J)).toBe('en_retard');
  });

  it('statut : fenêtre à venir, en cours, à planifier', () => {
    expect(statutTache(fenetre('2026-09-28', '2026-09-30'), null, J)).toBe('a_venir');
    expect(statutTache(fenetre('2026-09-11', '2026-09-23'), null, J)).toBe('en_cours');
    expect(statutTache(fenetre(null, '2026-09-30'), null, J)).toBe('a_planifier');
  });

  it('respect des délais : validées remises au plus tard le jour de l’échéance', () => {
    const s = statsPerformances([
      { statut: 'validee', echeance: '2026-09-18', remisLe: new Date('2026-09-18T17:00:00Z') },
      { statut: 'validee', echeance: '2026-09-18', remisLe: new Date('2026-09-19T08:00:00Z') },
      { statut: 'validee', echeance: null, remisLe: new Date('2026-09-19T08:00:00Z') },
      { statut: 'remise', echeance: '2026-09-30', remisLe: new Date('2026-09-20T08:00:00Z') },
      { statut: 'en_retard', echeance: '2026-09-10', remisLe: null },
    ]);
    expect(s).toEqual({
      total: 5,
      validees: 3,
      enCours: 2,
      enRetard: 1,
      respectDelais: { aTemps: 1, total: 2, pct: 50 },
    });
    expect(statsPerformances([]).respectDelais.pct).toBeNull();
  });
});

// Règle commune des projets (22/10/2026) : même lecture que Production et Équipes.
describe('statutSelonEtat', () => {
  it('prolongation accordée = retard qualifié ; carte verrouillée = attend l’étape précédente', () => {
    expect(statutSelonEtat('en_retard', { code: 'prolongee' })).toBe('prolongee');
    expect(statutSelonEtat('en_retard', { code: 'verrouillee' })).toBe('bloquee');
    expect(statutSelonEtat('en_cours', { code: 'verrouillee' })).toBe('bloquee');
    expect(statutSelonEtat('en_retard', { code: 'en_retard' })).toBe('en_retard');
    // Remise, reprise, validée : le circuit de validation prime.
    expect(statutSelonEtat('remise', { code: 'verrouillee' })).toBe('remise');
    expect(statutSelonEtat('en_retard', undefined)).toBe('en_retard');
  });
});
