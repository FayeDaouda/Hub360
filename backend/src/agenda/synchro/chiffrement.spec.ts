import { randomBytes } from 'crypto';
import { chiffrer, cleChiffrement, dechiffrer } from './chiffrement';

// Chiffrement des accès aux agendas externes (16/11/2026).
const CLE = randomBytes(32);

describe('chiffrement des accès', () => {
  it('aller-retour ; deux chiffrements du même texte diffèrent (IV aléatoire)', () => {
    const a = chiffrer('1//jeton-de-rafraichissement', CLE);
    expect(dechiffrer(a, CLE)).toBe('1//jeton-de-rafraichissement');
    expect(chiffrer('1//jeton-de-rafraichissement', CLE)).not.toBe(a);
    expect(a).not.toContain('jeton');
  });

  it('un contenu altéré ou une autre clé : refusé', () => {
    const a = chiffrer('secret', CLE);
    const [v, iv, tag, d] = a.split('.');
    const altere = [v, iv, tag, Buffer.from('autre').toString('base64url')].join('.');
    expect(() => dechiffrer(altere, CLE)).toThrow();
    expect(() => dechiffrer(a, randomBytes(32))).toThrow();
    expect(() => dechiffrer('v0.x.y.z', CLE)).toThrow('illisible');
    expect(d).toBeTruthy();
  });

  it('la clé : 32 octets en base64, sinon pas de synchronisation', () => {
    expect(cleChiffrement({ AGENDA_CLE_CHIFFREMENT: CLE.toString('base64') })?.length).toBe(32);
    expect(cleChiffrement({ AGENDA_CLE_CHIFFREMENT: Buffer.alloc(16).toString('base64') })).toBeNull();
    expect(cleChiffrement({})).toBeNull();
  });
});
