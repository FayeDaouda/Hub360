import { ModePaiementSalaire, SituationFamiliale } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

// « Mes informations » (maquette) : ce que le salarié modifie lui-même,
// enregistré immédiatement. Mêmes limites que DossierPersonnelDto.
export class ContactDetailsDto {
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail() @MaxLength(120) emailPerso?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(SituationFamiliale)
  situationFamiliale?: SituationFamiliale | null;
  @IsOptional() @IsInt() @Min(0) @Max(30) enfantsACharge?: number;
  @IsOptional() @IsString() @MaxLength(300) adresse?: string;
  @IsOptional() @IsString() @MaxLength(200) contactUrgence?: string;
  @IsOptional() @IsString() @MaxLength(40) telephoneUrgence?: string;
}

// Changement de moyen de paiement : soumis à la RH, appliqué après validation.
export class PaymentChangeDto {
  @IsEnum(ModePaiementSalaire) modePaiement!: ModePaiementSalaire;
  @IsString() @MaxLength(80) coordonneesPaiement!: string;
}
