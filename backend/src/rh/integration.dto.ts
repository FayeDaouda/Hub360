import { IsString, Matches, MaxLength } from 'class-validator';

export class PointIntegrationDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) realiseLe: string;
  @IsString() @MaxLength(4000) compteRendu: string;
}
