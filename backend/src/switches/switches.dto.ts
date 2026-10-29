import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { MotifInterventionDto } from '../interventions/interventions.dto';

export class InterrupteurModuleDto extends MotifInterventionDto {
  @IsBoolean() actif!: boolean;
}

export class MaintenanceDto extends MotifInterventionDto {
  @IsBoolean() actif!: boolean;
  // Affiché à tous pendant la maintenance.
  @IsString() @MinLength(0) @MaxLength(300) message!: string;
}

export class ModuleInterrupteurDto {
  cle!: string;
  nom!: string;
  actif!: boolean;
  // Coupure en cours : depuis quand, pourquoi.
  desactiveLe!: Date | null;
  motif!: string | null;
}

export class EtatMaintenanceDto {
  actif!: boolean;
  message!: string;
}

export class InterrupteursDto {
  modules!: ModuleInterrupteurDto[];
  maintenance!: EtatMaintenanceDto;
}
