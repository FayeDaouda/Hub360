// Types du module Mes tâches, tirés de la description OpenAPI générée depuis
// le back (ADR 0005) : réponses décrites par MyTasksViewDto et TaskToReviewDto
// (backend/src/tasks). Les noms des champs sont ceux de l'API, inchangés.
import type { CorpsRequete, SchemaApi } from '@/lib/api/types';

export type MyTasksView = SchemaApi<'MyTasksViewDto'>;
export type MyTask = SchemaApi<'MyTaskDto'>;
// prolongee : retard qualifié par une prolongation accordée ; bloquee : sa
// carte attend l'étape précédente (règle commune des projets).
export type TaskStatus = MyTask['statut'];
export type PerformanceStats = SchemaApi<'PerformanceStatsDto'>;
// Remise qui attend la décision du valideur (N+1).
export type TaskToReview = SchemaApi<'TaskToReviewDto'>;
// Dépôt : fichiers (data URI) et commentaire, mêmes règles que Projets.
export type SubmissionBody = CorpsRequete<'/api/societes/{slug}/mon-espace/taches/{projetId}/{tacheId}/remise', 'post'>;
