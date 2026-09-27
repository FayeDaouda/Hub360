import { modeContrat, remplirModele, variablesInconnues } from './domaine';

describe('Contrat — modèle', () => {
  it('remplace les champs connus, espaces tolérés', () => {
    expect(
      remplirModele('Entre {{ societe }} et {{client}} — {{code_dossier}}', {
        societe: 'Grey Concrete',
        client: 'Awa Sow',
        code_dossier: 'AS_ALM.26',
      }),
    ).toBe('Entre Grey Concrete et Awa Sow — AS_ALM.26');
  });

  it('signale les champs inconnus (faute de frappe) au lieu de les laisser passer', () => {
    expect(variablesInconnues('{{client}} {{montant_ofre_ht}} {{signataire}}')).toEqual([
      'montant_ofre_ht',
      'signataire',
    ]);
    expect(variablesInconnues('{{client}} {{date}}')).toEqual([]);
  });
});

describe('Contrat — modèle ou sur mesure', () => {
  it('sous le seuil → modèle ; au seuil et au-dessus → sur mesure', () => {
    expect(modeContrat(49_999_999, 50_000_000)).toBe('modele');
    expect(modeContrat(50_000_000, 50_000_000)).toBe('sur_mesure');
  });

  it('sans seuil société → toujours modèle', () => {
    expect(modeContrat(900_000_000, null)).toBe('modele');
  });
});
