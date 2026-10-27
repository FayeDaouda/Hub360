import { describe, expect, it } from 'vitest';
import { myTaskFixture as tache } from './fixtures';
import { groupByProject, groupTasks, relativeDue, waitingSince } from './task-groups';

// Mercredi 28 octobre 2026 : la semaine court jusqu'au dimanche 1er novembre.
const TODAY = '2026-10-28';

describe('groupTasks — vue par urgence', () => {
  const late = tache({
    id: 'late',
    statut: 'en_retard',
    echeance: '2026-10-20',
    dateEffective: '2026-10-20',
    enRetard: true,
  });
  const rework = tache({ id: 'rework', statut: 'a_reprendre', echeance: '2026-11-10', dateEffective: '2026-11-10' });
  const lateRework = tache({
    id: 'late-rework',
    statut: 'a_reprendre',
    echeance: '2026-10-21',
    dateEffective: '2026-10-21',
    enRetard: true,
  });
  const thisWeek = tache({ id: 'week', echeance: '2026-11-01', dateEffective: '2026-11-01' });
  const nextWeek = tache({ id: 'next', echeance: '2026-11-02', dateEffective: '2026-11-02' });
  const waiting = tache({ id: 'waiting', statut: 'remise', remisLe: '2026-10-26T09:00:00.000Z' });
  const done = tache({ id: 'done', statut: 'validee' });
  const all = [late, rework, lateRework, thisWeek, nextWeek, waiting, done];

  it('le retard vient du back ; une reprise en retard compte aux deux cartes mais n’est listée qu’une fois', () => {
    const g = groupTasks(all, TODAY, []);
    expect(g.retards.map((t) => t.id)).toEqual(['late', 'late-rework']);
    expect(g.reprises.map((t) => t.id)).toEqual(['late-rework', 'rework']);
    expect(g.sections.reprises.map((t) => t.id)).toEqual(['rework']);
    expect(g.semaine.map((t) => t.id)).toEqual(['week']);
    expect(g.attente.map((t) => t.id)).toEqual(['waiting']);
    expect(g.later.map((t) => t.id)).toEqual(['next']);
    expect(g.open.some((t) => t.id === 'done')).toBe(false);
    expect(g.sunday).toBe('2026-11-01');
    // Tâches qui demandent une action, sans double compte.
    expect(g.urgent).toBe(4);
  });

  it('ton de la ligne : risque, attention, info, neutre', () => {
    const g = groupTasks(all, TODAY, []);
    const tone = (id: string) => g.toneOf(g.open.find((t) => t.id === id)!);
    expect([tone('late'), tone('rework'), tone('week'), tone('waiting'), tone('next')]).toEqual([
      'risque',
      'risque',
      'attention',
      'info',
      'neutre',
    ]);
  });

  it('un dépôt en attente d’envoi est déjà « en validation », sans retard', () => {
    const g = groupTasks(all, TODAY, ['late']);
    const sent = g.attente.find((t) => t.id === 'late')!;
    expect(sent).toMatchObject({ statut: 'remise', version: 1, remisLe: TODAY, enRetard: false });
    expect(g.retards.map((t) => t.id)).toEqual(['late-rework']);
  });

  it('vue par projet : les projets et les tâches les plus urgents d’abord', () => {
    const other = tache({
      id: 'other',
      projetId: 'p2',
      projetCode: 'AB_YOF.26',
      echeance: '2026-11-20',
      dateEffective: '2026-11-20',
    });
    const g = groupTasks([other, ...all], TODAY, []);
    const groups = groupByProject(g.open, g.rank);
    expect(groups.map((p) => p.projetId)).toEqual(['p1', 'p2']);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['late', 'late-rework', 'rework', 'week', 'waiting', 'next']);
  });
});

describe('libellés relatifs', () => {
  it('échéance : retard, aujourd’hui, demain, dans n jours', () => {
    expect(relativeDue('2026-10-14', TODAY)).toBe('14 j de retard');
    expect(relativeDue(TODAY, TODAY)).toBe('Aujourd’hui');
    expect(relativeDue('2026-10-29', TODAY)).toBe('Demain');
    expect(relativeDue('2026-10-31', TODAY)).toBe('Dans 3 j');
  });

  it('attente chez le N+1 : aujourd’hui, hier, il y a n jours', () => {
    expect(waitingSince('2026-10-28T08:00:00.000Z', TODAY)).toBe('déposée aujourd’hui');
    expect(waitingSince('2026-10-27T08:00:00.000Z', TODAY)).toBe('déposée hier');
    expect(waitingSince('2026-10-24T08:00:00.000Z', TODAY)).toBe('déposée il y a 4 j');
  });
});
