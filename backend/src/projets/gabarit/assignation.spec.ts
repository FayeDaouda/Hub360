import { motifNonAssignable, tachesAssignees } from './assignation';

const t = (id: string, statut = 'a_faire', carteDesactivee = false) => ({ id, statut, carteDesactivee });

describe('assignation d’une tâche de projet', () => {
  it('validée, non nécessaire ou carte désactivée → refus motivé', () => {
    expect(motifNonAssignable(t('a', 'validee'))).toMatch(/validée/);
    expect(motifNonAssignable(t('a', 'non_necessaire'))).toMatch(/non nécessaire/);
    expect(motifNonAssignable(t('a', 'a_faire', true))).toMatch(/désactivée/);
    expect(motifNonAssignable(t('a', 'reprise'))).toBeNull();
  });

  it('à la tâche : elle seule ; à la carte : ses tâches encore ouvertes', () => {
    const carte = [t('a'), t('b', 'validee'), t('c', 'a_valider'), t('d', 'non_necessaire')];
    expect(tachesAssignees(carte[0], carte, false)).toEqual(['a']);
    expect(tachesAssignees(carte[0], carte, true)).toEqual(['a', 'c']);
    expect(tachesAssignees(carte[1], carte, false)).toEqual([]);
  });
});
