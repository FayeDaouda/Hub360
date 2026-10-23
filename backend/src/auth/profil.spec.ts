import { BadRequestException } from '@nestjs/common';
import { cheminPhoto, lirePhoto, nomPublic, normaliserNomAffiche } from './profil';

describe('profil utilisateur', () => {
  it('nom affiché si renseigné, nom officiel sinon', () => {
    expect(nomPublic({ prenom: 'Khadija', nom: 'Sow', nomAffiche: 'Kadi Sow' })).toBe('Kadi Sow');
    expect(nomPublic({ prenom: 'Khadija', nom: 'Sow', nomAffiche: '  ' })).toBe('Khadija Sow');
    expect(nomPublic({ prenom: 'Khadija', nom: 'Sow' })).toBe('Khadija Sow');
  });
  it('saisie du nom affiché : espaces normalisés, vide = null, bornes', () => {
    expect(normaliserNomAffiche('  Kadi   Sow ')).toBe('Kadi Sow');
    expect(normaliserNomAffiche('')).toBeNull();
    expect(() => normaliserNomAffiche('K')).toThrow(BadRequestException);
    expect(() => normaliserNomAffiche('x'.repeat(61))).toThrow(BadRequestException);
  });
  it('photo : types et poids bornés ; chemin public', () => {
    const p = lirePhoto(`data:image/webp;base64,${Buffer.from('abc').toString('base64')}`);
    expect(p.type).toBe('image/webp');
    expect(p.octets.toString()).toBe('abc');
    expect(() => lirePhoto('data:image/gif;base64,AAAA')).toThrow(BadRequestException);
    expect(() => lirePhoto(`data:image/png;base64,${Buffer.alloc(400_001).toString('base64')}`)).toThrow(BadRequestException);
    expect(cheminPhoto('abc')).toBe('/photos/abc');
    expect(cheminPhoto(null)).toBeNull();
  });
});
