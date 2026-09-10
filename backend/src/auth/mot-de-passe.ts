import * as bcrypt from 'bcrypt';

// Coût bcrypt. Relevé de 10 → 12 (§ Sécurité des accès).
export const COUT_BCRYPT = 12;

export function hacherMotDePasse(clair: string): Promise<string> {
  return bcrypt.hash(clair, COUT_BCRYPT);
}

export function verifierMotDePasse(clair: string, hash: string): Promise<boolean> {
  return bcrypt.compare(clair, hash);
}
