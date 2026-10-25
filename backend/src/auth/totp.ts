import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Double authentification par application (Google Authenticator, Microsoft
// Authenticator…) : TOTP RFC 6238 — HMAC-SHA1, pas de 30 s, 6 chiffres —
// écrit ici plutôt qu'une dépendance : quelques lignes, vérifiées sur les
// vecteurs de la RFC (totp.spec.ts).

export const PAS_SECONDES = 30;
// Tolérance d'horloge du téléphone : un pas avant ou après.
const FENETRE = 1;
const ALPHABET_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(octets: Buffer): string {
  let bits = 0;
  let valeur = 0;
  let sortie = '';
  for (const o of octets) {
    valeur = (valeur << 8) | o;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET_BASE32[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET_BASE32[(valeur << (5 - bits)) & 31];
  return sortie;
}

function depuisBase32(texte: string): Buffer {
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const c of texte.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET_BASE32.indexOf(c);
    if (i < 0) throw new Error('Secret base32 invalide');
    valeur = (valeur << 5) | i;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

// 160 bits d'aléa, la taille recommandée pour HMAC-SHA1.
export const genererSecret = () => base32(randomBytes(20));

export function codeAuPas(secret: string, pas: number, chiffres = 6): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const h = createHmac('sha1', depuisBase32(secret)).update(compteur).digest();
  const decalage = h[h.length - 1] & 15;
  const n = h.readUInt32BE(decalage) & 0x7fffffff;
  return String(n % 10 ** chiffres).padStart(chiffres, '0');
}

export const pasCourant = (maintenant = Date.now()) => Math.floor(maintenant / 1000 / PAS_SECONDES);

// Pas accepté (à mémoriser : un code ne sert qu'une fois), ou null.
export function verifierCode(
  secret: string,
  code: string,
  dernierPas: number | null,
  maintenant = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const courant = pasCourant(maintenant);
  for (let d = -FENETRE; d <= FENETRE; d++) {
    const pas = courant + d;
    if (dernierPas !== null && pas <= dernierPas) continue;
    if (timingSafeEqual(Buffer.from(codeAuPas(secret, pas)), Buffer.from(code))) return pas;
  }
  return null;
}

export const lienOtpauth = (secret: string, compte: string, emetteur = 'HUB 360') =>
  `otpauth://totp/${encodeURIComponent(`${emetteur}:${compte}`)}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=6&period=${PAS_SECONDES}`;

// --- Secret chiffré au repos ---------------------------------------------------
// Clé dérivée du secret JWT du serveur : une fuite de la base seule ne livre
// pas les secrets. Changer JWT_SECRET oblige chacun à réactiver son
// application (la connexion le propose d'elle-même).
const cle = () =>
  createHash('sha256')
    .update(`totp:${process.env.JWT_SECRET || 'change-moi-en-production'}`)
    .digest();

export function chiffrerSecret(secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle(), iv);
  const chiffre = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), chiffre].map((b) => b.toString('base64url')).join('.');
}

export function dechiffrerSecret(stocke: string): string | null {
  try {
    const [iv, tag, chiffre] = stocke.split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = createDecipheriv('aes-256-gcm', cle(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(chiffre), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// --- Codes de secours (téléphone perdu) ------------------------------------------
// 8 codes « XXXX-XXXX » à usage unique ; seul leur SHA-256 est stocké.
export const NB_CODES_SECOURS = 8;
const ALPHABET_SECOURS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/I

export const normaliserCodeSecours = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hacherCodeSecours = (code: string) =>
  createHash('sha256').update(normaliserCodeSecours(code)).digest('hex');

export function genererCodesSecours(): { clairs: string[]; hashes: string[] } {
  const clairs = Array.from({ length: NB_CODES_SECOURS }, () => {
    const c = [...randomBytes(8)].map((o) => ALPHABET_SECOURS[o % ALPHABET_SECOURS.length]).join('');
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
  return { clairs, hashes: clairs.map(hacherCodeSecours) };
}
