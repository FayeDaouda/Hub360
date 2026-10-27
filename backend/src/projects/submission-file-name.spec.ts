import { submissionFileName, taskSegment } from './submission-file-name';

describe('nom des fichiers déposés', () => {
  it('format validé : CODE_ÉTAPE_TÂCHE_vNN.ext', () => {
    expect(
      submissionFileName({
        code: 'FS_POI.26',
        etapeNumero: 4,
        task: 'Timbre fiscal',
        version: 1,
        originalName: 'scan 12.PDF',
        rank: 0,
        total: 1,
      }),
    ).toBe('FS_POI.26_04_TIMBRE-FISCAL_v01.pdf');
  });
  it('plusieurs fichiers : suffixe -1, -2 ; sans extension : rien ajouté', () => {
    const base = { code: 'DFS_ALM.26-2', etapeNumero: 6, task: 'Cuisines', version: 12, total: 2 };
    expect(submissionFileName({ ...base, originalName: 'a.dwg', rank: 0 })).toBe('DFS_ALM.26-2_06_CUISINES_v12-1.dwg');
    expect(submissionFileName({ ...base, originalName: 'notes', rank: 1 })).toBe('DFS_ALM.26-2_06_CUISINES_v12-2');
  });
  it('libellé : accents et ponctuation retirés, longueur bornée', () => {
    expect(taskSegment('Plans · Coupes · Façades (cartouche autorisation)')).toBe(
      'PLANS-COUPES-FACADES-CARTOUCHE-AUTORISAT',
    );
    expect(taskSegment('Électricité : prises, interrupteurs')).toBe('ELECTRICITE-PRISES-INTERRUPTEURS');
  });
});
