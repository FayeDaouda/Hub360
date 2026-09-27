import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Gabarit Études — deux niveaux (blocs, puis items dans chaque bloc), même
// motif que gabarit.dto.ts (Unbord) mais avec un niveau de nesting en plus
// puisque les BLOCS eux-mêmes sont configurables ici (pas juste les items
// dans des blocs fixes).

export class CreerBlocEtudeGabaritDto {
  @IsString() @MinLength(1) @MaxLength(120) libelle!: string;
}

export class MajBlocEtudeGabaritDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) libelle?: string;
}

export class ReordonnerBlocEtudeGabaritDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

export class CreerLigneEtudeGabaritDto {
  @IsString() @MinLength(1) @MaxLength(200) libelle!: string;
}

export class MajLigneEtudeGabaritDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) libelle?: string;
}

export class ReordonnerLigneEtudeGabaritDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}
