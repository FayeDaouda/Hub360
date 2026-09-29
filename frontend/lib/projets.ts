import type {
  AvantProjet,
  Categorie,
  GroupeChecklistAvp,
  PatchAvantProjet,
  Phase,
  PreBilan,
  ProjetExecution,
  VersionPreBilan,
} from './types';
import { apiSociete, ApiError } from './client-api';

// -----------------------------------------------------------------------------
// Projets (exécution), avant-projet & pré-bilan.
// Branché sur l'API NestJS (agrégat « projets ») :
//   GET  /projets · GET /projets/:id · PUT /projets/:id/cellules · PATCH /projets/:id/carte
//   PUT /projets/:id/phase
//   GET/PATCH /projets/:id/avant-projet
//   PATCH /projets/:id/avant-projet/checklist/blocs/:groupe (+ /prolongation)
//   GET /projets/:id/pre-bilan · POST …/pre-bilan/versions · PATCH …/pre-bilan/versions/:etape
// Les cellules & collaborateurs vivent dans lib/equipe.ts.
// Un projet naît quand un dossier CRM passe « validé » (transaction pivot
// serveur, cf. lib/crm.ts) — plus de création côté client.
// -----------------------------------------------------------------------------

export function getProjetsExecution(slug: string): Promise<ProjetExecution[]> {
  return apiSociete<ProjetExecution[]>(slug, '/projets');
}

export async function getProjetExecution(
  slug: string,
  id: string,
): Promise<ProjetExecution | null> {
  try {
    return await apiSociete<ProjetExecution>(slug, `/projets/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// Remplace l'ENSEMBLE des cellules du projet ([] = désassigner complètement)
// — plusieurs équipes par projet depuis sept. 2026 (décision boss).
export function assignerCellules(
  slug: string,
  projetId: string,
  celluleIds: string[],
): Promise<ProjetExecution> {
  return apiSociete<ProjetExecution>(slug, `/projets/${projetId}/cellules`, {
    method: 'PUT',
    body: { celluleIds },
  });
}

// Pose ou retire le pin géo du projet (posé à la main sur la fiche).
export function poserPin(
  slug: string,
  projetId: string,
  coords: { latitude: number | null; longitude: number | null },
): Promise<ProjetExecution> {
  return apiSociete<ProjetExecution>(slug, `/projets/${projetId}/carte`, {
    method: 'PATCH',
    body: coords,
  });
}

// -----------------------------------------------------------------------------
// Phase macro du projet
// -----------------------------------------------------------------------------

// Change la phase. Le serveur applique les gardes (422 non adjacent, 409 verrou
// avant-projet / permis) et renvoie le message métier — les catch des pages
// l'affichent tel quel.
export function changerPhaseProjet(
  slug: string,
  projetId: string,
  cible: Phase,
): Promise<ProjetExecution> {
  return apiSociete<ProjetExecution>(slug, `/projets/${projetId}/phase`, {
    method: 'PUT',
    body: { phase: cible },
  });
}

// -----------------------------------------------------------------------------
// Pré-bilan de faisabilité (versionné)
// -----------------------------------------------------------------------------

export function getPreBilan(slug: string, projetId: string): Promise<PreBilan> {
  return apiSociete<PreBilan>(slug, `/projets/${projetId}/pre-bilan`);
}

// Crée la version de la sous-étape suivante (le serveur choisit l'étape, fige
// la précédente et recopie ses montants). `_categorie` gardé pour la signature
// d'appel — non transmis, dérivé côté serveur.
export function ajouterVersionPreBilan(
  slug: string,
  projetId: string,
  _categorie: Categorie,
): Promise<PreBilan> {
  return apiSociete<PreBilan>(slug, `/projets/${projetId}/pre-bilan/versions`, {
    method: 'POST',
    body: {},
  });
}

// Enregistre les montants d'une version — 409 serveur si elle est figée.
export function enregistrerVersionPreBilan(
  slug: string,
  projetId: string,
  etape: VersionPreBilan['etape'],
  data: { couts: VersionPreBilan['couts']; prixVenteEstime: number | null },
): Promise<PreBilan> {
  return apiSociete<PreBilan>(
    slug,
    `/projets/${projetId}/pre-bilan/versions/${etape}`,
    { method: 'PATCH', body: data },
  );
}

// -----------------------------------------------------------------------------
// Section « Avant-projet » — fiche programme + validation
// -----------------------------------------------------------------------------

export function getAvantProjet(
  slug: string,
  projetId: string,
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(slug, `/projets/${projetId}/avant-projet`);
}

// Enregistre l'affectation/agenda (merge partiel).
export function enregistrerAvantProjet(
  slug: string,
  projetId: string,
  data: PatchAvantProjet,
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(slug, `/projets/${projetId}/avant-projet`, {
    method: 'PATCH',
    body: data,
  });
}

// Bascule « non nécessaire » sur un item — statut dérivé des fichiers joints,
// même modèle que Foncier/Unbord.
export function majLigneChecklistAvp(
  slug: string,
  projetId: string,
  ligneId: string,
  patch: { fait?: boolean; nonRequise?: boolean },
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/checklist/${ligneId}`,
    { method: 'PATCH', body: patch },
  );
}

export function joindreImagesLigneChecklistAvp(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: { nom: string; url: string }[],
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/checklist/${ligneId}/images`,
    { method: 'POST', body: { fichiers } },
  );
}

export function joindreFichiersLigneChecklistAvp(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: { nom: string; url: string; taille?: number }[],
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/checklist/${ligneId}/fichiers`,
    { method: 'POST', body: { fichiers } },
  );
}

// Ajoute un item à une checklist — admin OU dispatcher d'une cellule du
// projet (nouveauté sept. 2026). Va en fin du groupe ciblé.
export function ajouterLigneChecklistAvp(
  slug: string,
  projetId: string,
  item: { groupe: GroupeChecklistAvp; libelle: string },
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/checklist`,
    { method: 'POST', body: item },
  );
}

// Retire un item de la checklist (suppression douce côté serveur) — même
// autorisation que l'ajout.
export function supprimerLigneChecklistAvp(
  slug: string,
  projetId: string,
  ligneId: string,
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/checklist/${ligneId}`,
    { method: 'DELETE' },
  );
}

// -----------------------------------------------------------------------------
// Blocs (Livrables / Fichiers produits) — échéance et responsable vivent ici,
// pas au niveau de l'item (assignation par bloc, sept. 2026, même motif que
// Permis/Exécution).
// -----------------------------------------------------------------------------

export function patchBlocChecklistAvp(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistAvp,
  patch: { debut?: string | null; echeance?: string | null; responsableId?: string | null },
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/blocs/${groupe}`,
    { method: 'PATCH', body: patch },
  );
}

// Demande de prolongation — le responsable DE CE BLOC uniquement.
export function demanderProlongationBlocChecklistAvp(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistAvp,
  patch: { echeance: string; motif?: string },
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/blocs/${groupe}/prolongation`,
    { method: 'POST', body: patch },
  );
}

// Décision admin sur une demande en attente — admin uniquement.
export function deciderProlongationBlocChecklistAvp(
  slug: string,
  projetId: string,
  groupe: GroupeChecklistAvp,
  accepter: boolean,
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/blocs/${groupe}/prolongation`,
    { method: 'PATCH', body: { accepter } },
  );
}
