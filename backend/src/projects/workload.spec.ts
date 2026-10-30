import { workloadOver } from './workload';

// Semaine du lundi 19 au vendredi 23 octobre 2026 : 5 jours ouvrés = 40 h.
const P = { debut: '2026-10-19', fin: '2026-10-23' };
const TACHE = { id: 'T', debut: P.debut, echeance: P.fin, heures: 8 };

describe('workloadOver', () => {
  it('libre : seule la tâche à assigner compte', () => {
    expect(workloadOver(P, [], TACHE, [])).toEqual({
      disponibles: 40,
      assignees: 0,
      joursAbsence: 0,
      pourcentage: 20,
    });
  });

  it('une autre tâche à cheval ne compte que pour sa part dans la période', () => {
    // 20 h réparties sur 10 jours ouvrés (12 → 23 oct.) : 10 h dans la semaine.
    const autre = { id: 'A', debut: '2026-10-12', echeance: '2026-10-23', heures: 20 };
    expect(workloadOver(P, [autre], TACHE, [])).toMatchObject({ assignees: 10, pourcentage: 45 });
  });

  it('absence et férié retirent des heures disponibles', () => {
    const c = workloadOver(P, [], TACHE, [{ debut: '2026-10-19', fin: '2026-10-20' }], new Set(['2026-10-21']));
    expect(c).toMatchObject({ disponibles: 16, joursAbsence: 2, pourcentage: 50 });
  });

  it('un bloc entier : toutes ses tâches comptent', () => {
    const autre = { id: 'T2', debut: P.debut, echeance: P.fin, heures: 12 };
    expect(workloadOver(P, [], [TACHE, autre], [])).toMatchObject({ assignees: 0, pourcentage: 50 });
  });

  it('absent toute la période : aucun pourcentage', () => {
    expect(workloadOver(P, [], TACHE, [P]).pourcentage).toBeNull();
  });
});
