import type {
  Cellule,
  Collaborateur,
  IndicateursCollaborateur,
  NiveauCollaborateur,
} from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Équipe — cellules & collaborateurs. API NestJS :
//   GET/POST/PATCH/DELETE  …/cellules[/:id]      (409 si suppression d'une cellule non vide)
//   GET/POST/PATCH/DELETE  …/collaborateurs[/:id]
//   GET  …/collaborateurs/:id/indicateurs        (perf : calcul de lecture)
// `photo` = data URI (redimensionnée client-side, cf. lib/image-fichier.ts).
// -----------------------------------------------------------------------------

export function getCellules(slug: string): Promise<Cellule[]> {
  return apiSociete<Cellule[]>(slug, '/cellules');
}

export function getCollaborateurs(
  slug: string,
  opts: { q?: string; cellule?: string } = {},
): Promise<Collaborateur[]> {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q);
  if (opts.cellule) qs.set('cellule', opts.cellule);
  const suffixe = qs.toString() ? `?${qs}` : '';
  return apiSociete<Collaborateur[]>(slug, `/collaborateurs${suffixe}`);
}

export function creerCellule(slug: string, nom: string): Promise<Cellule> {
  return apiSociete<Cellule>(slug, '/cellules', { method: 'POST', body: { nom } });
}

export function renommerCellule(
  slug: string,
  id: string,
  nom: string,
): Promise<Cellule> {
  return apiSociete<Cellule>(slug, `/cellules/${id}`, {
    method: 'PATCH',
    body: { nom },
  });
}

export function supprimerCellule(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/cellules/${id}`, {
    method: 'DELETE',
    sansCorps: true,
  });
}

type ChampsCollaborateur = {
  prenom: string;
  nom: string;
  role: string;
  niveau: NiveauCollaborateur;
  celluleId?: string | null;
  photo?: string | null;
  dateArrivee?: string | null; // AAAA-MM-JJ ; null = effacer
};

export function creerCollaborateur(
  slug: string,
  data: ChampsCollaborateur,
): Promise<Collaborateur> {
  return apiSociete<Collaborateur>(slug, '/collaborateurs', {
    method: 'POST',
    body: data,
  });
}

export function majCollaborateur(
  slug: string,
  id: string,
  // `actif` = couper / rétablir l'accès du compte lié (kill switch serveur).
  data: Partial<ChampsCollaborateur> & { actif?: boolean },
): Promise<Collaborateur> {
  return apiSociete<Collaborateur>(slug, `/collaborateurs/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

export function supprimerCollaborateur(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/collaborateurs/${id}`, {
    method: 'DELETE',
    sansCorps: true,
  });
}

// Envoie (ou renvoie) une invitation. `emailEnvoye` = l'email est réellement
// parti (transport SMTP configuré) ; sinon l'API renvoie quand même `lien`,
// que l'admin transmet à la main.
export function inviterCollaborateur(
  slug: string,
  id: string,
  email: string,
): Promise<{ lien: string; emailEnvoye: boolean }> {
  return apiSociete<{ lien: string; emailEnvoye: boolean }>(
    slug,
    `/collaborateurs/${id}/invitation`,
    { method: 'POST', body: { email } },
  );
}

export function getIndicateurs(
  slug: string,
  id: string,
): Promise<IndicateursCollaborateur> {
  return apiSociete<IndicateursCollaborateur>(
    slug,
    `/collaborateurs/${id}/indicateurs`,
  );
}
