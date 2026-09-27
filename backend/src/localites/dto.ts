import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ZoneLocalite } from '@prisma/client';

// Même règle que la contrainte base « localites_code_format ».
const CODE_LOCALITE = /^[A-Z]{3}$/;
const MESSAGE_CODE = 'Le code doit faire exactement 3 lettres majuscules (ex : ALM).';

export class CreerLocaliteDto {
  @Matches(CODE_LOCALITE, { message: MESSAGE_CODE }) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) nom!: string;
  @IsEnum(ZoneLocalite) zone!: ZoneLocalite;
  @IsString() @MinLength(1) @MaxLength(120) region!: string;
  @IsOptional() @IsString() @MaxLength(120) arrondissement?: string | null;
  @IsOptional() @IsString() @MaxLength(120) commune?: string | null;
}

// Tout est modifiable sauf la zone (changer d'onglet = autre localité). Le
// code ne l'est que tant qu'aucun dossier ne l'a utilisé (cf. service).
export class MajLocaliteDto {
  @IsOptional() @Matches(CODE_LOCALITE, { message: MESSAGE_CODE }) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nom?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) region?: string;
  @IsOptional() @IsString() @MaxLength(120) arrondissement?: string | null;
  @IsOptional() @IsString() @MaxLength(120) commune?: string | null;
}
