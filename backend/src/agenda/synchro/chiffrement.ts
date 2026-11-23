import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Chiffrement des accès aux agendas externes (16/11/2026) : jetons Google,
// mots de passe pour application Apple. AES-256-GCM (authentifié : un
// contenu modifié en base est refusé), clé AGENDA_CLE_CHIFFREMENT (32 octets
// en base64), jamais en base ni dans le code. Format : « v1.iv.tag.donnees »
// (base64url), versionné pour pouvoir changer de clé plus tard.

const VERSION = 'v1';

export function cleChiffrement(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const brute = env.AGENDA_CLE_CHIFFREMENT;
  if (!brute) return null;
  const cle = Buffer.from(brute, 'base64');
  return cle.length === 32 ? cle : null;
}

export function chiffrer(clair: string, cle: Buffer): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv('aes-256-gcm', cle, iv);
  const donnees = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return [VERSION, iv, tag, donnees].map((x) => (typeof x === 'string' ? x : x.toString('base64url'))).join('.');
}

export function dechiffrer(chiffre: string, cle: Buffer): string {
  const [version, iv, tag, donnees] = chiffre.split('.');
  if (version !== VERSION || !iv || !tag || donnees === undefined) throw new Error('Accès chiffré illisible.');
  const dechiffreur = createDecipheriv('aes-256-gcm', cle, Buffer.from(iv, 'base64url'));
  dechiffreur.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([dechiffreur.update(Buffer.from(donnees, 'base64url')), dechiffreur.final()]).toString('utf8');
}
