import {
  codeAvecVariante,
  genererCodeDossier,
  normaliserSigle,
} from './nomenclature';

// Nomenclature CLIENT_LOC.AA — miroir de frontend/lib/nomenclature.ts.
// On couvre la règle validée (initiales sans plafond, raison sociale ou sigle
// antérieur pour une personne morale, code localité, suffixe -2) et les
// entrées « pénibles » : la fonction ne plante jamais, elle renvoie '' quand
// une information manque.

const A2026 = new Date('2026-06-15T00:00:00Z');

describe('genererCodeDossier', () => {
  it('particulier : initiale de chaque mot, dans l’ordre saisi', () => {
    expect(
      genererCodeDossier({ nom: 'Daouda Faye Sow', type: 'particulier' }, 'ALM', A2026),
    ).toBe('DFS_ALM.26');
  });

  it('particulier : pas de plafond sur le nombre d’initiales', () => {
    expect(
      genererCodeDossier(
        { nom: 'Mame Diarra Bousso Ndiaye', type: 'particulier' },
        'POI',
        A2026,
      ),
    ).toBe('MDBN_POI.26');
  });

  it('particulier : un seul mot → ses 3 premières lettres', () => {
    expect(genererCodeDossier({ nom: 'Cheikh', type: 'particulier' }, 'NGO', A2026)).toBe(
      'CHE_NGO.26',
    );
    expect(genererCodeDossier({ nom: 'Bâ', type: 'particulier' }, 'NGO', A2026)).toBe(
      'BA_NGO.26',
    );
  });

  it('couple : titres et « et » ignorés, mot restant → 3 lettres', () => {
    expect(
      genererCodeDossier({ nom: 'M. et Mme Diouf', type: 'particulier' }, 'NGO', A2026),
    ).toBe('DIO_NGO.26');
    expect(
      genererCodeDossier({ nom: 'Awa et Moussa Diouf', type: 'particulier' }, 'NGO', A2026),
    ).toBe('AMD_NGO.26');
    expect(
      genererCodeDossier({ nom: 'Famille Ndiaye', type: 'particulier' }, 'NGO', A2026),
    ).toBe('NDI_NGO.26');
  });

  it('titres courts et longs ignorés, avec ou sans point ni accent', () => {
    expect(genererCodeDossier({ nom: 'Dr Fatou Sarr', type: 'particulier' }, 'YOF', A2026)).toBe(
      'FS_YOF.26',
    );
    expect(
      genererCodeDossier({ nom: 'Maître Aliou Ba', type: 'particulier' }, 'YOF', A2026),
    ).toBe('AB_YOF.26');
    expect(
      genererCodeDossier(
        { nom: 'Monsieur & Madame Fall', type: 'particulier' },
        'YOF',
        A2026,
      ),
    ).toBe('FAL_YOF.26');
    expect(genererCodeDossier({ nom: 'Me Awa Sy', type: 'particulier' }, 'YOF', A2026)).toBe(
      'AS_YOF.26',
    );
  });

  it('nom fait uniquement de titres → on garde tout plutôt que bloquer', () => {
    expect(genererCodeDossier({ nom: 'Monsieur', type: 'particulier' }, 'YOF', A2026)).toBe(
      'MON_YOF.26',
    );
  });

  it('accents, traits d’union et apostrophes séparent les mots', () => {
    expect(
      genererCodeDossier({ nom: 'Élodie Ndèye-Anta', type: 'particulier' }, 'SAC', A2026),
    ).toBe('ENA_SAC.26');
  });

  it('personne morale antérieure : son sigle reste son segment', () => {
    expect(
      genererCodeDossier(
        { nom: 'Teranga Capital', type: 'entreprise', sigle: 'TERANGA' },
        'ALM',
        A2026,
      ),
    ).toBe('TERANGA_ALM.26');
    expect(
      genererCodeDossier({ nom: 'SCI Ndiaye Frères', type: 'sci', sigle: 's.n.f' }, 'YOF', A2026),
    ).toBe('SNF_YOF.26');
  });

  it('personne morale sans sigle : initiales de la raison sociale', () => {
    expect(
      genererCodeDossier({ nom: 'Teranga Capital', type: 'entreprise', sigle: null }, 'ALM', A2026),
    ).toBe('TC_ALM.26');
    expect(
      genererCodeDossier({ nom: 'Société de Construction du Sénégal', type: 'entreprise' }, 'POI', A2026),
    ).toBe('SCS_POI.26');
  });

  it('personne morale : forme juridique et mots de liaison ignorés', () => {
    // Exemple de la maquette : il ne reste qu'un mot → ses 3 premières lettres.
    expect(genererCodeDossier({ nom: 'SCI Les Filaos', type: 'sci' }, 'ALM', A2026)).toBe(
      'FIL_ALM.26',
    );
    expect(
      genererCodeDossier({ nom: 'Teranga Capital SA', type: 'entreprise' }, 'NGO', A2026),
    ).toBe('TC_NGO.26');
    expect(
      genererCodeDossier({ nom: 'Fall & Fils SARL', type: 'entreprise' }, 'YOF', A2026),
    ).toBe('FF_YOF.26');
    expect(
      genererCodeDossier({ nom: "Groupe d'Études et de Conseil", type: 'entreprise' }, 'SAC', A2026),
    ).toBe('GEC_SAC.26');
  });

  it('personne morale : forme juridique pointée = un seul mot ignoré', () => {
    expect(
      genererCodeDossier({ nom: 'S.A.R.L. Teranga Capital', type: 'entreprise' }, 'ALM', A2026),
    ).toBe('TC_ALM.26');
  });

  it('raison sociale faite uniquement de mots ignorés → on garde tout', () => {
    expect(genererCodeDossier({ nom: 'SARL', type: 'entreprise' }, 'ALM', A2026)).toBe(
      'SAR_ALM.26',
    );
  });

  it('nom ou localité manquants → vide, ne plante pas', () => {
    expect(genererCodeDossier({ nom: '', type: 'particulier' }, 'ALM', A2026)).toBe('');
    expect(genererCodeDossier({ nom: 'Awa Sow', type: 'particulier' }, '', A2026)).toBe('');
  });

  it('année : 2 derniers chiffres', () => {
    expect(
      genererCodeDossier(
        { nom: 'Awa Sow', type: 'particulier' },
        'YOF',
        new Date('2019-03-01T00:00:00Z'),
      ),
    ).toBe('AS_YOF.19');
  });
});

describe('normaliserSigle', () => {
  it('majuscules, sans accents ni ponctuation', () => {
    expect(normaliserSigle(' Téranga-Cap. ')).toBe('TERANGACAP');
    expect(normaliserSigle('...')).toBe('');
  });
});

describe('codeAvecVariante', () => {
  it('base libre → base inchangée', () => {
    expect(codeAvecVariante('DF_POI.26', new Set())).toBe('DF_POI.26');
  });

  it('base prise → suffixe -2 en toute fin', () => {
    expect(codeAvecVariante('DF_POI.26', new Set(['DF_POI.26']))).toBe('DF_POI.26-2');
  });

  it('base et -2 pris → -3', () => {
    expect(
      codeAvecVariante('DF_POI.26', new Set(['DF_POI.26', 'DF_POI.26-2'])),
    ).toBe('DF_POI.26-3');
  });
});
