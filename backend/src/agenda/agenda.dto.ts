import { OmitType } from '@nestjs/swagger';
import { RAPPELS_MINUTES } from '@hub/domain';
import { ReponseInvitation, TypeAbsence } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Rappels proposés : la liste de @hub/domain (10 min, 30 min, 1 h, la veille).

// Nouveau rendez-vous (Agenda, 01/11/2026). Avec des invités : une réunion.
export class CreerRendezVousDto {
  @IsString() @MinLength(2) @MaxLength(160) titre!: string;
  @IsDateString() debut!: string;
  @IsDateString() fin!: string;
  @IsOptional() @IsString() @MaxLength(160) lieu?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) inviteIds?: string[];
  // Lien de visioconférence (12/11/2026) : https seulement ; null l'efface.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  // Sans identifiant dans l'adresse (https://meet.google.com@site-piege…).
  @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true })
  @MaxLength(500)
  lienVisio?: string | null;
  // Rappel avant le début, en minutes ; null : aucun.
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(RAPPELS_MINUTES) rappelMinutes?: number | null;
  // Répétition (16/11/2026) : règle RRULE du sous-ensemble de @hub/domain
  // (relue et refusée si elle en sort) ; null : un rendez-vous unique.
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200) regle?: string | null;
}

// Portée d'une modification ou d'une annulation sur une série (comme Google
// Agenda) : cette occurrence, celle-ci et les suivantes, ou toute la série.
export const PORTEES = ['occurrence', 'suivantes', 'toutes'] as const;
export type Portee = (typeof PORTEES)[number];

// Modifier un rendez-vous (12/11/2026) : la fiche entière, comme à la
// création, invités compris — obligatoires : une liste absente ne doit
// jamais retirer tout le monde. Les invités retirés reçoivent l'annulation.
export class ModifierRendezVousDto extends OmitType(CreerRendezVousDto, ['inviteIds'] as const) {
  @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) inviteIds!: string[];
  // Sur une série : la portée, et le début d'origine de l'occurrence visée.
  @IsOptional() @IsIn(PORTEES) portee?: Portee;
  @IsOptional() @IsDateString() occurrence?: string;
}

// Réponse d'un invité à une réunion (12/11/2026).
export class RepondreInvitationDto {
  @IsEnum(ReponseInvitation) reponse!: ReponseInvitation;
}

// Disponibilités au moment d'inviter (12/11/2026) : qui est déjà pris sur le
// créneau, sans rien dire de ce qu'il fait.
export class DisponibilitesDto {
  occupes: string[]; // un rendez-vous en même temps
  absents: string[]; // une absence validée ce jour-là
}

export class SerieAgendaDto {
  debut: string;
  fin: string;
  titre: string;
  lieu: string | null;
  description: string | null;
  lienVisio: string | null;
}

export class ParticipantDto {
  nom: string;
  reponse: ReponseInvitation | null;
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
  // L'organisateur peut le modifier (12/11/2026) ; jamais un entretien de
  // recrutement, qui se replanifie depuis sa candidature.
  modifiable: boolean;
  entretien: boolean;
  // La personne dont c'est l'agenda l'organise (sinon : elle y est invitée).
  jeSuisOrganisateur: boolean;
  description: string | null; // la note du rendez-vous, telle que saisie
  inviteIds: string[]; // comptes invités (le formulaire de modification)
  // Récurrence (16/11/2026) : pour une occurrence d'une série, la série
  // (cible des actions) et le début d'origine de l'occurrence ; la règle et
  // sa description ; l'occurrence modifiée seule.
  serieId: string | null;
  occurrence: string | null;
  regle: string | null;
  regleTexte: string | null;
  occurrenceModifiee: boolean;
  // Pour « tous les événements » : les valeurs de la série elle-même (son
  // premier rendez-vous), pas celles de cette occurrence.
  serie: SerieAgendaDto | null;
  // B3 (12/11/2026) : visio, rappel, réponse de la personne dont c'est
  // l'agenda (si elle est invitée), réponses de chaque invité.
  lienVisio: string | null;
  rappelMinutes: number | null;
  maReponse: ReponseInvitation | null;
  participants: ParticipantDto[];
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
