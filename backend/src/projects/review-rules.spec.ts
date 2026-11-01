import { canDecide, canQualify, canVisa, canWriteThreads, tsRight } from './review-rules';
import { ROLE_CEO, ROLE_CFO, ROLE_CTO, ROLE_DIR_GC } from '@hub/domain';

// Droits de départ du lot 5 (matrice, 31/10/2026), par rôle.
const P = {
  dirGc: {
    'projets.validation': 'V',
    'projets.visa': 'V',
    'projets.prolongations': 'V',
    'projets.ts': 'E',
    'projets.fils': 'E',
  },
  cto: { 'projets.validation': 'V', 'projets.prolongations': 'V', 'projets.ts': 'EV', 'projets.fils': 'E' },
  ceo: { 'projets.fils': 'E' },
  salarie: { 'projets.fils': 'E' },
};

// CEO et CFO : aucun droit du circuit au départ — ils lisent et commentent.
describe('validation · sans droit du circuit (CEO)', () => {
  const aValider = { statut: 'a_valider', assigneId: 'C1', assigneeIsDplg: false };
  const ceo = { role: ROLE_CEO, employeeId: null, ctoStandsIn: false, permissions: P.ceo };

  it('le CEO ne valide ni ne qualifie, ne vise pas ; il commente', () => {
    expect(canDecide(ceo, aValider, 'CHEF')).toBe(false);
    expect(canQualify(ceo, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF')).toBe(false);
    expect(canVisa(ceo)).toBe(false);
    expect(canWriteThreads(ceo)).toBe(true);
    expect(canWriteThreads({ permissions: {} })).toBe(false);
  });

  it('le DPLG garde la validation et le visa', () => {
    const dplg = { role: ROLE_DIR_GC, employeeId: null, ctoStandsIn: false, permissions: P.dirGc };
    expect(canDecide(dplg, aValider, 'CHEF')).toBe(true);
    expect(canQualify(dplg, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF')).toBe(true);
    expect(canVisa(dplg)).toBe(true);
  });

  it('un rôle à qui le CIO donne la Validation des remises valide au niveau DPLG', () => {
    const cfo = { role: ROLE_CFO, employeeId: null, ctoStandsIn: false, permissions: { 'projets.validation': 'V' } };
    expect(canDecide(cfo, aValider, 'CHEF')).toBe(true);
    expect(canDecide(cfo, { ...aValider, assigneeIsDplg: true }, 'CHEF')).toBe(false); // circuit : le CTO
  });

  it('le chef d’équipe valide son équipe sans case (circuit)', () => {
    const chef = { role: 'Salarié', employeeId: 'CHEF', ctoStandsIn: false, permissions: P.salarie };
    expect(canDecide(chef, aValider, 'CHEF')).toBe(true);
    expect(canDecide(chef, { ...aValider, assigneId: 'CHEF' }, 'CHEF')).toBe(false); // jamais sa propre tâche
  });
});

// Revue Dir. GC (21/10/2026, lot 4) : le CTO, niveau au-dessus du Dir. GC.
describe('validation · escalade au CTO et suppléance', () => {
  const dplg = { role: ROLE_DIR_GC, employeeId: 'DG', ctoStandsIn: false, permissions: P.dirGc };
  const cto = { role: ROLE_CTO, employeeId: null, ctoStandsIn: false, permissions: P.cto };
  const remise = (assigneId: string, assigneeIsDplg = false) => ({ statut: 'a_valider', assigneId, assigneeIsDplg });

  it('le travail d’un Dir. GC est validé par le CTO, pas par un autre Dir. GC', () => {
    expect(canDecide(cto, remise('DG', true), null)).toBe(true);
    expect(canDecide({ ...dplg, employeeId: 'DG2' }, remise('DG', true), null)).toBe(false);
    expect(canDecide(dplg, remise('DG', true), null)).toBe(false); // ni sa propre tâche
  });

  it('le CTO ne valide le travail des équipes qu’en suppléance du Dir. GC absent', () => {
    expect(canDecide(cto, remise('C1'), 'CHEF')).toBe(false);
    expect(canDecide({ ...cto, ctoStandsIn: true }, remise('C1'), 'CHEF')).toBe(true);
    expect(canQualify({ ...cto, ctoStandsIn: true }, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF')).toBe(true);
  });

  it('sans la Validation de son étape, le CTO ne décide plus rien', () => {
    expect(canDecide({ ...cto, permissions: {} }, remise('DG', true), null)).toBe(false);
  });

  it('prolongation qui repousse la livraison : le CTO seul, ni chef d’équipe ni Dir. GC', () => {
    expect(canQualify(dplg, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF', true)).toBe(false);
    expect(
      canQualify(
        { role: 'Salarié', employeeId: 'CHEF', ctoStandsIn: false, permissions: P.salarie },
        { assigneId: 'C1', assigneeIsDplg: false },
        'CHEF',
        true,
      ),
    ).toBe(false);
    expect(canQualify(cto, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF', true)).toBe(true);
    expect(canQualify(dplg, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF', false)).toBe(true);
  });

  it('TS : l’Écriture ajoute jusqu’au seuil, au-delà elle demande ; la Validation ajoute ; sans droit, rien', () => {
    expect(tsRight(dplg, 100_000, 500_000)).toBe('ajouter');
    expect(tsRight(dplg, 500_000, 500_000)).toBe('ajouter');
    expect(tsRight(dplg, 500_001, 500_000)).toBe('demander');
    expect(tsRight(cto, 2_000_000, 500_000)).toBe('ajouter');
    expect(
      tsRight({ role: 'Salarié', employeeId: 'C1', ctoStandsIn: false, permissions: P.salarie }, 100, 500_000),
    ).toBeNull();
    expect(
      tsRight({ role: ROLE_CEO, employeeId: null, ctoStandsIn: false, permissions: P.ceo }, 100, 500_000),
    ).toBeNull();
  });
});
