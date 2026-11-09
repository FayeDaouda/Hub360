import { describe, expect, it } from 'vitest';
import { completudeFiche } from './crm';
import type { Projet } from './types';

// Complétude d'une fiche CRM (registre) : 9 champs depuis le 09/11/2026 — le
// type de projet n'y compte plus (remplacé par la forme bâtie du programme).
const complete = {
  code: 'CM_YOF.26',
  categorie: 'conception',
  localite: { id: 'L1', code: 'YOF', nom: 'Yoff' },
  type: null,
  surfaceTerrain: 350,
  nbPlanches: 2,
  client: { id: 'C1', nom: 'X', type: 'particulier' },
  standing: 'moyen',
  gamme: 'milieu',
  programme: 'Local commercial R+1 · 2 commerces',
} as unknown as Projet;

describe('complétude de la fiche CRM', () => {
  it('fiche remplie sans type de projet : 9/9, rien ne manque', () => {
    expect(completudeFiche(complete)).toEqual({ faits: 9, total: 9, manquants: [] });
  });

  it('le type de projet d’un dossier antérieur ne change pas le compte', () => {
    expect(completudeFiche({ ...complete, type: 'villa' })).toEqual({ faits: 9, total: 9, manquants: [] });
  });

  it('ne cite jamais le type de projet parmi les champs manquants', () => {
    const vide = {
      ...complete,
      code: '',
      categorie: null,
      localite: null,
      surfaceTerrain: 0,
      nbPlanches: 0,
      client: null,
      standing: null,
      gamme: null,
      programme: '  ',
    } as unknown as Projet;
    const r = completudeFiche(vide);
    expect(r).toEqual({
      faits: 0,
      total: 9,
      manquants: [
        'code projet',
        'catégorie',
        'localisation',
        'surface du terrain',
        'n° de planches',
        'client',
        'standing',
        'gamme',
        'programme',
      ],
    });
    expect(r.manquants).not.toContain('type de projet');
  });

  it('liste les champs manquants dans l’ordre de la fiche', () => {
    expect(completudeFiche({ ...complete, nbPlanches: 0, gamme: null })).toEqual({
      faits: 7,
      total: 9,
      manquants: ['n° de planches', 'gamme'],
    });
  });
});
