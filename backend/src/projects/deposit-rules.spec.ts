import { canDeposit, depositsForSomeoneElse, type DepositActor } from './deposit-rules';

// Qui dépose (« coche ») une tâche de projet (décision du 09/11/2026).
describe('canDeposit', () => {
  const member: DepositActor = { employeeId: 'C1', canWriteProjects: false, chiefCellIds: [] };
  const dirGc: DepositActor = { employeeId: 'C9', canWriteProjects: true, chiefCellIds: [] };
  const chief: DepositActor = { employeeId: 'C2', canWriteProjects: false, chiefCellIds: ['EQ1'] };
  const mine = { assigneId: 'C1', assigneCelluleId: 'EQ1' };
  const otherInTeam = { assigneId: 'C3', assigneCelluleId: 'EQ1' };
  const otherTeam = { assigneId: 'C4', assigneCelluleId: 'EQ2' };
  const unassigned = { assigneId: null, assigneCelluleId: null };

  it('l’assigné dépose sa tâche', () => {
    expect(canDeposit(member, mine)).toBe(true);
  });

  it('un simple membre ne dépose ni la tâche d’un autre, ni une tâche sans assigné', () => {
    expect(canDeposit(member, otherInTeam)).toBe(false);
    expect(canDeposit(member, unassigned)).toBe(false);
  });

  it('l’Écriture de « Projets et cartes » dépose toute tâche, assignée ou non', () => {
    for (const t of [mine, otherInTeam, otherTeam, unassigned]) expect(canDeposit(dirGc, t)).toBe(true);
  });

  it('même sans fiche d’équipe, l’Écriture de « Projets et cartes » suffit', () => {
    expect(canDeposit({ ...dirGc, employeeId: null }, otherTeam)).toBe(true);
  });

  it('le chef d’équipe : tâches sans assigné et celles de ses membres, pas celles d’une autre équipe', () => {
    expect(canDeposit(chief, unassigned)).toBe(true);
    expect(canDeposit(chief, otherInTeam)).toBe(true);
    expect(canDeposit(chief, otherTeam)).toBe(false);
  });

  it('assigné sans équipe connue : le chef ne dépose pas à sa place', () => {
    expect(canDeposit(chief, { assigneId: 'C5', assigneCelluleId: null })).toBe(false);
  });

  it('sans fiche d’équipe ni droit : rien', () => {
    expect(canDeposit({ employeeId: null, canWriteProjects: false, chiefCellIds: [] }, unassigned)).toBe(false);
  });
});

describe('depositsForSomeoneElse', () => {
  it('vrai seulement quand la tâche est assignée à une autre personne', () => {
    const a: DepositActor = { employeeId: 'C2', canWriteProjects: true, chiefCellIds: [] };
    expect(depositsForSomeoneElse(a, { assigneId: 'C1', assigneCelluleId: null })).toBe(true);
    expect(depositsForSomeoneElse(a, { assigneId: 'C2', assigneCelluleId: null })).toBe(false);
    expect(depositsForSomeoneElse(a, { assigneId: null, assigneCelluleId: null })).toBe(false);
  });
});
