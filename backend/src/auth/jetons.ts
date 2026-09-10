import { createHash, randomBytes } from 'crypto';

// Jeton d'invitation / reset : 256 bits d'aléa cryptographique (pas un uuid,
// pas un compteur). On ne stocke QUE le SHA-256 en base — le jeton clair ne
// vit que dans le lien envoyé, donc une fuite de base ne permet aucun rejeu.
export function genererJeton(): { clair: string; hash: string } {
  const clair = randomBytes(32).toString('base64url');
  return { clair, hash: hacherJeton(clair) };
}

export function hacherJeton(clair: string): string {
  return createHash('sha256').update(clair).digest('hex');
}
