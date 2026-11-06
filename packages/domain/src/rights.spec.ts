import { describe, expect, it } from 'vitest';
import {
  ALL_RIGHTS,
  NO_RIGHTS,
  decodeRights,
  describeRightsChange,
  encodeRights,
  hasRight,
  normalizeRights,
} from './rights';

describe('codage des droits', () => {
  it('aller-retour, toujours dans l’ordre L, E, V, S', () => {
    expect(encodeRights({ lecture: true, ecriture: false, validation: true, suppression: true })).toBe('LVS');
    expect(decodeRights('SVL')).toEqual({ lecture: true, ecriture: false, validation: true, suppression: true });
    expect(encodeRights(NO_RIGHTS)).toBe('');
  });

  it('lit les anciens niveaux comme la migration les a convertis', () => {
    expect(encodeRights(decodeRights('aucun'))).toBe('');
    expect(encodeRights(decodeRights('lecture'))).toBe('L');
    expect(encodeRights(decodeRights('ecriture'))).toBe('LES');
    expect(encodeRights(decodeRights('validation'))).toBe('LEVS');
  });
});

describe('hasRight', () => {
  it('droits indépendants : la validation ne donne pas l’écriture', () => {
    const p = { crm: 'LV' };
    expect(hasRight(p, 'crm', 'validation')).toBe(true);
    expect(hasRight(p, 'crm', 'ecriture')).toBe(false);
  });

  it('étape absente = aucun droit ; « aucun » n’exige rien', () => {
    expect(hasRight({}, 'crm', 'lecture')).toBe(false);
    expect(hasRight(undefined, 'crm', 'lecture')).toBe(false);
    expect(hasRight({}, 'crm', 'aucun')).toBe(true);
  });
});

describe('normalizeRights', () => {
  it('agir donne la lecture', () => {
    expect(normalizeRights({ ...NO_RIGHTS, suppression: true })).toEqual({
      ...NO_RIGHTS,
      lecture: true,
      suppression: true,
    });
  });

  it('un droit sans objet n’est jamais accordé', () => {
    expect(normalizeRights(ALL_RIGHTS, { ...ALL_RIGHTS, validation: false })).toEqual({
      ...ALL_RIGHTS,
      validation: false,
    });
  });
});

it('décrit le changement', () => {
  expect(describeRightsChange(decodeRights('LS'), decodeRights('LE'))).toBe('Écriture ajoutée, Suppression retirée');
  expect(describeRightsChange(decodeRights('L'), decodeRights('L'))).toBe('');
});
