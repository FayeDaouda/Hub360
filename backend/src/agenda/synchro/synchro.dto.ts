import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';

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
  active: boolean; // en pause : plus de synchronisation (18/11/2026)
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

// Un agenda affiché ou masqué dans le HUB (18/11/2026).
export class AfficherAgendaDto {
  @IsBoolean() importe!: boolean;
}

// L'agenda où le HUB écrit ses réunions, tous comptes confondus (ou aucun).
export class CibleAgendaDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() agendaId!: string | null;
}

// Un compte relié, activé ou mis en pause.
export class ActiverConnexionDto {
  @IsBoolean() active!: boolean;
}

// Le ticket remis au navigateur au retour de Google (base64url, 256 bits).
export class ConfirmerConnexionDto {
  @IsString() @Length(20, 100) @Matches(/^[A-Za-z0-9_-]+$/) ticket!: string;
}
