import { ForbiddenException } from '@nestjs/common';
import { commenteSansEcriture, horsCircuit, peutDecider, peutQualifier, ROLE_CEO, ROLE_CFO, ROLE_DPLG, verifierCircuit } from './validation';

// CEO et CFO (étape 1) : lecture + commentaires, aucune action de circuit.
describe('validation · rôle hors circuit (CEO)', () => {
  const aValider = { statut: 'a_valider', assigneId: 'C1' };

  it('le CEO ne valide ni ne qualifie, même chef de team', () => {
    expect(peutDecider({ role: ROLE_CEO, collaborateurId: 'CHEF' }, aValider, 'CHEF')).toBe(false);
    expect(peutQualifier({ role: ROLE_CEO, collaborateurId: 'CHEF' }, 'C1', 'CHEF')).toBe(false);
  });

  it('le DPLG garde la validation', () => {
    expect(peutDecider({ role: ROLE_DPLG, collaborateurId: null }, aValider, 'CHEF')).toBe(true);
    expect(peutQualifier({ role: ROLE_DPLG, collaborateurId: null }, 'C1', 'CHEF')).toBe(true);
  });

  it('verifierCircuit refuse le CEO, laisse passer les autres', () => {
    expect(() => verifierCircuit(ROLE_CEO)).toThrow(ForbiddenException);
    expect(() => verifierCircuit(ROLE_DPLG)).not.toThrow();
    expect(() => verifierCircuit('CTO (transverse)')).not.toThrow();
  });

  it('CEO et CFO commentent sans écriture sur Projets, hors circuit', () => {
    for (const r of [ROLE_CEO, ROLE_CFO]) {
      expect(commenteSansEcriture(r)).toBe(true);
      expect(horsCircuit(r)).toBe(true);
      expect(() => verifierCircuit(r)).toThrow(ForbiddenException);
    }
    expect(commenteSansEcriture('RH')).toBe(false);
    expect(horsCircuit(ROLE_DPLG)).toBe(false);
  });
});
