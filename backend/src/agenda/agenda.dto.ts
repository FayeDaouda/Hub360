import { TypeAbsence } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

// Nouveau rendez-vous (Agenda, 01/11/2026). Avec des invités : une réunion.
export class CreerRendezVousDto {
  @IsString() @MinLength(2) @MaxLength(160) titre!: string;
  @IsDateString() debut!: string;
  @IsDateString() fin!: string;
  @IsOptional() @IsString() @MaxLength(160) lieu?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) inviteIds?: string[];
}

// Un élément de l'agenda : rendez-vous, échéance d'une tâche ou congé validé.
export class ElementAgendaDto {
  id: string;
  type: 'rendez_vous' | 'echeance' | 'conge' | 'demande';
  titre: string;
  jour: string; // AAAA-MM-JJ
  debut: string | null; // ISO (rendez-vous seulement)
  fin: string | null;
  lieu: string | null;
  detail: string | null;
  organisateur: string | null;
  invites: string[];
  // L'organisateur peut l'annuler (rendez-vous seulement).
  annulable: boolean;
  // Demande d'absence à trancher : son identifiant ; `validationFinale` = celle
  // du CEO (demande de la RH), sinon la décision du N+1.
  demande?: { id: string; type: TypeAbsence; jours: number; validationFinale: boolean };
}

export class SemaineAgendaDto {
  du: string;
  au: string;
  personne: { id: string; nom: string };
  elements: ElementAgendaDto[];
  peutVoirAutres: boolean;
  peutCreer: boolean;
  peutInviter: boolean;
}

// Abonnement à son agenda depuis Google, Apple ou Outlook (12/11/2026).
export class EtatAbonnementAgendaDto {
  actif: boolean;
  creeLe: string | null; // ISO
  // Dernière relecture par l'agenda de la personne (preuve que ça marche).
  dernierAccesLe: string | null;
}

// Le lien clair : rendu une seule fois, à la création (seule son empreinte
// est gardée).
export class LienAbonnementAgendaDto {
  url: string;
}
