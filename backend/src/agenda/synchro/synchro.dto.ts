import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';

// Agendas connectés (Google, Apple), 16/11/2026.

export class AgendaExterneDto {
  id: string;
  nom: string;
  couleur: string | null;
  importe: boolean; // ses rendez-vous apparaissent dans le HUB
  cible: boolean; // le HUB y écrit ses réunions
  proprietaire: boolean; // seul un agenda à soi peut être la cible
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
  @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) importes!: string[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() cible!: string | null;
}

// Le ticket remis au navigateur au retour de Google (base64url, 256 bits).
export class ConfirmerConnexionDto {
  @IsString() @Length(20, 100) @Matches(/^[A-Za-z0-9_-]+$/) ticket!: string;
}
