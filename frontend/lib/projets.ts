import type {
  AvantProjet,
  Categorie,
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
//   GET  /projets · GET /projets/:id · PUT /projets/:id/cellule · PATCH /projets/:id/carte
//   PUT /projets/:id/phase
//   GET/PATCH /projets/:id/avant-projet · POST/DELETE …/avant-projet/validation
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

export function assignerProjet(
  slug: string,
  projetId: string,
  celluleId: string | null,
): Promise<ProjetExecution> {
  return apiSociete<ProjetExecution>(slug, `/projets/${projetId}/cellule`, {
    method: 'PUT',
    body: { celluleId },
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

// Enregistre la fiche sans la valider (merge partiel ; 409 si déjà validé).
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

// Coche / N-A / annote une ligne des sous-checklists opérationnelles, un champ
// à la fois (409 si l'avant-projet est déjà validé). Renvoie l'avant-projet
// complet — les `checklists` regroupées sont recalculées côté serveur.
export function majLigneChecklistAvp(
  slug: string,
  projetId: string,
  cle: string,
  patch: { fait?: boolean; nonRequis?: boolean; note?: string },
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/checklist/${cle}`,
    { method: 'PATCH', body: patch },
  );
}

// Valide l'avant-projet : le serveur exige checklist 4/4 + pré-bilan complet
// (409 sinon), horodate (validateur = utilisateur du token), fait avancer
// statut + phase. `_validePar` gardé pour la signature d'appel.
export function validerAvantProjet(
  slug: string,
  projetId: string,
  _validePar: string,
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/validation`,
    { method: 'POST', body: {} },
  );
}

export function devaliderAvantProjet(
  slug: string,
  projetId: string,
): Promise<AvantProjet> {
  return apiSociete<AvantProjet>(
    slug,
    `/projets/${projetId}/avant-projet/validation`,
    { method: 'DELETE' },
  );
}
