import { IsOptional, IsString, MaxLength } from 'class-validator';

// Erreur remontée par le navigateur (frontend/components/error-reporting.tsx).
export class ClientErrorDto {
  @IsString() @MaxLength(500) message!: string;
  @IsOptional() @IsString() @MaxLength(4000) stack?: string;
  // Chemin de la page, sans paramètres (« /admin/grey-concrete/facturation »).
  @IsString() @MaxLength(300) page!: string;
}
