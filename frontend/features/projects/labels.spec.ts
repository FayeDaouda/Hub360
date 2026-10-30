import { describe, expect, it } from 'vitest';
import { blockAssignment } from './labels';

const awa = { id: 'A', nom: 'Awa Diop' };
const moussa = { id: 'M', nom: 'Moussa Fall' };
const t = (statut: string, assigne: { id: string; nom: string } | null) =>
  ({ statut, assigne }) as Parameters<typeof blockAssignment>[0][number];

describe('blockAssignment', () => {
  it('personne sur le bloc : « Assigner le bloc »', () => {
    expect(blockAssignment([t('a_faire', null), t('a_faire', null)])).toEqual({
      libelle: 'Assigner le bloc',
      personneId: null,
      ouvertes: 2,
      vide: true,
    });
  });

  it('une seule personne sur toutes les tâches ouvertes : son nom, préchoisie', () => {
    expect(blockAssignment([t('a_faire', awa), t('remise', awa), t('validee', moussa)])).toEqual({
      libelle: 'Assigné à Awa Diop',
      personneId: 'A',
      ouvertes: 2,
      vide: false,
    });
  });

  it('plusieurs personnes ; des tâches encore libres restent l’action à faire', () => {
    expect(blockAssignment([t('a_faire', awa), t('a_faire', moussa)])?.libelle).toBe('Assigné à 2 personnes');
    expect(blockAssignment([t('a_faire', awa), t('a_faire', null), t('a_faire', null)])).toMatchObject({
      libelle: '2 tâches à assigner',
      vide: true,
    });
  });

  it('tout validé ou non nécessaire : rien à assigner', () => {
    expect(blockAssignment([t('validee', awa), t('non_necessaire', null)])).toBeNull();
  });
});
