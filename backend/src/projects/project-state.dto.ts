import { ApiProperty, getSchemaPath } from '@nestjs/swagger';

// Unions décrites variante par variante : une classe par forme possible, la
// propriété typée par l'union des classes et documentée en `oneOf`. Ainsi
// TypeScript vérifie que les règles (task-states.ts, reglages/gabarit.ts,
// project-file.service.ts) produisent l'une de ces formes, et le front reçoit
// une union discriminée par `code`, `type` ou `mode`. Noms des champs : ceux
// de l'API, inchangés.

type Variant = new () => object;
// Discriminant d'une variante : le plugin décrit un littéral seul comme une
// simple chaîne ; l'énumération à une valeur le garde exact dans le contrat
// (`code: "validee"` côté front), sinon l'union ne se discrimine plus.
const Literal = (value: string) => ApiProperty({ enum: [value] });
// `oneOf` d'une propriété : références vers les variantes (déclarées dans
// @ApiExtraModels du contrôleur, cf. PROJECT_STATE_MODELS).
export const oneOfVariants = (variants: Variant[]) => variants.map((v) => ({ $ref: getSchemaPath(v) }));

// --- État du jour d'une tâche (task-states.ts, TaskState) -----------------------------
export class TaskDisabledStateDto {
  @Literal('desactivee')
  code!: 'desactivee';
}
export class TaskNotNeededStateDto {
  @Literal('non_necessaire')
  code!: 'non_necessaire';
}
export class TaskLockedStateDto {
  @Literal('verrouillee')
  code!: 'verrouillee';
}
export class TaskValidatedStateDto {
  @Literal('validee')
  code!: 'validee';
  // Heures : + avance, − retard.
  ecart!: number | null;
}
export class TaskAwaitingVisaStateDto {
  @Literal('a_viser')
  code!: 'a_viser';
}
export class TaskToReviewStateDto {
  @Literal('a_valider')
  code!: 'a_valider';
  version!: number;
}
export class TaskReworkStateDto {
  @Literal('reprise')
  code!: 'reprise';
  version!: number;
}
export class TaskLateStateDto {
  @Literal('en_retard')
  code!: 'en_retard';
  jours!: number;
}
export class TaskExtendedStateDto {
  @Literal('prolongee')
  code!: 'prolongee';
  jusquau!: string;
  jours!: number; // retard qualifié, en jours depuis la référence
}
export class TaskInProgressStateDto {
  @Literal('en_cours')
  code!: 'en_cours';
}
export class TaskUpcomingStateDto {
  @Literal('a_venir')
  code!: 'a_venir';
}
export const TASK_STATE_VARIANTS = [
  TaskDisabledStateDto,
  TaskNotNeededStateDto,
  TaskLockedStateDto,
  TaskValidatedStateDto,
  TaskAwaitingVisaStateDto,
  TaskToReviewStateDto,
  TaskReworkStateDto,
  TaskLateStateDto,
  TaskExtendedStateDto,
  TaskInProgressStateDto,
  TaskUpcomingStateDto,
];
export type TaskStateDto = InstanceType<(typeof TASK_STATE_VARIANTS)[number]>;

// --- État du jour d'une carte (task-states.ts, CardState) ------------------------------
export class CardDisabledStateDto {
  @Literal('desactivee')
  code!: 'desactivee';
  motif!: string;
}
export class CardSectionsStateDto {
  @Literal('rubriques')
  code!: 'rubriques';
}
export class CardLockedStateDto {
  @Literal('verrouillee')
  code!: 'verrouillee';
  attend!: string[]; // libellés des tâches attendues
}
export class CardClosedStateDto {
  @Literal('close')
  code!: 'close';
  le!: string | null;
}
export class CardOpenStateDto {
  @Literal('ouverte')
  code!: 'ouverte';
}
export const CARD_STATE_VARIANTS = [
  CardDisabledStateDto,
  CardSectionsStateDto,
  CardLockedStateDto,
  CardClosedStateDto,
  CardOpenStateDto,
];
export type CardStateDto = InstanceType<(typeof CARD_STATE_VARIANTS)[number]>;

// --- Temps d'une carte ou d'une tâche (reglages/gabarit.ts, Temps) ---------------------
export class HoursTimeDto {
  @Literal('heures')
  type!: 'heures';
  heures!: number; // « 40 h »
}
export class PerUnitTimeDto {
  @Literal('par_unite')
  type!: 'par_unite';
  heures!: number; // « 8 h par pièce »
  unite!: 'pièce' | 'vue';
}
export class TotalTimeDto {
  @Literal('total')
  type!: 'total';
  heures!: number; // « 24 h au total »
}
export class SharedTimeDto {
  @Literal('partage')
  type!: 'partage';
  libelle!: string; // « commandes ETB, ETL et BC : 8 h partagées »
  heures?: number;
}
export class GcChargeTimeDto {
  @Literal('charge_gc')
  type!: 'charge_gc';
  charge!: 'notice' | 'cachet' | 'timbre'; // durée dans Règles et délais
}
export class CardShareTimeDto {
  @Literal('part_carte')
  type!: 'part_carte'; // part égale du temps « au total » de la carte
}
export class NoTimeDto {
  @Literal('sans')
  type!: 'sans'; // « sans temps atelier »
}
export const TIME_VARIANTS = [
  HoursTimeDto,
  PerUnitTimeDto,
  TotalTimeDto,
  SharedTimeDto,
  GcChargeTimeDto,
  CardShareTimeDto,
  NoTimeDto,
];
export type TimeDto = InstanceType<(typeof TIME_VARIANTS)[number]>;

// --- Qui valide une remise (project-file.service.ts, reviewerOf) -----------------------
export class ReviewByDepositDto {
  @Literal('depot')
  mode!: 'depot'; // le dépôt du justificatif vaut validation
}
export class ReviewByPersonDto {
  @Literal('personne')
  mode!: 'personne';
  nom!: string | null;
  role!: string;
  // Pourquoi ce n'est pas le chef de team (montré aux responsables seulement).
  motif?: string;
}
export const REVIEWER_VARIANTS = [ReviewByDepositDto, ReviewByPersonDto];
export type ReviewerDto = InstanceType<(typeof REVIEWER_VARIANTS)[number]>;

// Toutes les variantes, à déclarer une fois (@ApiExtraModels) pour que
// `oneOfVariants` trouve leurs schémas.
export const PROJECT_STATE_MODELS = [
  ...TASK_STATE_VARIANTS,
  ...CARD_STATE_VARIANTS,
  ...TIME_VARIANTS,
  ...REVIEWER_VARIANTS,
];
