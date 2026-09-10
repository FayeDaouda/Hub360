import { codeAvecVariante, genererCodeDossier } from './nomenclature';

// Nomenclature XX_YY.ZZ — miroir de frontend/lib/nomenclature.ts.
// On couvre le cas normal + les entrées « pénibles » (accents, mot unique,
// vide, virgules) : la fonction ne doit jamais planter ni produire un code
// dégénéré, elle retombe sur des sentinelles (XX / X).

const A2026 = new Date('2026-06-15T00:00:00Z');

describe('genererCodeDossier', () => {
  it('particulier : initiale de chaque mot du nom', () => {
    expect(
      genererCodeDossier({ nom: 'Daouda Faye', type: 'particulier' }, 'Point E, Dakar', A2026),
    ).toBe('DF_PE.26');
  });

  it('entreprise / SCI : 2 premières lettres du nom', () => {
    expect(
      genererCodeDossier(
        { nom: 'Teranga Capital', type: 'entreprise' },
        'Almadies',
        A2026,
      ),
    ).toBe('TE_A.26');
    expect(
      genererCodeDossier({ nom: 'SCI Ndiaye Frères', type: 'sci' }, 'Yoff', A2026),
    ).toBe('SC_Y.26');
  });

  it('particulier avec un seul mot : ses 2 premières lettres', () => {
    expect(
      genererCodeDossier({ nom: 'Cheikh', type: 'particulier' }, 'Ngor', A2026),
    ).toBe('CH_N.26');
  });

  it('accents et traits d’union normalisés', () => {
    expect(
      genererCodeDossier(
        { nom: 'Amélie Ndèye', type: 'particulier' },
        'Sacré-Cœur, Dakar',
        A2026,
      ),
    ).toBe('AN_SC.26');
  });

  it('quartier = partie avant la première virgule', () => {
    expect(
      genererCodeDossier(
        { nom: 'Awa Sow', type: 'particulier' },
        'Ngor, Almadies, Dakar',
        A2026,
      ),
    ).toBe('AS_N.26');
  });

  it('entrées vides : retombe sur XX / X, ne plante pas', () => {
    expect(genererCodeDossier({ nom: '', type: 'particulier' }, '', A2026)).toBe(
      'XX_X.26',
    );
  });

  it('année : 2 derniers chiffres', () => {
    expect(
      genererCodeDossier(
        { nom: 'Awa Sow', type: 'particulier' },
        'Yoff',
        new Date('2019-03-01T00:00:00Z'),
      ),
    ).toBe('AS_Y.19');
  });
});

describe('codeAvecVariante', () => {
  it('base libre → base inchangée', () => {
    expect(codeAvecVariante('DF_PE.26', new Set())).toBe('DF_PE.26');
  });

  it('base prise → suffixe V2', () => {
    expect(codeAvecVariante('DF_PE.26', new Set(['DF_PE.26']))).toBe('DF_PE.26 V2');
  });

  it('incrémente jusqu’à la première variante libre', () => {
    expect(
      codeAvecVariante(
        'DF_PE.26',
        new Set(['DF_PE.26', 'DF_PE.26 V2', 'DF_PE.26 V3']),
      ),
    ).toBe('DF_PE.26 V4');
  });
});
