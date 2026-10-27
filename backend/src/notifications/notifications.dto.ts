import { NotificationType } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class LectureDto {
  @IsOptional() @IsArray() @IsEnum(NotificationType, { each: true }) types?: NotificationType[];
  // Ces notifications seulement (« Vu » du contrôle interne, revue CEO).
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) ids?: string[];
}
