import {
  avecComposition,
  controleComposition,
  ErreurFicheProgramme,
  FICHE_VIDE,
  formeDe,
  normaliserFiche,
  planchesCalculees,
  programmeComplet,
  resume,
  type FicheProgramme,
} from './fiche-programme';

const villa = (o: Partial<FicheProgramme> = {}): FicheProgramme => ({
  ...FICHE_VIDE,
  usage: 'residentiel',
  forme: 'villa',
  gabarit: 1,
  typologieVilla: 'F5',
  ...o,
});
const immeuble = (o: Partial<FicheProgramme> = {}): FicheProgramme => ({
  ...FICHE_VIDE,
  usage: 'mixte',
  forme: 'immeuble',
  gabarit: 4,
  sousSols: 1,
  composition: [
    { de: -1, a: -1, usage: 'parking', typologie: '', nb: 1 },
    { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 2 },
    { de: 1, a: 4, usage: 'logements', typologie: 'F3', nb: 4 },
  ],
  ...o,
});

describe('Fiche Programme · normalisation', () => {
  it('valeurs inconnues refusées ; branche inutile effacée', () => {
    expect(() => normaliserFiche({ forme: 'chateau' })).toThrow(ErreurFicheProgramme);
    expect(() => normaliserFiche({ gabarit: 16 })).toThrow('Gabarit');
    const f = normaliserFiche({
      forme: 'villa',
      typologieVilla: 'F4',
      composition: [{ de: 0, a: 1, usage: 'logements' }],
      commodites: ['piscine', 'inconnue', 'piscine'],
    });
    expect(f.composition).toEqual([]);
    expect(f.commodites).toEqual(['piscine']);
    const g = normaliserFiche({ forme: 'immeuble', typologieVilla: 'F4', suiteParentale: true, gabarit: 2 });
    expect(g.typologieVilla).toBeNull();
    expect(g.suiteParentale).toBe(false);
  });

  it('composition ramenée dans les niveaux existants (gabarit réduit)', () => {
    const f = normaliserFiche({
      forme: 'immeuble',
      gabarit: 2,
      composition: [
        { de: 1, a: 5, usage: 'logements', typologie: 'F3', nb: 2 },
        { de: 4, a: 5, usage: 'bureaux', nb: 1 },
      ],
    });
    expect(f.composition).toEqual([{ de: 1, a: 2, usage: 'logements', typologie: 'F3', nb: 2 }]);
  });
});

