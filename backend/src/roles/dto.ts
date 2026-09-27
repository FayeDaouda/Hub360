import { IsEnum } from 'class-validator';
import { NiveauPermission } from '@prisma/client';

export class MajPermissionDto {
  @IsEnum(NiveauPermission) niveau: NiveauPermission;
}
