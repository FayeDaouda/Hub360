import type { FichierProjet, Phase, TypeFichier } from './types';
import { apiSociete } from './client-api';

// Section « Documents » d'un projet (livrables non-images). API NestJS :
//   GET    …/projets/:id/fichiers[?supprimes=1]
//   POST   …/projets/:id/fichiers   { fichiers: [{ nom, url, taille?, type?, phase? }] }
//   PATCH  …/projets/:id/fichiers/:fichierId   { type?, phase?, note? }
//   DELETE …/projets/:id/fichiers   { ids }   (soft-delete)
//   POST   …/projets/:id/fichiers/:fichierId/restauration
// Fichiers en data URI tant que le stockage objet n'est pas branché.

export function getFichiers(
  slug: string,
  projetId: string,
): Promise<FichierProjet[]> {
  return apiSociete<FichierProjet[]>(slug, `/projets/${projetId}/fichiers`);
}

export function getFichiersSupprimes(
  slug: string,
  projetId: string,
): Promise<FichierProjet[]> {
  return apiSociete<FichierProjet[]>(
    slug,
    `/projets/${projetId}/fichiers?supprimes=1`,
  );
}

export type EntreeFichier = {
  nom: string;
  url: string;
  taille?: number;
  type?: TypeFichier;
  phase?: Phase | null;
};

export function ajouterFichiers(
  slug: string,
  projetId: string,
  fichiers: EntreeFichier[],
): Promise<FichierProjet[]> {
  return apiSociete<FichierProjet[]>(slug, `/projets/${projetId}/fichiers`, {
    method: 'POST',
    body: { fichiers },
  });
}

export function majFichier(
  slug: string,
  projetId: string,
  fichierId: string,
  patch: { type?: TypeFichier; phase?: Phase | null; note?: string },
): Promise<FichierProjet> {
  return apiSociete<FichierProjet>(
    slug,
    `/projets/${projetId}/fichiers/${fichierId}`,
    { method: 'PATCH', body: patch },
  );
}

export function supprimerFichiers(
  slug: string,
  projetId: string,
  ids: string[],
): Promise<void> {
  return apiSociete<void>(slug, `/projets/${projetId}/fichiers`, {
    method: 'DELETE',
    body: { ids },
    sansCorps: true,
  });
}

export function restaurerFichier(
  slug: string,
  projetId: string,
  fichierId: string,
): Promise<void> {
  return apiSociete<void>(
    slug,
    `/projets/${projetId}/fichiers/${fichierId}/restauration`,
    { method: 'POST', body: {}, sansCorps: true },
  );
}

// Lit un fichier local en data URI (aucun redimensionnement — PDF, DWG…).
// Rejette au-delà de ~15 Mo réels (le data URI base64 gonfle d'environ 1/3, et
// le plafond de corps de requête serveur est à 30 Mo).
const MAX_OCTETS = 15 * 1024 * 1024;

export function lireFichier(
  file: File,
): Promise<{ nom: string; url: string; taille: number }> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_OCTETS) {
      reject(new Error(`« ${file.name} » dépasse 15 Mo.`));
      return;
    }
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error(`Lecture de « ${file.name} » impossible.`));
    lecteur.onload = () =>
      resolve({ nom: file.name, url: lecteur.result as string, taille: file.size });
    lecteur.readAsDataURL(file);
  });
}

const EXT_TYPE: Record<string, TypeFichier> = {
  dwg: 'plan',
  dxf: 'plan',
  pln: 'plan',
  skp: 'rendu_source',
  '3ds': 'rendu_source',
  max: 'rendu_source',
  blend: 'rendu_source',
  xls: 'devis',
  xlsx: 'devis',
  csv: 'devis',
};

// Devine le type à partir de l'extension — l'admin corrige ensuite si besoin.
export function typeParDefaut(nom: string): TypeFichier {
  const ext = nom.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPE[ext] ?? 'autre';
}

export function formatTaille(octets: number): string {
  if (!octets) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
