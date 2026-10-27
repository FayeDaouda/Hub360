import {
  ClienteleCellule,
  EtatPosteCellule,
  NiveauCollaborateur,
  ProcessusCellule,
  StatutCellule,
} from '@prisma/client';

// Réponse de GET /societes/:slug/equipes (page Équipes), décrite par des
// classes : le plugin @nestjs/swagger en tire la description OpenAPI, d'où
// les types du front (ADR 0005), et TypeScript vérifie que TeamsService.view
// la respecte. Noms des champs : ceux de l'API, inchangés.

export class CellCountDto {
  actives!: number;
  total!: number;
}

export class SignedProjectsCountDto {
  total!: number;
  nonAffectes!: number;
}

export class TasksIndicatorDto {
  enCours!: number;
  enRetard!: number;
  pctATemps!: number | null;
  // Étapes en retard : le chiffre du reporting de la direction (revue CTO).
  etapesEnRetard!: number;
}

export class TeamsIndicatorsDto {
  cellules!: CellCountDto;
  salariesAAffecter!: number;
  projetsSignes!: SignedProjectsCountDto;
  taches!: TasksIndicatorDto;
  absencesEnAttente!: number;
}

export class CellPilotDto {
  id!: string;
  nom!: string;
  // Chef sans compte HUB actif : ses remises remontent au Dir. GC.
  sansCompte!: boolean;
}

export class PositionHolderDto {
  id!: string;
  nom!: string;
}

export class CellPositionDto {
  id!: string;
  libelle!: string;
  etat!: EtatPosteCellule;
  titulaire!: PositionHolderDto | null;
}

export class CellMemberDto {
  id!: string;
  nom!: string;
  role!: string;
  niveau!: NiveauCollaborateur;
  photoUrl!: string | null;
  // Fin de l'absence validée qui couvre aujourd'hui (AAAA-MM-JJ).
  absentJusquau!: string | null;
  poste!: string | null;
  estPilote!: boolean;
  taches!: number; // tâches du mois en cours
  heures!: number; // heures imputées ce mois, à ce jour
  pctATemps!: number | null;
}

export class TeamCellDto {
  id!: string;
  code!: string;
  processus!: ProcessusCellule;
  nom!: string;
  clientele!: ClienteleCellule;
  statut!: StatutCellule;
  pilote!: CellPilotDto | null;
  pctATemps!: number | null; // null : pas encore d'étape livrée
  postes!: CellPositionDto[];
  membres!: CellMemberDto[];
}

export class UnassignedEmployeeDto {
  id!: string;
  nom!: string;
  role!: string;
  niveau!: NiveauCollaborateur;
  dateArrivee!: string | null;
}

export class ProjectCellDto {
  code!: string;
  nom!: string;
}

export class SignedProjectDto {
  id!: string;
  code!: string;
  programme!: string;
  client!: string;
  cellules!: ProjectCellDto[];
}

export class OngoingTaskDto {
  id!: string;
  projet!: string;
  etape!: string;
  libelle!: string;
  assigne!: string | null;
  echeance!: string | null;
  enRetard!: boolean;
  // Retard qualifié par une prolongation accordée : pas compté en retard.
  prolongeeJusquau!: string | null;
}

export class EmployeeOptionDto {
  id!: string;
  nom!: string;
  cellule!: string | null;
}

// Prochain code de la nomenclature, par processus.
export class NextCodesDto {
  DIR!: string;
  ARC!: string;
  INT!: string;
  ETU!: string;
}

export class TeamsViewDto {
  indicateurs!: TeamsIndicatorsDto;
  cellules!: TeamCellDto[];
  salariesAAffecter!: UnassignedEmployeeDto[];
  projets!: SignedProjectDto[];
  tachesEnCours!: OngoingTaskDto[];
  collaborateurs!: EmployeeOptionDto[];
  prochainsCodes!: NextCodesDto;
}
