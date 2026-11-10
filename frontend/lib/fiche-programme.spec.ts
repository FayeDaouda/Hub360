import { describe, expect, it } from 'vitest';
import {
  avecComposition,
  FICHE_VIDE,
  libelleOuvrage,
  planchesCalculees,
  programmeComplet,
  TYPES_PROJET,
  USAGE_LIBRE_MAX,
  USAGES_PAR_TYPE,
  type FicheProgramme,
} from './fiche-programme';

// Fiche Programme côté front (miroir de backend/src/crm/fiche-programme.ts) :
// formes « local commercial » et « équipement » ajoutées le 09/11/2026,
// décrites niveau par niveau comme l'immeuble ; seule la villa a sa branche.
const fiche = (o: Partial<FicheProgramme> = {}): FicheProgramme => ({ ...FICHE_VIDE, ...o });
const localCommercial = (o: Partial<FicheProgramme> = {}) =>
  fiche({
    typeProjet: 'commercial',
    usage: 'commerces',
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
    typeProjet: 'commercial',
    usage: 'bureaux',
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
    expect(planchesCalculees(FICHE_VIDE)).toBeNull();
    // Type et usage ne comptent pas : seul le bâtiment fixe les planches (le prix).
    expect(planchesCalculees(equipement({ usage: null, typeProjet: null }))).toBe(1);
  });

  it('villa inchangée : RDC + étages + sous-sols', () => {
    expect(
      planchesCalculees(
        fiche({ typeProjet: 'residentiel', usage: 'maisons_individuelles', forme: 'villa', gabarit: 2, sousSols: 1 }),
      ),
    ).toBe(4);
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

// Parité avec le serveur (backend/src/crm/fiche-programme.ts, USAGES_PAR_TYPE) :
// les clés envoyées doivent être celles que normaliserFiche accepte, sinon
// l'enregistrement est refusé (400). Liste recopiée du serveur : la changer
// des deux côtés à la fois.
const USAGES_SERVEUR: Record<string, string[]> = {
  residentiel: ['maisons_individuelles', 'logements_collectifs', 'immeubles_habitation', 'residences'],
  commercial: ['bureaux', 'commerces', 'centres_commerciaux', 'hotels', 'restaurants'],
  industriel: ['usines', 'entrepots', 'ateliers', 'centres_logistiques'],
  institutionnel: ['ecoles', 'universites', 'hopitaux', 'administrations', 'tribunaux'],
  culturel: ['musees', 'theatres', 'bibliotheques', 'stades', 'salles_sport'],
  religieux: ['eglises', 'mosquees', 'temples', 'synagogues'],
  transport: ['gares', 'aeroports', 'ports', 'parkings'],
  agricole: ['hangars', 'etables', 'serres', 'silos'],
};

describe('Fiche Programme · type de projet et usage, parité avec le serveur', () => {
  it('propose les 9 types du serveur, Mixte compris', () => {
    expect(Object.keys(TYPES_PROJET).sort()).toEqual([...Object.keys(USAGES_SERVEUR), 'mixte'].sort());
  });

  it('les clés d’usage de chaque type sont exactement celles du serveur, dans le même ordre', () => {
    expect(Object.keys(USAGES_PAR_TYPE).sort()).toEqual(Object.keys(USAGES_SERVEUR).sort());
    for (const [type, cles] of Object.entries(USAGES_SERVEUR)) {
      expect(Object.keys(USAGES_PAR_TYPE[type as keyof typeof USAGES_PAR_TYPE])).toEqual(cles);
    }
  });

  it('chaque type et chaque usage a un libellé affichable', () => {
    for (const libelle of Object.values(TYPES_PROJET)) expect(libelle.trim()).not.toBe('');
    for (const usages of Object.values(USAGES_PAR_TYPE)) {
      for (const libelle of Object.values(usages)) expect(libelle.trim()).not.toBe('');
    }
  });

  it('Mixte n’a pas de liste (usage écrit à la main, même plafond de 120 caractères que le serveur)', () => {
    expect(USAGES_PAR_TYPE).not.toHaveProperty('mixte');
    expect(USAGE_LIBRE_MAX).toBe(120);
  });

  it('type et usage exigés pour un programme complet', () => {
    const villa = fiche({ forme: 'villa', typologieVilla: 'F5' });
    expect(programmeComplet({ ...villa, typeProjet: 'religieux', usage: 'mosquees' })).toBe(true);
    expect(programmeComplet({ ...villa, typeProjet: 'mixte', usage: 'Logements et bureaux' })).toBe(true);
    expect(programmeComplet({ ...villa, typeProjet: 'religieux', usage: null })).toBe(false);
    expect(programmeComplet({ ...villa, typeProjet: null, usage: null })).toBe(false);
  });
});
