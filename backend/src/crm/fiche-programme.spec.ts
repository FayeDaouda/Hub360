import {
  controleComposition,
  ErreurFicheProgramme,
  FICHE_VIDE,
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
