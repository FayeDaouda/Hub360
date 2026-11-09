import { apiSociete } from '@/lib/client-api';
import { telechargerFichier } from '@/lib/fichiers';
import type { CorpsRequete, ReponseApi } from '@/lib/api/types';
import type {
  AssignableEmployee,
  MyMention,
  OpenProjectFile,
  OpenProjectsBoard,
  ProductionView,
  ProjectSubmissionBody,
  SiteStatus,
  TaskEvent,
  TaskWorkload,
  ThreadRoot,
  ThreadTarget,
  ToDecide,
  TsElementResult,
  TsRequestDecision,
  TsRework,
  ProjectTeams,
} from './types';

// -----------------------------------------------------------------------------
// Projets ouverts selon le gabarit (maquette « Projets » du boss) — API NestJS
// (backend/src/projects), sous /api/societes/:slug/projets-ouverts :
//   GET   (liste + tuiles) · GET :id (dossier : étapes, cartes, tâches)
//   GET   mentionnables · mes-mentions · a-decider · production · :id/assignables
//   PATCH :id/chantier · :id/visite · :id/taches/:tacheId/assignation · :id/cartes/:carteId/assignation
//   GET   :id/taches/:tacheId/charges · historique · pieces/:pieceId · :id/cartes/:carteId/charges
//   POST  :id/taches/:tacheId/remise · prolongation(/decision) · decision · visa
//   GET/POST :id/fil · POST :id/fil/:commentaireId/resolution
//   POST  :id/ts · :id/ts/demandes/:demandeId/decision (avenants TS, module devis)
// -----------------------------------------------------------------------------

type Route<P extends string> = `/api/societes/{slug}/projets-ouverts${P}`;

export const getBoard = (slug: string) => apiSociete<OpenProjectsBoard>(slug, '/projets-ouverts');

export const getProjectFile = (slug: string, id: string) => apiSociete<OpenProjectFile>(slug, `/projets-ouverts/${id}`);

// Le Dir. GC : tout le monde ; un chef d'équipe : les membres de ses équipes.
export const getAssignableEmployees = (slug: string, projetId: string) =>
  apiSociete<AssignableEmployee[]>(slug, `/projets-ouverts/${projetId}/assignables`);

// Équipes d'un projet, ouvert ou non (societes/:slug/projets/:id/equipes).
export const getProjectTeams = (slug: string, projetId: string) =>
  apiSociete<ProjectTeams>(slug, `/projets/${projetId}/equipes`);

export const setProjectTeams = (slug: string, projetId: string, celluleIds: string[]) =>
  apiSociete<ProjectTeams>(slug, `/projets/${projetId}/equipes`, { method: 'PUT', body: { celluleIds } });

// À la tâche, ou (carte = true) à toutes les tâches encore ouvertes de sa carte.
export const assignTask = (
  slug: string,
  projetId: string,
  tacheId: string,
  collaborateurId: string | null,
  carte: boolean,
) =>
  apiSociete<ReponseApi<Route<'/{id}/taches/{tacheId}/assignation'>, 'patch'>>(
    slug,
    `/projets-ouverts/${projetId}/taches/${tacheId}/assignation`,
    { method: 'PATCH', body: { collaborateurId, carte } },
  );

// Remise par l'assigné, ou à sa place par l'Écriture de « Projets et cartes » ou
// le chef de son équipe (sans temps atelier : le dépôt vaut validation).
export const submitProjectTask = (slug: string, projetId: string, tacheId: string, corps: ProjectSubmissionBody = {}) =>
  apiSociete<ReponseApi<Route<'/{id}/taches/{tacheId}/remise'>, 'post'>>(
    slug,
    `/projets-ouverts/${projetId}/taches/${tacheId}/remise`,
    { method: 'POST', body: corps },
  );

export async function downloadSubmissionPiece(slug: string, projetId: string, tacheId: string, pieceId: string) {
  const f = await apiSociete<ReponseApi<Route<'/{id}/taches/{tacheId}/pieces/{pieceId}'>, 'get'>>(
    slug,
    `/projets-ouverts/${projetId}/taches/${tacheId}/pieces/${pieceId}`,
  );
  telechargerFichier(f);
}

// Prolongation : demande de l'assigné, décision du chef d’équipe ou du DPLG.
export const requestExtension = (slug: string, projetId: string, tacheId: string, jusquau: string, motif: string) =>
  apiSociete<ReponseApi<Route<'/{id}/taches/{tacheId}/prolongation'>, 'post'>>(
    slug,
    `/projets-ouverts/${projetId}/taches/${tacheId}/prolongation`,
    { method: 'POST', body: { jusquau, motif } },
  );

export const decideExtension = (slug: string, projetId: string, tacheId: string, accorder: boolean) =>
  apiSociete<ReponseApi<Route<'/{id}/taches/{tacheId}/prolongation/decision'>, 'post'>>(
    slug,
    `/projets-ouverts/${projetId}/taches/${tacheId}/prolongation/decision`,
    { method: 'POST', body: { accorder } },
  );

// Visa DPLG (revue Dir. GC, 21/10/2026) : apposer, ou refuser avec un motif.
export const setTaskVisa = (slug: string, projetId: string, tacheId: string, apposer: boolean, motif?: string) =>
  apiSociete<ReponseApi<Route<'/{id}/taches/{tacheId}/visa'>, 'post'>>(
    slug,
    `/projets-ouverts/${projetId}/taches/${tacheId}/visa`,
    { method: 'POST', body: { apposer, ...(motif ? { motif } : {}) } },
  );

