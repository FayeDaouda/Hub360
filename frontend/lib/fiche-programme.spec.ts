import { describe, expect, it } from 'vitest';
import {
  avecComposition,
  FICHE_VIDE,
  libelleOuvrage,
  planchesCalculees,
  programmeComplet,
  type FicheProgramme,
} from './fiche-programme';

// Fiche Programme côté front (miroir de backend/src/crm/fiche-programme.ts) :
// formes « local commercial » et « équipement » ajoutées le 09/11/2026,
// décrites niveau par niveau comme l'immeuble ; seule la villa a sa branche.
const fiche = (o: Partial<FicheProgramme> = {}): FicheProgramme => ({ ...FICHE_VIDE, ...o });
const localCommercial = (o: Partial<FicheProgramme> = {}) =>
  fiche({
    usage: 'commercial',
    forme: 'local_commercial',
    gabarit: 1,
    composition: [
      { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 2 },
      { de: 1, a: 1, usage: 'bureaux', typologie: '', nb: 1 },
    ],
    ...o,
  });
const equipement = (o: Partial<FicheProgramme> = {}) =>
  fiche({
    usage: 'bureau',
    forme: 'equipement',
    gabarit: 0,
    composition: [{ de: 0, a: 0, usage: 'bureaux', typologie: '', nb: 3 }],
    ...o,
  });

describe('Fiche Programme · branche suivie selon la forme', () => {
  it('seule la villa n’est pas décrite niveau par niveau', () => {
    expect(avecComposition('villa')).toBe(false);
    expect(avecComposition(null)).toBe(false);
    expect(avecComposition('immeuble')).toBe(true);
    expect(avecComposition('local_commercial')).toBe(true);
    expect(avecComposition('equipement')).toBe(true);
  });
});

describe('Fiche Programme · programme complet et planches des nouvelles formes', () => {
  it('local commercial et équipement entièrement décrits : programme complet', () => {
    expect(programmeComplet(localCommercial())).toBe(true);
    expect(programmeComplet(equipement())).toBe(true);
  });

  it('incomplet sans composition, avec un niveau oublié ou décrit deux fois', () => {
    expect(programmeComplet(localCommercial({ composition: [] }))).toBe(false);
    expect(programmeComplet(localCommercial({ composition: localCommercial().composition.slice(0, 1) }))).toBe(false);
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
  });

  it('incomplet sans usage, ou quand une ligne de niveau n’a pas d’usage', () => {
    expect(programmeComplet(equipement({ usage: null }))).toBe(false);
    expect(programmeComplet(equipement({ composition: [{ de: 0, a: 0, usage: null, typologie: '', nb: 1 }] }))).toBe(
      false,
    );
  });

  it('une typologie de villa ne suffit pas hors villa', () => {
    expect(programmeComplet(localCommercial({ composition: [], typologieVilla: 'F5' }))).toBe(false);
  });

  it('planches : une par ligne de composition une fois le programme complet', () => {
    expect(planchesCalculees(localCommercial())).toBe(2);
    expect(planchesCalculees(equipement())).toBe(1);
  });

  it('planches non calculables (saisie manuelle) tant que la composition est incomplète', () => {
    expect(planchesCalculees(localCommercial({ composition: [] }))).toBeNull();
    expect(planchesCalculees(equipement({ usage: null }))).toBeNull();
    expect(planchesCalculees(FICHE_VIDE)).toBeNull();
  });

  it('villa inchangée : RDC + étages + sous-sols', () => {
    expect(planchesCalculees(fiche({ usage: 'residentiel', forme: 'villa', gabarit: 2, sousSols: 1 }))).toBe(4);
  });
});

describe('Nature de l’ouvrage affichée (libelleOuvrage)', () => {
  it('affiche la forme bâtie quand elle est choisie', () => {
    expect(libelleOuvrage('local_commercial', null)).toBe('Local commercial');
    expect(libelleOuvrage('equipement', undefined)).toBe('Équipement');
    expect(libelleOuvrage('villa', null)).toBe('Villa');
  });

  it('le type d’un dossier antérieur prime : une facture émise garde sa désignation', () => {
    expect(libelleOuvrage('immeuble', 'immeuble_bureaux')).toBe('Immeuble de bureaux');
  });

  it('à défaut de forme, reprend le type de projet d’un dossier antérieur', () => {
    expect(libelleOuvrage(null, 'hotelier')).toBe('Hôtelier');
    expect(libelleOuvrage(undefined, 'immeuble_mixte')).toBe('Immeuble mixte');
  });

  it('null quand ni forme ni type ne sont renseignés', () => {
    expect(libelleOuvrage(null, null)).toBeNull();
    expect(libelleOuvrage(undefined, undefined)).toBeNull();
  });
});
