import { TypeEvenementTache } from '@prisma/client';
import type { SiteStatus } from './project-query';

// Réponses des routes des projets ouverts (societes/:slug/projets-ouverts),
// hors dossier d'un projet (open-project-file.dto.ts) et tableau de
// production (production-view.dto.ts). TypeScript vérifie que chaque service
// les respecte. Noms des champs : ceux de l'API, inchangés.

// --- GET … (tableau des projets) ------------------------------------------------------
export class OpenProjectSummaryDto {
  id!: string;
  code!: string;
  client!: string;
  cellule!: string | null;
  jour!: number; // jour ouvré du projet (J1 = ouverture)
  horizon!: number; // jour de livraison prévu
  faites!: number;
  total!: number;
  enRetard!: number;
  // Jour de livraison franchi sans que le projet soit déclaré livré.
  livraisonDepassee!: boolean;
}

export class TaskRefDto {
  projetId!: string;
  tacheId!: string;
}

export class BoardKpiDto {
  remisesAValider!: number;
  // Remises que la personne connectée peut trancher (jamais les siennes).
  aValiderParVous!: TaskRefDto[];
  tachesEnRetard!: number;
  prolongations!: number; // demandes en attente de décision
  tsNonAcceptes!: number; // avenants envoyés, non acceptés au-delà du délai réglé
  mentions!: number; // tâches ou cartes dont une mention attend sa réponse
}

export class OpenProjectsBoardDto {
  // En-tête de la page : gabarit et budget atelier en service (Réglages).
  gabarit!: string;
  budgetHeures!: number;
  projets!: OpenProjectSummaryDto[];
  kpi!: BoardKpiDto;
}

// --- GET …/a-decider ------------------------------------------------------------------
class DecisionTaskDto {
  projetId!: string;
  code!: string;
  client!: string;
  tacheId!: string;
  tache!: string;
  carte!: string;
  assigne!: string | null;
}

export class SubmissionToDecideDto extends DecisionTaskDto {
  version!: number;
  remiseLe!: Date | null;
}

export class ExtensionToDecideDto extends DecisionTaskDto {
  jusquau!: string;
  motif!: string;
  demandeLe!: Date;
  finPrevue!: string | null;
  // Escalade au CTO : la nouvelle date dépasse la livraison du projet.
  repousseLivraison!: string | null;
}

export class VisaToAffixDto extends DecisionTaskDto {
  valideeLe!: Date | null;
}

// TS au-delà du seuil, demandés par le Dir. GC : au CTO de trancher.
export class TsRequestToDecideDto {
  id!: string;
  projetId!: string;
  code!: string;
  client!: string;
  element!: string;
  reprise!: string; // mineure | majeure
  montantHt!: number;
  demandeLe!: Date;
  demandePar!: string | null;
}

export class ToDecideDto {
  remises!: SubmissionToDecideDto[];
  prolongations!: ExtensionToDecideDto[];
  visas!: VisaToAffixDto[];
  ts!: TsRequestToDecideDto[];
}

// --- Personnes ------------------------------------------------------------------------
// GET …/mentionnables : comptes actifs de la société (?projet= : ceux qui peuvent le lire).
export class MentionablePersonDto {
  id!: string;
  nom!: string;
}

// GET …/assignables : collaborateurs de la société.
export class AssignableEmployeeDto {
  id!: string;
  nom!: string;
  cellule!: string | null;
}

// --- Mentions (Mes tâches) ------------------------------------------------------------
export class MyMentionDto {
  id!: string;
  texte!: string;
  creeLe!: Date;
  lue!: boolean;
  auteur!: string | null;
  auteurId!: string | null;
  projetId!: string;
  projetCode!: string;
  carteId!: string;
  tacheId!: string | null;
  cible!: string; // libellé de la tâche, sinon de la carte
  racineId!: string; // commentaire auquel répondre (racine du fil)
}

export class CommentRefDto {
  id!: string;
}

// --- Fils de discussion ---------------------------------------------------------------
export class CommentAuthorDto {
  id!: string;
  nom!: string | null;
}

export class MentionedPersonDto {
  id!: string;
  nom!: string;
}

export class ThreadCommentDto {
  id!: string;
  texte!: string;
  le!: Date;
  resoluLe!: Date | null;
  auteur!: CommentAuthorDto | null;
  // Personnes citées (@), dans l'ordre du nom.
  mentions!: MentionedPersonDto[];
}

export class ThreadRootDto extends ThreadCommentDto {
  ouvert!: boolean; // une réponse est attendue d'une personne mentionnée
  reponses!: ThreadCommentDto[];
}

export class ResolutionDto {
  ok!: boolean;
}

// --- Tâches ---------------------------------------------------------------------------
// GET …/taches/:tacheId/charges : charge de chacun sur la fenêtre de la tâche.
export class PeriodDto {
  debut!: string;
  fin!: string;
}

// Zone de charge visée (Réglages, « objectif_charge_equipes »), en %.
export class LoadTargetDto {
  de!: number;
  a!: number;
}

export class EmployeeLoadDto {
  collaborateurId!: string;
  disponibles!: number;
  assignees!: number;
  joursAbsence!: number;
  pourcentage!: number | null; // avec la tâche ; null : aucune heure disponible
}

export class TaskWorkloadDto {
  periode!: PeriodDto | null; // null : tâche sans fenêtre
  zone!: LoadTargetDto | null;
  charges!: EmployeeLoadDto[];
}

// GET …/taches/:tacheId/historique.
export class TaskEventDto {
  id!: string;
  type!: TypeEvenementTache;
  detail!: string; // phrase affichée (« Assignée à Moussa Diop »)
  par!: string | null;
  le!: Date;
}

// PATCH …/taches/:tacheId/assignation : tâches dont l'assigné a changé.
export class AssignmentResultDto {
  modifiees!: number;
}

// POST …/taches/:tacheId/remise.
export class SubmissionResultDto {
  // Validée d'office quand le dépôt du justificatif vaut validation.
  statut!: 'validee' | 'a_valider';
  version!: number;
}

// Fichier d'une remise : nom et contenu (data URI), pour le téléchargement
// (projets ouverts, et remises à valider de Mes tâches).
export class SubmissionFileDto {
  nom!: string;
  url!: string;
}

// POST …/taches/:tacheId/decision.
export class ReviewDecisionResultDto {
  statut!: 'validee' | 'reprise';
}

// POST …/taches/:tacheId/visa.
export class VisaResultDto {
  visa!: 'appose' | 'refuse';
}

// POST …/taches/:tacheId/prolongation.
export class ExtensionRequestResultDto {
  ok!: boolean;
}

// POST …/taches/:tacheId/prolongation/decision.
export class ExtensionDecisionResultDto {
  decision!: 'accordee' | 'refusee';
}

// --- Chantier -------------------------------------------------------------------------
export class SiteStatusResultDto {
  statutChantier!: SiteStatus;
}

export class SiteVisitDateResultDto {
  dateVisiteSite!: string | null;
}

// Personnalisation d'un projet : ligne ajoutée (son id), modifiée ou retirée.
export class CustomizationResultDto {
  ok!: boolean;
  tacheId?: string;
}

// POST …/:id/conversation : la conversation du projet à ouvrir.
export class ConversationProjetDto {
  canalId!: string;
}
