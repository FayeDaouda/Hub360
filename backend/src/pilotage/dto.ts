import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { INSTANCES_SAISIE } from './pilotage-regles';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Décision d'une instance saisie au registre (manuel §4.1) : responsable =
// un rôle de direction OU un collaborateur de la société.
export class SaisirDecisionDto {
  @IsIn(INSTANCES_SAISIE) instance!: (typeof INSTANCES_SAISIE)[number];
  @IsString() @MinLength(3) @MaxLength(500) texte!: string;
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @IsString() responsableRole?: string;
  @IsOptional() @IsString() responsableCollaborateurId?: string;
  @Matches(DATE) echeance!: string; // §4.1 : chaque décision a une échéance
  // Rattachement facultatif, un seul (revue CTO, 21/10/2026).
  @IsOptional() @IsString() projetId?: string;
  @IsOptional() @IsString() celluleId?: string;
  @IsOptional() @IsString() clientId?: string;
  // CTO : soumettre au CEO au lieu d'inscrire (revue CTO, 22/10/2026).
  @IsOptional() @IsBoolean() proposer?: boolean;
}

// Arbitrage d'une décision proposée par le CEO : accepter telle quelle,
// accepter modifiée (texte, responsable, échéance) ou refuser avec un motif.
export class ArbitrerDecisionDto {
  @IsIn(['accepter', 'modifier', 'refuser']) issue!: 'accepter' | 'modifier' | 'refuser';
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) texte?: string;
  @IsOptional() @IsString() responsableRole?: string;
  @IsOptional() @IsString() responsableCollaborateurId?: string;
  @IsOptional() @Matches(DATE) echeance?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(1000) motif?: string;
}

// Dépôt d'un reporting : l'analyse de l'émetteur est obligatoire.
export class DeposerReportingDto {
  @IsString() @MinLength(10) @MaxLength(4000) analyse!: string;
}

// Suivi d'un reporting déposé (revue CFO, lot 5) : question du destinataire,
// réponse de l'émetteur.
export class MessageReportingDto {
  @IsString() @MinLength(3) @MaxLength(2000) texte!: string;
}
