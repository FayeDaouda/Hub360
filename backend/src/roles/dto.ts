import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NiveauPermission } from '@prisma/client';

export class MajPermissionDto {
  @IsEnum(NiveauPermission) niveau: NiveauPermission;
}

// Décision du CEO sur une modification des droits du CIO (revue CIO).
export class DecisionDroitDto {
  @IsBoolean() accepter!: boolean;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
}
