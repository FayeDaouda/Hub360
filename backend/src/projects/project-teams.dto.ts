import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

// Équipes d'un projet (societes/:slug/projets/:id/equipes).

export class ProjectTeamDto {
  id!: string;
  code!: string;
  nom!: string;
  // Chef d'équipe (dispatcher de la cellule) ; null = à désigner dans Équipes.
  chef!: string | null;
}

export class ProjectTeamsDto {
  // Équipes affectées au projet ; vide = « Sans équipe ».
  equipes!: ProjectTeamDto[];
  // Cellules de la société (hors reportées), proposées à l'affectation.
  disponibles!: ProjectTeamDto[];
}

export class SetProjectTeamsDto {
  @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) celluleIds!: string[];
}
