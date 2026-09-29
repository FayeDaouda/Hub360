import type { GroupeChecklistPermis, Permis } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Permis de construire (conception uniquement). API NestJS :
//   GET   /api/societes/:slug/projets/:id/permis
//   PATCH /api/societes/:slug/projets/:id/permis  (dossier imbriqué + statut)
// Le workflow détaillé (NICAD, dépôt/instruction, journal, certificat) a été
// retiré (sept. 2026) — seuls le dossier technique et le statut final
// (obtenu/refusé) restent, les 3 blocs de checklist ci-dessous couvrent le
// suivi opérationnel réel.
// -----------------------------------------------------------------------------

export function getPermis(slug: string, projetId: string): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis`);
}

export function enregistrerPermis(
  slug: string,
  projetId: string,
  patch: Partial<Omit<Permis, 'projetId' | 'celluleId' | 'checklists'>>,
): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis`, {
    method: 'PATCH',
    body: patch,
  });
}

// -----------------------------------------------------------------------------
// Sous-checklist opérationnelle (LigneChecklistPermis) — même contrat que les
// fonctions ChecklistAvp de lib/projets.ts, sous /permis/checklist.
// -----------------------------------------------------------------------------

export function majLigneChecklistPermis(
  slug: string,
  projetId: string,
  ligneId: string,
  patch: { fait?: boolean; note?: string; nonRequise?: boolean },
): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis/checklist/${ligneId}`, {
    method: 'PATCH',
    body: patch,
  });
}

// Ajoute un item à une checklist — admin uniquement. Va en fin du groupe ciblé.
export function ajouterLigneChecklistPermis(
  slug: string,
  projetId: string,
  item: { groupe: GroupeChecklistPermis; libelle: string },
): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis/checklist`, {
    method: 'POST',
    body: item,
  });
}

// Retire un item de la checklist (suppression douce côté serveur) — admin
// uniquement.
export function supprimerLigneChecklistPermis(
  slug: string,
  projetId: string,
  ligneId: string,
): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis/checklist/${ligneId}`, {
    method: 'DELETE',
  });
}

// -----------------------------------------------------------------------------
// Pièces jointes rattachées à une ligne — réservé au responsable désigné +
// admin (vérifié côté serveur). Le fichier vit dans Images/Documents comme un
// upload normal (cf. PermisService.joindreImages/joindreFichiers) : pas de
// copie, juste un repère de provenance.
// -----------------------------------------------------------------------------

export function joindreImagesLigneChecklistPermis(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: { nom: string; url: string }[],
): Promise<Permis> {
  return apiSociete<Permis>(
    slug,
    `/projets/${projetId}/permis/checklist/${ligneId}/images`,
    { method: 'POST', body: { fichiers } },
  );
}

export function joindreFichiersLigneChecklistPermis(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: { nom: string; url: string; taille?: number }[],
): Promise<Permis> {
  return apiSociete<Permis>(
    slug,
    `/projets/${projetId}/permis/checklist/${ligneId}/fichiers`,
    { method: 'POST', body: { fichiers } },
  );
}

// Pièces jointes rattachées au BLOC entier (pas à un item précis) — Dépôt
// urbanisme / Procédure depuis la restructuration sept. 2026 : un seul point
// d'upload partagé, réservé au responsable du bloc + admin (vérifié côté
// serveur).
export function joindreImagesBlocPermis(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistPermis,
  fichiers: { nom: string; url: string }[],
): Promise<Permis> {
  return apiSociete<Permis>(
    slug,
    `/projets/${projetId}/permis/blocs/${groupe}/images`,
    { method: 'POST', body: { fichiers } },
  );
}

export function joindreFichiersBlocPermis(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistPermis,
  fichiers: { nom: string; url: string; taille?: number }[],
): Promise<Permis> {
  return apiSociete<Permis>(
    slug,
    `/projets/${projetId}/permis/blocs/${groupe}/fichiers`,
    { method: 'POST', body: { fichiers } },
  );
}

// -----------------------------------------------------------------------------
// Blocs (Constitution / Dépôt urbanisme / Procédure) — échéance et
// responsable vivent ici, pas au niveau de l'item ni du module entier.
// -----------------------------------------------------------------------------

// Échéance + responsable d'un bloc — admin uniquement.
export function patchBlocPermis(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistPermis,
  patch: { debut?: string | null; echeance?: string | null; responsableId?: string | null },
): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis/blocs/${groupe}`, {
    method: 'PATCH',
    body: patch,
  });
}

// Demande de prolongation — le responsable DE CE BLOC uniquement.
export function demanderProlongationBlocPermis(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistPermis,
  patch: { echeance: string; motif?: string },
): Promise<Permis> {
  return apiSociete<Permis>(
    slug,
    `/projets/${projetId}/permis/blocs/${groupe}/prolongation`,
    { method: 'POST', body: patch },
  );
}

// Décision admin sur une demande en attente — admin uniquement.
export function deciderProlongationBlocPermis(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistPermis,
  accepter: boolean,
): Promise<Permis> {
  return apiSociete<Permis>(
    slug,
    `/projets/${projetId}/permis/blocs/${groupe}/prolongation`,
    { method: 'PATCH', body: { accepter } },
  );
}
