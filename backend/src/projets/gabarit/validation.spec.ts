import { ForbiddenException } from '@nestjs/common';
import { commenteSansEcriture, droitTs, horsCircuit, peutDecider, peutQualifier, ROLE_CEO, ROLE_CFO, ROLE_CTO, ROLE_DPLG, verifierCircuit } from './validation';

// CEO et CFO (étape 1) : lecture + commentaires, aucune action de circuit.
describe('validation · rôle hors circuit (CEO)', () => {
  const aValider = { statut: 'a_valider', assigneId: 'C1' };

  it('le CEO ne valide ni ne qualifie, même chef de team', () => {
    expect(peutDecider({ role: ROLE_CEO, collaborateurId: 'CHEF' }, aValider, 'CHEF')).toBe(false);
    expect(peutQualifier({ role: ROLE_CEO, collaborateurId: 'CHEF' }, { assigneId: 'C1' }, 'CHEF')).toBe(false);
  });

  it('le DPLG garde la validation', () => {
    expect(peutDecider({ role: ROLE_DPLG, collaborateurId: null }, aValider, 'CHEF')).toBe(true);
    expect(peutQualifier({ role: ROLE_DPLG, collaborateurId: null }, { assigneId: 'C1' }, 'CHEF')).toBe(true);
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

// Revue Dir. GC (21/10/2026, lot 4) : le CTO, niveau au-dessus du Dir. GC.
describe('validation · escalade au CTO et suppléance', () => {
  const dplg = { role: ROLE_DPLG, collaborateurId: 'DG' };
  const cto = { role: ROLE_CTO, collaborateurId: null };
  const remise = (assigneId: string, assigneEstDplg = false) => ({ statut: 'a_valider', assigneId, assigneEstDplg });

  it('le travail d’un Dir. GC est validé par le CTO, pas par un autre Dir. GC', () => {
    expect(peutDecider(cto, remise('DG', true), null)).toBe(true);
    expect(peutDecider({ role: ROLE_DPLG, collaborateurId: 'DG2' }, remise('DG', true), null)).toBe(false);
    expect(peutDecider(dplg, remise('DG', true), null)).toBe(false); // ni sa propre tâche
  });

  it('le CTO ne valide le travail des équipes qu’en suppléance du Dir. GC absent', () => {
    expect(peutDecider(cto, remise('C1'), 'CHEF')).toBe(false);
    expect(peutDecider({ ...cto, ctoSupplee: true }, remise('C1'), 'CHEF')).toBe(true);
    expect(peutQualifier({ ...cto, ctoSupplee: true }, { assigneId: 'C1' }, 'CHEF')).toBe(true);
  });

  it('prolongation qui repousse la livraison : le CTO seul, ni chef de team ni Dir. GC', () => {
    expect(peutQualifier(dplg, { assigneId: 'C1' }, 'CHEF', true)).toBe(false);
    expect(peutQualifier({ role: 'Salarié', collaborateurId: 'CHEF' }, { assigneId: 'C1' }, 'CHEF', true)).toBe(false);
    expect(peutQualifier(cto, { assigneId: 'C1' }, 'CHEF', true)).toBe(true);
    expect(peutQualifier(dplg, { assigneId: 'C1' }, 'CHEF', false)).toBe(true);
  });

  it('TS : le Dir. GC ajoute jusqu’au seuil, au-delà il demande ; le CTO ajoute ; le CEO rien', () => {
    expect(droitTs(dplg, 100_000, 500_000)).toBe('ajouter');
    expect(droitTs(dplg, 500_000, 500_000)).toBe('ajouter');
    expect(droitTs(dplg, 500_001, 500_000)).toBe('demander');
    expect(droitTs(cto, 2_000_000, 500_000)).toBe('ajouter');
    expect(droitTs({ role: 'Salarié', collaborateurId: 'C1' }, 100, 500_000)).toBeNull();
    expect(droitTs({ role: ROLE_CEO, collaborateurId: null }, 100, 500_000)).toBeNull();
  });
});
