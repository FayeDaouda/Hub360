import type { Execution, GroupeChecklistExecution } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Exécution / chantier (les deux catégories, même gabarit). API NestJS :
//   GET   /api/societes/:slug/projets/:id/execution
// Miroir Trello Grey Concrete — 8 blocs fixes (Études / Les Plans / Viabilité
// / Locaux techniques / Aménagements / Cahiers de menuiserie / Détails /
// CCTP), chacun avec sa propre échéance et son responsable. Remplace
// entièrement l'ancien système lots/offres/situations/réception/réserves
// (retiré sept. 2026, cf. mémoire) — même motif que lib/permis.ts.
// -----------------------------------------------------------------------------

export function getExecution(slug: string, projetId: string): Promise<Execution> {
  return apiSociete<Execution>(slug, `/projets/${projetId}/execution`);
}

// -----------------------------------------------------------------------------
// Sous-checklist opérationnelle (LigneChecklistExecution) — même contrat que
// les fonctions ChecklistPermis de lib/permis.ts, sous /execution/checklist.
// -----------------------------------------------------------------------------

export function majLigneChecklistExecution(
  slug: string,
  projetId: string,
  ligneId: string,
  patch: { fait?: boolean; note?: string; nonRequise?: boolean },
): Promise<Execution> {
  return apiSociete<Execution>(slug, `/projets/${projetId}/execution/checklist/${ligneId}`, {
    method: 'PATCH',
    body: patch,
  });
}

// Ajoute un item à une checklist — admin uniquement. Va en fin du groupe ciblé.
export function ajouterLigneChecklistExecution(
  slug: string,
  projetId: string,
  item: { groupe: GroupeChecklistExecution; libelle: string },
): Promise<Execution> {
  return apiSociete<Execution>(slug, `/projets/${projetId}/execution/checklist`, {
    method: 'POST',
    body: item,
  });
}

// Retire un item de la checklist (suppression douce côté serveur) — admin
// uniquement.
export function supprimerLigneChecklistExecution(
  slug: string,
  projetId: string,
  ligneId: string,
): Promise<Execution> {
  return apiSociete<Execution>(slug, `/projets/${projetId}/execution/checklist/${ligneId}`, {
    method: 'DELETE',
  });
}

// -----------------------------------------------------------------------------
// Pièces jointes rattachées à une ligne — réservé au responsable du bloc +
// admin (vérifié côté serveur). Le fichier vit dans Images/Documents comme un
// upload normal (cf. ExecutionService.joindreImages/joindreFichiers) : pas de
// copie, juste un repère de provenance.
// -----------------------------------------------------------------------------

export function joindreImagesLigneChecklistExecution(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: { nom: string; url: string }[],
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `/projets/${projetId}/execution/checklist/${ligneId}/images`,
    { method: 'POST', body: { fichiers } },
  );
}

export function joindreFichiersLigneChecklistExecution(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: { nom: string; url: string; taille?: number }[],
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `/projets/${projetId}/execution/checklist/${ligneId}/fichiers`,
    { method: 'POST', body: { fichiers } },
  );
}

// -----------------------------------------------------------------------------
// Blocs (Études / Les Plans / Viabilité / Locaux techniques / Aménagements /
// Cahiers de menuiserie / Détails / CCTP) — échéance et responsable vivent
// ici, pas au niveau de l'item ni du module entier.
// -----------------------------------------------------------------------------

// Échéance + responsable d'un bloc — admin uniquement.
export function patchBlocExecution(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistExecution,
  patch: { debut?: string | null; echeance?: string | null; responsableId?: string | null },
): Promise<Execution> {
  return apiSociete<Execution>(slug, `/projets/${projetId}/execution/blocs/${groupe}`, {
    method: 'PATCH',
    body: patch,
  });
}

// Demande de prolongation — le responsable DE CE BLOC uniquement.
export function demanderProlongationBlocExecution(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistExecution,
  patch: { echeance: string; motif?: string },
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `/projets/${projetId}/execution/blocs/${groupe}/prolongation`,
    { method: 'POST', body: patch },
  );
}

// Décision admin sur une demande en attente — admin uniquement.
export function deciderProlongationBlocExecution(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistExecution,
  accepter: boolean,
): Promise<Execution> {
  return apiSociete<Execution>(
    slug,
    `/projets/${projetId}/execution/blocs/${groupe}/prolongation`,
    { method: 'PATCH', body: { accepter } },
  );
}
