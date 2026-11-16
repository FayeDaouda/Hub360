import { ArrayMaxSize, IsArray, IsOptional, IsUUID, ValidateIf } from 'class-validator';

// Agendas connectés (Google, Apple), 16/11/2026.

export class AgendaExterneDto {
  id: string;
  nom: string;
  couleur: string | null;
  importe: boolean; // ses rendez-vous apparaissent dans le HUB
  cible: boolean; // le HUB y écrit ses réunions
}

export class ConnexionAgendaDto {
  id: string;
  fournisseur: 'google' | 'apple';
  compte: string;
  derniereSynchroLe: string | null;
  erreur: string | null;
  agendas: AgendaExterneDto[];
}

export class DisponiblesConnexionDto {
  google: boolean;
  apple: boolean;
}

export class EtatConnexionsDto {
  disponibles: DisponiblesConnexionDto;
  connexions: ConnexionAgendaDto[];
}

export class DebutConnexionDto {
  url: string;
}

export class ChoisirAgendasDto {
  @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) importes!: string[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() cible!: string | null;
}
