// Types du module Projets (projets ouverts selon le gabarit), tirés de la
// description OpenAPI générée depuis le back (ADR 0005) : réponses décrites
// dans backend/src/projects (*.dto.ts). Les noms des champs sont ceux de
// l'API, inchangés. Les états (en cours, en retard, avance…) sont dérivés
// côté serveur au jour de la lecture, depuis les délais figés à l'ouverture.
import type { CorpsRequete, SchemaApi } from '@/lib/api/types';

// --- Tableau des projets ---------------------------------------------------------------
export type OpenProjectsBoard = SchemaApi<'OpenProjectsBoardDto'>;
export type OpenProjectSummary = SchemaApi<'OpenProjectSummaryDto'>;

// --- Dossier d'un projet ---------------------------------------------------------------
export type OpenProjectFile = SchemaApi<'OpenProjectFileDto'>;
export type ProjectStep = SchemaApi<'ProjectStepDto'>;
export type ProjectCard = SchemaApi<'ProjectCardDto'>;
export type ProjectTask = SchemaApi<'ProjectTaskDto'>;
// Unions discriminées par `code` (état du jour d'une tâche, d'une carte).
export type TaskState = ProjectTask['etat'];
export type CardState = ProjectCard['etat'];
export type StepState = ProjectStep['etat'];
// Statut d'une tranche de facturation (F1, F2, F3).
export type TrancheStatus = OpenProjectFile['factures']['F1'];
// Statut simple du projet (14/10/2026) : la facturation mensuelle SU/EX s'y fie.
export type SiteStatus = OpenProjectFile['statutChantier'];
// Fichier joint à une remise (v01, v02…), sans son contenu.
export type SubmissionPiece = SchemaApi<'SubmissionPieceDto'>;
// Remise : fichiers (data URI) et commentaire, tous deux facultatifs.
export type ProjectSubmissionBody = CorpsRequete<
  '/api/societes/{slug}/projets-ouverts/{id}/taches/{tacheId}/remise',
  'post'
>;

// --- Assignation, charge, historique ---------------------------------------------------
export type AssignableEmployee = SchemaApi<'AssignableEmployeeDto'>;
// Équipes d'un projet (affectées par le Dir. GC) et cellules proposées.
export type ProjectTeams = SchemaApi<'ProjectTeamsDto'>;
// Charge prévisionnelle de chacun sur la fenêtre d'une tâche (avant
// d'assigner) — mêmes règles que les feuilles de temps ; zone = Réglages.
export type TaskWorkload = SchemaApi<'TaskWorkloadDto'>;
export type EmployeeLoad = SchemaApi<'EmployeeLoadDto'>;
export type TaskEvent = SchemaApi<'TaskEventDto'>;

// --- Fils de discussion et mentions -----------------------------------------------------
// Fil d'une carte ou d'une tâche (un niveau de réponse).
export type CommentAuthor = SchemaApi<'CommentAuthorDto'>;
export type ThreadComment = SchemaApi<'ThreadCommentDto'>;
export type ThreadRoot = SchemaApi<'ThreadRootDto'>;
export type ThreadTarget = { carteId: string } | { tacheId: string };
// « Mes tâches » : les @mentions qui me visent (non traitées, ou des 7 derniers jours).
export type MyMention = SchemaApi<'MyMentionDto'>;

// --- À décider, production ------------------------------------------------------------
// « À décider » (revue Dir. GC, 21/10/2026) : remises, prolongations, visas et
// TS que la personne connectée peut trancher, sur tous ses projets.
export type ToDecide = SchemaApi<'ToDecideDto'>;
export type TsRequestToDecide = SchemaApi<'TsRequestToDecideDto'>;
// Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : Dir. GC (ses
// projets), CTO et CEO (tous).
export type ProductionView = SchemaApi<'ProductionViewDto'>;
export type ProductionRow = SchemaApi<'ProductionRowDto'>;
export type MemberWorkload = SchemaApi<'MemberWorkloadDto'>;

// --- Avenants TS (routes du module devis, réponses décrites en S4) ---------------------
// Élément demandé par le client, ajouté en TS à une carte « par unité ».
// Reprise mineure (TS-MIN, forfait) ou majeure (TS-MAJ : tarif CO × surface ×
// planches) : la ligne du devis d'avenant est chiffrée par le catalogue.
export type TsRework = { reprise: 'mineure' } | { reprise: 'majeure'; surfaceM2: number; planches: number };
// Au-delà du seuil des Réglages (500 000 FCFA HT par défaut), le Dir. GC ne
// l'ajoute pas : la demande part au CTO (revue Dir. GC, 21/10/2026).
export type TsElementResult =
  | { id: string; libelle: string; devisId: string }
  | { enAttente: true; demandeId: string; montantHt: number; seuil: number };
export type TsRequestDecision = { statut: 'acceptee' | 'refusee'; tacheId: string | null };
