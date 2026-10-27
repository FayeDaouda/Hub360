import { tasksToAssign, unassignableReason } from './assignment-rules';

const t = (id: string, statut = 'a_faire', cardDisabled = false) => ({ id, statut, cardDisabled });

describe('assignation d’une tâche de projet', () => {
  it('validée, non nécessaire ou carte désactivée → refus motivé', () => {
    expect(unassignableReason(t('a', 'validee'))).toMatch(/validée/);
    expect(unassignableReason(t('a', 'non_necessaire'))).toMatch(/non nécessaire/);
    expect(unassignableReason(t('a', 'a_faire', true))).toMatch(/désactivée/);
    expect(unassignableReason(t('a', 'reprise'))).toBeNull();
  });

  it('à la tâche : elle seule ; à la carte : ses tâches encore ouvertes', () => {
    const carte = [t('a'), t('b', 'validee'), t('c', 'a_valider'), t('d', 'non_necessaire')];
    expect(tasksToAssign(carte[0], carte, false)).toEqual(['a']);
    expect(tasksToAssign(carte[0], carte, true)).toEqual(['a', 'c']);
    expect(tasksToAssign(carte[1], carte, false)).toEqual([]);
  });
});
