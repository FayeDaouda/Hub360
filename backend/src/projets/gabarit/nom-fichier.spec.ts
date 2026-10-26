import { nomFichierDepot, segmentTache } from './nom-fichier';

describe('nom des fichiers déposés', () => {
  it('format validé : CODE_ÉTAPE_TÂCHE_vNN.ext', () => {
    expect(
      nomFichierDepot({
        code: 'FS_POI.26',
        etapeNumero: 4,
        tache: 'Timbre fiscal',
        version: 1,
        nomOrigine: 'scan 12.PDF',
        rang: 0,
        total: 1,
      }),
    ).toBe('FS_POI.26_04_TIMBRE-FISCAL_v01.pdf');
  });
  it('plusieurs fichiers : suffixe -1, -2 ; sans extension : rien ajouté', () => {
    const base = { code: 'DFS_ALM.26-2', etapeNumero: 6, tache: 'Cuisines', version: 12, total: 2 };
    expect(nomFichierDepot({ ...base, nomOrigine: 'a.dwg', rang: 0 })).toBe('DFS_ALM.26-2_06_CUISINES_v12-1.dwg');
    expect(nomFichierDepot({ ...base, nomOrigine: 'notes', rang: 1 })).toBe('DFS_ALM.26-2_06_CUISINES_v12-2');
  });
  it('libellé : accents et ponctuation retirés, longueur bornée', () => {
    expect(segmentTache('Plans · Coupes · Façades (cartouche autorisation)')).toBe(
      'PLANS-COUPES-FACADES-CARTOUCHE-AUTORISAT',
    );
    expect(segmentTache('Électricité : prises, interrupteurs')).toBe('ELECTRICITE-PRISES-INTERRUPTEURS');
  });
});
