import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

export class MoisQuery {
  @IsOptional() @Matches(MOIS) mois?: string;
}

export class SignalerEcartDto {
  @Matches(MOIS) mois!: string;
  @IsString() @MinLength(5) @MaxLength(1000) commentaire!: string;
}

export class TraiterEcartDto {
  @IsString() @MinLength(3) @MaxLength(1000) reponse!: string;
}
