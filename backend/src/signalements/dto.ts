import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const APPAREILS = ['mobile', 'ordinateur'] as const;
export const STATUTS = ['a_traiter', 'en_cours', 'corrige'] as const;

export class CreerSignalementDto {
  @IsString() @MinLength(10) @MaxLength(2000) description!: string;
  @IsString() @MaxLength(300) page!: string;
  @IsIn(APPAREILS) appareil!: (typeof APPAREILS)[number];
  // Capture d'écran facultative (data URI d'image, ~10 Mo au plus).
  @IsOptional() @IsString() @MaxLength(14_000_000) capture?: string;
}

export class StatutSignalementDto {
  @IsIn(STATUTS) statut!: (typeof STATUTS)[number];
}
