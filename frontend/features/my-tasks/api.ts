import { apiSociete } from '@/lib/client-api';
import { telechargerFichier } from '@/lib/fichiers';
import type { ReponseApi } from '@/lib/api/types';
import type { MyTasksView, SubmissionBody, TaskToReview } from './types';

// -----------------------------------------------------------------------------
// Tâches assignées — API NestJS (backend/src/tasks), mêmes règles que Projets :
//   GET  …/mon-espace/taches                              mes tâches + statistiques
//   POST …/mon-espace/taches/:projetId/:tacheId/remise    dépôt (fichiers, commentaire)
//   POST …/mon-espace/taches/:projetId/:tacheId/relance   relance du validateur
//   GET  …/taches/a-valider                               remises qui attendent ma décision
//   POST …/taches/:projetId/:tacheId/decision             { decision, motif? }
//   GET  …/taches/:projetId/:tacheId/pieces/:pieceId      fichier d'une remise
// Remise, relance et décision renvoient la liste à jour.
// -----------------------------------------------------------------------------

type TaskRef = { id: string; projetId: string };
type SubmissionFile = ReponseApi<'/api/societes/{slug}/taches/{projetId}/{tacheId}/pieces/{pieceId}', 'get'>;

export const getMyTasks = (slug: string) => apiSociete<MyTasksView>(slug, '/mon-espace/taches');

export const submitTask = (slug: string, t: TaskRef, body: SubmissionBody = {}) =>
  apiSociete<MyTasksView>(slug, `/mon-espace/taches/${t.projetId}/${t.id}/remise`, { method: 'POST', body });

// Relancer son validateur (3 jours ouvrés après le dépôt, puis après la relance précédente).
export const remindReviewer = (slug: string, t: TaskRef) =>
  apiSociete<MyTasksView>(slug, `/mon-espace/taches/${t.projetId}/${t.id}/relance`, { method: 'POST' });

export const getTasksToReview = (slug: string) => apiSociete<TaskToReview[]>(slug, '/taches/a-valider');

export const decideTask = (slug: string, t: TaskRef, decision: 'valider' | 'renvoyer', motif?: string) =>
  apiSociete<TaskToReview[]>(slug, `/taches/${t.projetId}/${t.id}/decision`, {
    method: 'POST',
    body: { decision, ...(motif ? { motif } : {}) },
  });

// Fichier d'une remise à valider (le valideur, ou l'assigné).
export async function downloadSubmissionFile(slug: string, t: TaskRef, fileId: string) {
  telechargerFichier(await apiSociete<SubmissionFile>(slug, `/taches/${t.projetId}/${t.id}/pieces/${fileId}`));
}
