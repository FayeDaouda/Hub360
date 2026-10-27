import { describe, expect, it } from 'vitest';
import { visibleTabs } from './my-space-tabs';

const keys = (role: string, mission = false, toReview = 0) => visibleTabs(role, mission, toReview).map((t) => t.key);

describe('onglets de Mon espace', () => {
  it('Salarié : « À valider » seulement si quelque chose attend ; la carte de mission une fois rédigée', () => {
    expect(keys('Salarié')).toEqual([
      'performances',
      'temps',
      'cellule',
      'conges',
      'remboursements',
      'informations',
      'documents',
    ]);
    expect(keys('Salarié', false, 2)).toContain('a-valider');
    expect(keys('Salarié', true)).toContain('mission');
  });

  it('un rôle qui valide garde « À valider », même vide', () => {
    expect(keys('CFO')).toContain('a-valider');
    expect(keys('RH')).not.toContain('a-valider');
  });

  it('CEO : hors circuit des tâches (ni performances, ni temps, ni cellule)', () => {
    expect(keys('CEO (transverse)')).toEqual(['a-valider', 'conges', 'remboursements', 'informations', 'documents']);
  });
});
