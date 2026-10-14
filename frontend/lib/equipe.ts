import type {
  Cellule,
  ClienteleCellule,
  Collaborateur,
  NiveauCollaborateur,
  ProcessusCellule,
  StatutCellule,
  VueEquipes,
} from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Équipe — cellules & collaborateurs. API NestJS :
//   GET/POST/PATCH/DELETE  …/cellules[/:id]      (409 si suppression d'une cellule non vide)
//   GET/PATCH              …/collaborateurs[/:id] (fiche d'équipe : cellule, niveau, photo)
// `photo` = data URI (redimensionnée client-side, cf. lib/image-fichier.ts).
// -----------------------------------------------------------------------------

export function getCellules(slug: string): Promise<Cellule[]> {
  return apiSociete<Cellule[]>(slug, '/cellules');
}

export function getCollaborateurs(
  slug: string,
  opts: { q?: string; cellule?: string | string[] } = {},
): Promise<Collaborateur[]> {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q);
  // Un ou plusieurs `cellule=` (projet multi-équipes, sept. 2026) — répétés,
  // pas une valeur jointe par des virgules, pour matcher @Query('cellule') côté API.
  if (Array.isArray(opts.cellule)) {
    for (const id of opts.cellule) qs.append('cellule', id);
  } else if (opts.cellule) qs.set('cellule', opts.cellule);
  const suffixe = qs.toString() ? `?${qs}` : '';
  return apiSociete<Collaborateur[]>(slug, `/collaborateurs${suffixe}`);
}

// Code SOCIÉTÉ-PROCESSUS-NN attribué par le serveur ; le pilote rejoint la cellule.
export type NouvelleCellule = {
  processus: ProcessusCellule;
  nom: string;
  clientele?: ClienteleCellule;
  statut?: StatutCellule;
  piloteId?: string | null;
};

export function creerCellule(slug: string, cellule: NouvelleCellule): Promise<Cellule> {
  return apiSociete<Cellule>(slug, '/cellules', { method: 'POST', body: cellule });
}

// Page « Équipes » (maquette du boss) : indicateurs, cellules, listes.
export function getVueEquipes(slug: string): Promise<VueEquipes> {
  return apiSociete<VueEquipes>(slug, '/equipes');
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

// Désigne (ou retire, dispatcherId=null) le dispatcher de la cellule — admin
// uniquement, doit être membre de cette cellule (décision boss, sept. 2026).
export function definirDispatcher(
  slug: string,
  celluleId: string,
  dispatcherId: string | null,
): Promise<Cellule> {
  return apiSociete<Cellule>(slug, `/cellules/${celluleId}/dispatcher`, {
    method: 'PATCH',
    body: { dispatcherId },
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

export function majCollaborateur(
  slug: string,
  id: string,
  data: Partial<ChampsCollaborateur>,
): Promise<Collaborateur> {
  return apiSociete<Collaborateur>(slug, `/collaborateurs/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

