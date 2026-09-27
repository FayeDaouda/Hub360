import { GroupeUnbord } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreerLigneUnbordGabaritDto {
  @IsEnum(GroupeUnbord) groupe!: GroupeUnbord;
  @IsString() @MinLength(1) @MaxLength(120) libelle!: string;
}

export class MajLigneUnbordGabaritDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) libelle?: string;
}

// Même motif que ReordonnerImagesDto (frontend/backend Images) : la position
// dans le tableau devient l'`ordre` de chaque ligne.
export class ReordonnerLigneUnbordGabaritDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}
