import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LectureDto {
  @IsOptional() @IsArray() @IsEnum(NotificationType, { each: true }) types?: NotificationType[];
  // Ces notifications seulement (« Vu » du contrôle interne, revue CEO).
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) ids?: string[];
}

// Abonnement d'un appareil aux notifications système (Web Push, 02/11/2026).
class ClesPushDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}
export class AbonnementPushDto {
  @IsUrl({ protocols: ['https'], require_tld: false }) @MaxLength(1000) endpoint!: string;
  @ValidateNested() @Type(() => ClesPushDto) keys!: ClesPushDto;
  @IsOptional() @IsString() @MaxLength(120) appareil?: string;
}
export class DesabonnementPushDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

// Préférences : catégories × (pop-up, son, système) et heures calmes —
// complétées et bornées par normaliserPreferences (@hub/domain).
export class PreferencesNotificationsDto {
  @IsObject() categories!: Record<string, { popup?: boolean; son?: boolean; systeme?: boolean }>;
  @IsObject() calme!: { actif?: boolean; debut?: string; fin?: string };
}
