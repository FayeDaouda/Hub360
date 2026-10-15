import {
  base32,
  chiffrerSecret,
  codeAuPas,
  dechiffrerSecret,
  genererCodesSecours,
  hacherCodeSecours,
  pasCourant,
  verifierCode,
} from './totp';

// Secret de la RFC 6238 (annexe B, SHA-1) : « 12345678901234567890 ».
const SECRET_RFC = base32(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('vecteur RFC à t=%i → %s', (t, attendu) => {
    expect(codeAuPas(SECRET_RFC, Math.floor(t / 30))).toBe(attendu);
  });

  it('accepte le pas voisin (horloge du téléphone), refuse le rejeu', () => {
    const t = 1_111_111_111_000;
    const code = codeAuPas(SECRET_RFC, pasCourant(t) - 1);
    const pas = verifierCode(SECRET_RFC, code, null, t);
    expect(pas).toBe(pasCourant(t) - 1);
    expect(verifierCode(SECRET_RFC, code, pas, t)).toBeNull();
    expect(verifierCode(SECRET_RFC, '000000', null, t)).toBeNull();
    expect(verifierCode(SECRET_RFC, '12345', null, t)).toBeNull();
  });

  it('secret chiffré au repos, illisible s’il est altéré', () => {
    const c = chiffrerSecret(SECRET_RFC);
    expect(c).not.toContain(SECRET_RFC);
    expect(dechiffrerSecret(c)).toBe(SECRET_RFC);
    expect(dechiffrerSecret(c.slice(0, -2) + 'AA')).toBeNull();
  });

  it('codes de secours : 8 codes distincts, hachés sans tenir compte de la casse ni du tiret', () => {
    const { clairs, hashes } = genererCodesSecours();
    expect(new Set(clairs).size).toBe(8);
    expect(clairs[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hacherCodeSecours(clairs[0].toLowerCase().replace('-', ' '))).toBe(hashes[0]);
  });
});