describe('Fiche Programme · composition, planches, résumé', () => {
  it('niveaux non décrits et décrits deux fois', () => {
    expect(
      controleComposition(immeuble({ composition: [{ de: 1, a: 4, usage: 'logements', typologie: 'F3', nb: 4 }] }))
        .nonDecrits,
    ).toEqual([-1, 0]);
    expect(
      controleComposition(
        immeuble({ composition: [...immeuble().composition, { de: 4, a: 4, usage: 'bureaux', typologie: '', nb: 1 }] }),
      ).enDouble,
    ).toEqual([4]);
  });

  it('programme complet : villa avec typologie ; immeuble entièrement décrit', () => {
    expect(programmeComplet(villa())).toBe(true);
    expect(programmeComplet(villa({ typologieVilla: null }))).toBe(false);
    expect(programmeComplet(immeuble())).toBe(true);
    expect(programmeComplet(immeuble({ composition: immeuble().composition.slice(1) }))).toBe(false);
    // Logements sans typologie : ligne incomplète.
    expect(
      programmeComplet(
        immeuble({
          composition: [
            { ...immeuble().composition[0] },
            { ...immeuble().composition[1] },
            { de: 1, a: 4, usage: 'logements', typologie: '', nb: 4 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('planches (hypothèse de travail) : villa = RDC + étages + sous-sols ; immeuble = lignes ; toiture non comptée', () => {
    expect(planchesCalculees(villa({ gabarit: 1, sousSols: 1, toitureTerrasse: true }))).toBe(3);
    expect(planchesCalculees(villa({ gabarit: 0 }))).toBe(1);
    expect(planchesCalculees(immeuble())).toBe(3);
    expect(planchesCalculees(immeuble({ composition: [] }))).toBeNull();
    expect(planchesCalculees(FICHE_VIDE)).toBeNull();
  });

  it('résumé automatique : vide tant que le programme n’est pas décrit', () => {
    expect(resume(villa({ typologieVilla: null }))).toBe('');
    expect(
      resume(villa({ suiteParentale: true, annexes: ['bureau', 'buanderie'], commodites: ['piscine', 'jardin'] })),
    ).toBe('Villa R+1 · F5 · suite parentale · bureau, buanderie · 2 commodités');
    expect(resume(immeuble({ toitureTerrasse: true }))).toBe(
      'Immeuble R+4 · 1 sous-sol · 16 logements (16 F3) · 1 parking · 2 commerces · toiture-terrasse accessible',
    );
  });
});

// Formes « local commercial » et « équipement », usage « bureau » (09/11/2026) :
// décrites niveau par niveau comme l'immeuble ; seule la villa a sa branche.
const localCommercial = (o: Partial<FicheProgramme> = {}): FicheProgramme => ({
  ...FICHE_VIDE,
  usage: 'commercial',
  forme: 'local_commercial',
  gabarit: 1,
  composition: [{ de: 0, a: 1, usage: 'commerce', typologie: '', nb: 1 }],
  ...o,
});
const equipement = (o: Partial<FicheProgramme> = {}): FicheProgramme => ({
  ...FICHE_VIDE,
  usage: 'bureau',
  forme: 'equipement',
  gabarit: 0,
  composition: [{ de: 0, a: 0, usage: 'bureaux', typologie: '', nb: 3 }],
  ...o,
});

describe('Fiche Programme · nouvelles formes (local commercial, équipement) et usage bureau', () => {
  it('seule la villa n’est pas décrite niveau par niveau', () => {
    expect(avecComposition('villa')).toBe(false);
    expect(avecComposition(null)).toBe(false);
    expect(avecComposition('immeuble')).toBe(true);
    expect(avecComposition('local_commercial')).toBe(true);
    expect(avecComposition('equipement')).toBe(true);
  });

  it('accepte l’usage bureau et les formes local commercial et équipement', () => {
    expect(normaliserFiche({ usage: 'bureau', forme: 'local_commercial' })).toMatchObject({
      usage: 'bureau',
      forme: 'local_commercial',
    });
    expect(normaliserFiche({ forme: 'equipement' }).forme).toBe('equipement');
  });

  it('refuse une forme inconnue (« hotelier », ancien type de projet)', () => {
    expect(() => normaliserFiche({ forme: 'hotelier' })).toThrow(ErreurFicheProgramme);
    expect(() => normaliserFiche({ forme: 'hotelier' })).toThrow('Forme bâtie');
  });

  it('refuse un usage inconnu', () => {
    expect(() => normaliserFiche({ usage: 'industriel' })).toThrow('Usage');
  });

  it('garde la composition d’un local commercial et d’un équipement, ramenée dans les niveaux existants', () => {
    const composition = [
      { de: 0, a: 0, usage: 'commerce', nb: 2 },
      { de: 1, a: 4, usage: 'bureaux', nb: 1 },
    ];
    for (const forme of ['local_commercial', 'equipement']) {
      expect(normaliserFiche({ forme, gabarit: 1, composition }).composition).toEqual([
        { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 2 },
        { de: 1, a: 1, usage: 'bureaux', typologie: '', nb: 1 },
      ]);
    }
  });

  it('efface la composition d’une villa et la typologie de villa hors villa', () => {
    const composition = [{ de: 0, a: 0, usage: 'commerce', nb: 1 }];
    expect(normaliserFiche({ forme: 'villa', typologieVilla: 'F4', composition }).composition).toEqual([]);
    for (const forme of ['local_commercial', 'equipement']) {
      const f = normaliserFiche({
        forme,
        typologieVilla: 'F4',
        suiteParentale: true,
        annexes: ['bureau'],
        composition,
      });
      expect(f.typologieVilla).toBeNull();
      expect(f.suiteParentale).toBe(false);
      expect(f.annexes).toEqual([]);
      expect(f.composition).toHaveLength(1);
    }
  });

  it('refuse un usage de niveau inconnu dans la composition d’un local commercial', () => {
    expect(() =>
      normaliserFiche({ forme: 'local_commercial', composition: [{ de: 0, a: 0, usage: 'atelier' }] }),
    ).toThrow('Composition · usage');
  });

  it('programme complet : composition entièrement décrite, comme l’immeuble', () => {
    expect(programmeComplet(localCommercial())).toBe(true);
    expect(programmeComplet(equipement())).toBe(true);
    // Sans composition, ou avec un niveau oublié : incomplet.
    expect(programmeComplet(localCommercial({ composition: [] }))).toBe(false);
    expect(
      programmeComplet(localCommercial({ composition: [{ de: 0, a: 0, usage: 'commerce', typologie: '', nb: 1 }] })),
    ).toBe(false);
    // Niveau décrit deux fois : incomplet.
    expect(
      programmeComplet(
        equipement({
          composition: [
            { de: 0, a: 0, usage: 'bureaux', typologie: '', nb: 1 },
            { de: 0, a: 0, usage: 'parking', typologie: '', nb: 1 },
          ],
        }),
      ),
    ).toBe(false);
    // Usage ou forme manquant : incomplet.
    expect(programmeComplet(equipement({ usage: null }))).toBe(false);
    // Une typologie de villa ne suffit pas hors villa.
    expect(programmeComplet(localCommercial({ composition: [], typologieVilla: 'F5' }))).toBe(false);
  });

  it('planches : une par ligne de composition une fois le programme complet, sinon null', () => {
    expect(planchesCalculees(localCommercial())).toBe(1);
    expect(
      planchesCalculees(
        localCommercial({
          composition: [
            { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 2 },
            { de: 1, a: 1, usage: 'bureaux', typologie: '', nb: 1 },
          ],
        }),
      ),
    ).toBe(2);
    expect(planchesCalculees(equipement())).toBe(1);
    expect(planchesCalculees(localCommercial({ composition: [] }))).toBeNull();
    expect(planchesCalculees(equipement({ usage: null }))).toBeNull();
  });

  it('résumé : libellé de la forme, hauteur, puis les totaux de la composition', () => {
    expect(
      resume(
        localCommercial({
          composition: [
            { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 2 },
            { de: 1, a: 1, usage: 'bureaux', typologie: '', nb: 1 },
          ],
        }),
      ),
    ).toBe('Local commercial R+1 · 2 commerces · 1 bureau');
    expect(resume(localCommercial({ composition: [{ de: 0, a: 1, usage: 'commerce', typologie: '', nb: 1 }] }))).toBe(
      'Local commercial R+1 · 2 commerces',
    );
    expect(resume(equipement({ commodites: ['ascenseur'] }))).toBe('Équipement plain-pied · 3 bureaux · 1 commodité');
    expect(resume(equipement({ usage: null }))).toBe('');
  });
});

describe('Fiche Programme · forme lue dans un JSON enregistré (formeDe)', () => {
  it('null pour une fiche absente ou qui n’est pas un objet', () => {
    expect(formeDe(null)).toBeNull();
    expect(formeDe(undefined)).toBeNull();
    expect(formeDe('villa')).toBeNull();
    expect(formeDe(42)).toBeNull();
  });

  it('null pour une fiche sans forme, ou une forme inconnue ou mal typée', () => {
    expect(formeDe({})).toBeNull();
    expect(formeDe({ forme: null })).toBeNull();
    expect(formeDe({ forme: 'hotelier' })).toBeNull();
    expect(formeDe({ forme: 1 })).toBeNull();
    expect(formeDe({ forme: 'VILLA' })).toBeNull();
  });

  it('la forme quand elle est connue', () => {
    expect(formeDe({ forme: 'villa' })).toBe('villa');
    expect(formeDe({ forme: 'immeuble', gabarit: 3 })).toBe('immeuble');
    expect(formeDe({ forme: 'local_commercial' })).toBe('local_commercial');
    expect(formeDe({ forme: 'equipement' })).toBe('equipement');
  });
});
