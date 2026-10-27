import type { EtatTache, Manque } from '../rh/regles-temps';
import type { TaskStatus } from './task-rules';

// Réponse de GET /societes/:slug/mon-espace/taches (Mes tâches, Mes
// performances) et de la remise ou de la relance d'une tâche, décrite par des
// classes : le plugin @nestjs/swagger en tire la description OpenAPI, d'où
// les types du front (ADR 0005). Noms des champs : ceux de l'API, inchangés.

export class OnTimeRateDto {
  aTemps!: number;
  total!: number;
  pct!: number | null;
}

// Taux de reprise : tâches validées renvoyées au moins une fois, parmi
// celles validées après au moins une remise.
export class ReworkRateDto {
  avecReprise!: number;
  total!: number;
  pct!: number | null;
}

export class PerformanceStatsDto {
  total!: number;
  validees!: number;
  enCours!: number;
  enRetard!: number;
  respectDelais!: OnTimeRateDto;
  reprises!: ReworkRateDto;
}

export class MyTaskDto {
  id!: string;
  etape!: string; // « 02 · Avant-projet »
  carte!: string;
  libelle!: string;
  projetId!: string;
  projetCode!: string;
  projetProgramme!: string;
  projetClient!: string;
  debut!: string | null;
  echeance!: string | null;
  dureeStandard!: number | null;
  heuresImputees!: number; // cumul jusqu'à aujourd'hui
  manque!: Manque | null;
  etat!: EtatTache | null;
  statut!: TaskStatus;
  // Règle du retard et date qui fait foi (task-rules.ts), calculées ici
  // depuis S2 : le front ne les recalcule plus.
  enRetard!: boolean;
  dateEffective!: string | null;
  prolongeeJusquau!: string | null; // statut « prolongee » : nouvelle date accordée
  // Remise jugée à temps (task-rules.ts, onTime) ; null : rien à juger.
  aTemps!: boolean | null;
  version!: number;
  remisLe!: Date | null;
  valideLe!: Date | null;
  renvoiMotif!: string | null; // tant que la tâche est à reprendre
  // En validation : qui valide (« Aïssatou Faye (chef de team) »), null si
  // personne à prévenir ; date à partir de laquelle on peut le relancer.
  validateur!: string | null;
  relancePossibleLe!: string | null;
  // Dépôt : numéro d'étape (nommage des fichiers), fichier exigé, et cas où
  // le dépôt du justificatif vaut validation.
  etapeNumero!: number;
  fichierObligatoire!: boolean;
  parDepot!: boolean;
  // Base du nom des fichiers du prochain dépôt, sans rang ni extension.
  nomDepot!: string;
}

export class MyTasksViewDto {
  taches!: MyTaskDto[];
  stats!: PerformanceStatsDto;
}
