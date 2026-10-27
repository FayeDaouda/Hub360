import { isLate, onTime, performanceStats, statusFromProjectState, taskStatus } from './task-rules';

const J = '2026-09-23';
const fenetre = (debut: string | null, echeance: string | null) => ({ debut, echeance });
const v = (o: Partial<{ remisLe: Date; valideLe: Date; renvoyeLe: Date }>) => ({
  remisLe: null,
  valideLe: null,
  renvoyeLe: null,
  ...o,
});

describe('task-rules', () => {
  it('statut : validation, remise et renvoi priment sur la fenêtre', () => {
    const passee = fenetre('2026-09-01', '2026-09-10');
    expect(taskStatus(passee, v({ valideLe: new Date() }), J)).toBe('validee');
    expect(taskStatus(passee, v({ remisLe: new Date() }), J)).toBe('remise');
    expect(taskStatus(passee, v({ renvoyeLe: new Date() }), J)).toBe('a_reprendre');
    expect(taskStatus(passee, null, J)).toBe('en_retard');
  });

  it('statut : fenêtre à venir, en cours, à planifier', () => {
    expect(taskStatus(fenetre('2026-09-28', '2026-09-30'), null, J)).toBe('a_venir');
    expect(taskStatus(fenetre('2026-09-11', '2026-09-23'), null, J)).toBe('en_cours');
    expect(taskStatus(fenetre(null, '2026-09-30'), null, J)).toBe('a_planifier');
  });

  it('respect des délais : validées remises au plus tard le jour de l’échéance ; taux de reprise', () => {
    const s = performanceStats([
      { statut: 'validee', echeance: '2026-09-18', remisLe: new Date('2026-09-18T17:00:00Z'), version: 1 },
      { statut: 'validee', echeance: '2026-09-18', remisLe: new Date('2026-09-19T08:00:00Z'), version: 2 },
      { statut: 'validee', echeance: null, remisLe: new Date('2026-09-19T08:00:00Z'), version: 1 },
      { statut: 'remise', echeance: '2026-09-30', remisLe: new Date('2026-09-20T08:00:00Z'), version: 3 },
      { statut: 'en_retard', echeance: '2026-09-10', remisLe: null, version: 0 },
    ]);
    expect(s).toEqual({
      total: 5,
      validees: 3,
      enCours: 2,
      enRetard: 1,
      respectDelais: { aTemps: 1, total: 2, pct: 50 },
      // Validées après au moins une remise : 3 ; renvoyées au moins une fois : 1.
      reprises: { avecReprise: 1, total: 3, pct: 33 },
    });
    expect(performanceStats([]).respectDelais.pct).toBeNull();
    expect(performanceStats([]).reprises.pct).toBeNull();
  });

  it('à temps : remise au plus tard le jour de l’échéance ; rien à juger sans remise datée ni échéance', () => {
    expect(onTime({ echeance: '2026-09-18', remisLe: new Date('2026-09-18T23:00:00Z') })).toBe(true);
    expect(onTime({ echeance: '2026-09-18', remisLe: new Date('2026-09-19T00:30:00Z') })).toBe(false);
    expect(onTime({ echeance: null, remisLe: new Date('2026-09-19T00:30:00Z') })).toBeNull();
    expect(onTime({ echeance: '2026-09-18', remisLe: null })).toBeNull();
  });
});

// Règle commune des projets (22/10/2026) : même lecture que Production et Équipes.
describe('statusFromProjectState', () => {
  it('prolongation accordée = retard qualifié ; carte verrouillée = attend l’étape précédente', () => {
    expect(statusFromProjectState('en_retard', { code: 'prolongee' })).toBe('prolongee');
    expect(statusFromProjectState('en_retard', { code: 'verrouillee' })).toBe('bloquee');
    expect(statusFromProjectState('en_cours', { code: 'verrouillee' })).toBe('bloquee');
    expect(statusFromProjectState('en_retard', { code: 'en_retard' })).toBe('en_retard');
    // Remise, reprise, validée : le circuit de validation prime.
    expect(statusFromProjectState('remise', { code: 'verrouillee' })).toBe('remise');
    expect(statusFromProjectState('en_retard', undefined)).toBe('en_retard');
  });
});

// Règle du retard (23/10/2026), calculée au back depuis S2 : le retard est un
// attribut — une reprise ou une prolongée dont la date est passée est en retard.
describe('isLate', () => {
  const t = (
    statut: Parameters<typeof isLate>[0]['statut'],
    echeance: string | null,
    prolongeeJusquau: string | null = null,
  ) => ({
    statut,
    echeance,
    prolongeeJusquau,
  });

  it('en retard ; reprise ou prolongée dont la date est passée', () => {
    expect(isLate(t('en_retard', '2026-09-10'), J)).toBe(true);
    expect(isLate(t('a_reprendre', '2026-09-10'), J)).toBe(true);
    expect(isLate(t('a_reprendre', '2026-09-30'), J)).toBe(false);
    // Prolongée : la date accordée fait foi, pas l'échéance d'origine.
    expect(isLate(t('prolongee', '2026-09-10', '2026-09-30'), J)).toBe(false);
    expect(isLate(t('prolongee', '2026-09-01', '2026-09-20'), J)).toBe(true);
  });

  it('jamais pour une tâche remise, validée ou bloquée (attend l’étape précédente)', () => {
    for (const statut of ['remise', 'validee', 'bloquee', 'en_cours', 'a_venir', 'a_planifier'] as const) {
      expect(isLate(t(statut, '2026-09-10'), J)).toBe(false);
    }
  });
});
