import { ForbiddenException } from '@nestjs/common';
import {
  assertInCircuit,
  canDecide,
  canQualify,
  commentsWithoutWrite,
  outsideCircuit,
  ROLE_CEO,
  ROLE_CFO,
  ROLE_CTO,
  ROLE_DPLG,
  tsRight,
} from './review-rules';

// CEO et CFO (étape 1) : lecture + commentaires, aucune action de circuit.
describe('validation · rôle hors circuit (CEO)', () => {
  const aValider = { statut: 'a_valider', assigneId: 'C1', assigneeIsDplg: false };

  it('le CEO ne valide ni ne qualifie, même chef de team', () => {
    expect(canDecide({ role: ROLE_CEO, employeeId: 'CHEF', ctoStandsIn: false }, aValider, 'CHEF')).toBe(false);
    expect(
      canQualify(
        { role: ROLE_CEO, employeeId: 'CHEF', ctoStandsIn: false },
        { assigneId: 'C1', assigneeIsDplg: false },
        'CHEF',
      ),
    ).toBe(false);
  });

  it('le DPLG garde la validation', () => {
    expect(canDecide({ role: ROLE_DPLG, employeeId: null, ctoStandsIn: false }, aValider, 'CHEF')).toBe(true);
    expect(
      canQualify(
        { role: ROLE_DPLG, employeeId: null, ctoStandsIn: false },
        { assigneId: 'C1', assigneeIsDplg: false },
        'CHEF',
      ),
    ).toBe(true);
  });

  it('assertInCircuit refuse le CEO, laisse passer les autres', () => {
    expect(() => assertInCircuit(ROLE_CEO)).toThrow(ForbiddenException);
    expect(() => assertInCircuit(ROLE_DPLG)).not.toThrow();
    expect(() => assertInCircuit('CTO (transverse)')).not.toThrow();
  });

  it('CEO et CFO commentent sans écriture sur Projets, hors circuit', () => {
    for (const r of [ROLE_CEO, ROLE_CFO]) {
      expect(commentsWithoutWrite(r)).toBe(true);
      expect(outsideCircuit(r)).toBe(true);
      expect(() => assertInCircuit(r)).toThrow(ForbiddenException);
    }
    expect(commentsWithoutWrite('RH')).toBe(false);
    expect(outsideCircuit(ROLE_DPLG)).toBe(false);
  });
});

// Revue Dir. GC (21/10/2026, lot 4) : le CTO, niveau au-dessus du Dir. GC.
describe('validation · escalade au CTO et suppléance', () => {
  const dplg = { role: ROLE_DPLG, employeeId: 'DG', ctoStandsIn: false };
  const cto = { role: ROLE_CTO, employeeId: null, ctoStandsIn: false };
  const remise = (assigneId: string, assigneeIsDplg = false) => ({ statut: 'a_valider', assigneId, assigneeIsDplg });

  it('le travail d’un Dir. GC est validé par le CTO, pas par un autre Dir. GC', () => {
    expect(canDecide(cto, remise('DG', true), null)).toBe(true);
    expect(canDecide({ role: ROLE_DPLG, employeeId: 'DG2', ctoStandsIn: false }, remise('DG', true), null)).toBe(false);
    expect(canDecide(dplg, remise('DG', true), null)).toBe(false); // ni sa propre tâche
  });

  it('le CTO ne valide le travail des équipes qu’en suppléance du Dir. GC absent', () => {
    expect(canDecide(cto, remise('C1'), 'CHEF')).toBe(false);
    expect(canDecide({ ...cto, ctoStandsIn: true }, remise('C1'), 'CHEF')).toBe(true);
    expect(canQualify({ ...cto, ctoStandsIn: true }, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF')).toBe(true);
  });

  it('prolongation qui repousse la livraison : le CTO seul, ni chef de team ni Dir. GC', () => {
    expect(canQualify(dplg, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF', true)).toBe(false);
    expect(
      canQualify(
        { role: 'Salarié', employeeId: 'CHEF', ctoStandsIn: false },
        { assigneId: 'C1', assigneeIsDplg: false },
        'CHEF',
        true,
      ),
    ).toBe(false);
    expect(canQualify(cto, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF', true)).toBe(true);
    expect(canQualify(dplg, { assigneId: 'C1', assigneeIsDplg: false }, 'CHEF', false)).toBe(true);
  });

  it('TS : le Dir. GC ajoute jusqu’au seuil, au-delà il demande ; le CTO ajoute ; le CEO rien', () => {
    expect(tsRight(dplg, 100_000, 500_000)).toBe('ajouter');
    expect(tsRight(dplg, 500_000, 500_000)).toBe('ajouter');
    expect(tsRight(dplg, 500_001, 500_000)).toBe('demander');
    expect(tsRight(cto, 2_000_000, 500_000)).toBe('ajouter');
    expect(tsRight({ role: 'Salarié', employeeId: 'C1', ctoStandsIn: false }, 100, 500_000)).toBeNull();
    expect(tsRight({ role: ROLE_CEO, employeeId: null, ctoStandsIn: false }, 100, 500_000)).toBeNull();
  });
});