// Remise : valider, ou renvoyer en reprise avec un motif.
export const decideProjectTask = (
  slug: string,
  projetId: string,
  tacheId: string,
  decision: 'valider' | 'renvoyer',
  motif?: string,
) =>
  apiSociete<ReponseApi<Route<'/{id}/taches/{tacheId}/decision'>, 'post'>>(
    slug,
    `/projets-ouverts/${projetId}/taches/${tacheId}/decision`,
    { method: 'POST', body: { decision, ...(motif ? { motif } : {}) } },
  );

export const setSiteStatus = (slug: string, projetId: string, statut: SiteStatus) =>
  apiSociete<ReponseApi<Route<'/{id}/chantier'>, 'patch'>>(slug, `/projets-ouverts/${projetId}/chantier`, {
    method: 'PATCH',
    body: { statut },
  });

// Date de visite sur site : les relevés de l'existant reçoivent leur
// échéance (lendemain de la visite) ; null = effacer.
export const setSiteVisitDate = (slug: string, projetId: string, date: string | null) =>
  apiSociete<ReponseApi<Route<'/{id}/visite'>, 'patch'>>(slug, `/projets-ouverts/${projetId}/visite`, {
    method: 'PATCH',
    body: { date },
  });

export const addTsElement = (slug: string, projetId: string, carteId: string, element: string, reprise: TsRework) =>
  apiSociete<TsElementResult>(slug, `/projets-ouverts/${projetId}/ts`, {
    method: 'POST',
    body: { carteId, element, ...reprise },
  });

// Personnalisation d'un projet (01/11/2026) : ligne ajoutée, modifiée, retirée.
export type CustomLineBody = CorpsRequete<'/api/societes/{slug}/projets-ouverts/{id}/cartes/{carteId}/lignes', 'post'>;
export type UpdateLineBody = CorpsRequete<'/api/societes/{slug}/projets-ouverts/{id}/taches/{tacheId}/ligne', 'patch'>;
export const addProjectLine = (slug: string, projetId: string, carteId: string, body: CustomLineBody) =>
  apiSociete<{ ok: boolean; tacheId?: string }>(slug, `/projets-ouverts/${projetId}/cartes/${carteId}/lignes`, {
    method: 'POST',
    body,
  });
export const updateProjectLine = (slug: string, projetId: string, tacheId: string, body: UpdateLineBody) =>
  apiSociete<{ ok: boolean }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/ligne`, { method: 'PATCH', body });
export const removeProjectLine = (slug: string, projetId: string, tacheId: string) =>
  apiSociete<{ ok: boolean }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/ligne`, { method: 'DELETE' });

export const decideTsRequest = (slug: string, projetId: string, demandeId: string, accepter: boolean, motif?: string) =>
  apiSociete<TsRequestDecision>(slug, `/projets-ouverts/${projetId}/ts/demandes/${demandeId}/decision`, {
    method: 'POST',
    body: { accepter, ...(motif ? { motif } : {}) },
  });

// --- Fils de discussion et mentions -----------------------------------------------------
export const getMentionablePeople = (slug: string) =>
  apiSociete<ReponseApi<Route<'/mentionnables'>, 'get'>>(slug, '/projets-ouverts/mentionnables');

export const getMyMentions = (slug: string) => apiSociete<MyMention[]>(slug, '/projets-ouverts/mes-mentions');

export const markMentionRead = (slug: string, commentaireId: string) =>
  apiSociete<ReponseApi<Route<'/mes-mentions/{commentaireId}/lue'>, 'post'>>(
    slug,
    `/projets-ouverts/mes-mentions/${commentaireId}/lue`,
    { method: 'POST', body: {} },
  );

export function getThread(slug: string, projetId: string, cible: ThreadTarget) {
  const q = 'carteId' in cible ? `carte=${cible.carteId}` : `tache=${cible.tacheId}`;
  return apiSociete<ThreadRoot[]>(slug, `/projets-ouverts/${projetId}/fil?${q}`);
}

export const postComment = (
  slug: string,
  projetId: string,
  corps: ThreadTarget & { texte: string; mentionneId?: string | null; parentId?: string },
) =>
  apiSociete<ReponseApi<Route<'/{id}/fil'>, 'post'>>(slug, `/projets-ouverts/${projetId}/fil`, {
    method: 'POST',
    body: corps,
  });

export const resolveComment = (slug: string, projetId: string, commentaireId: string) =>
  apiSociete<ReponseApi<Route<'/{id}/fil/{commentaireId}/resolution'>, 'post'>>(
    slug,
    `/projets-ouverts/${projetId}/fil/${commentaireId}/resolution`,
    { method: 'POST' },
  );

// --- Charge, historique, à décider, production ------------------------------------------
export const getTaskWorkload = (slug: string, projetId: string, tacheId: string) =>
  apiSociete<TaskWorkload>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/charges`);

// Le bloc entier (bouton de l'en-tête de la carte) : ses tâches encore ouvertes.
export const assignCard = (slug: string, projetId: string, carteId: string, collaborateurId: string | null) =>
  apiSociete<ReponseApi<Route<'/{id}/cartes/{carteId}/assignation'>, 'patch'>>(
    slug,
    `/projets-ouverts/${projetId}/cartes/${carteId}/assignation`,
    { method: 'PATCH', body: { collaborateurId } },
  );

// Charge de chacun sur la fenêtre du bloc, avant de l'assigner.
export const getCardWorkload = (slug: string, projetId: string, carteId: string) =>
  apiSociete<TaskWorkload>(slug, `/projets-ouverts/${projetId}/cartes/${carteId}/charges`);

export const getTaskHistory = (slug: string, projetId: string, tacheId: string) =>
  apiSociete<TaskEvent[]>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/historique`);

export const getToDecide = (slug: string) => apiSociete<ToDecide>(slug, '/projets-ouverts/a-decider');

export const getProduction = (slug: string) => apiSociete<ProductionView>(slug, '/projets-ouverts/production');
