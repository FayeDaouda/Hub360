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

// Dernière bascule de la maintenance (fermeture ou réouverture du HUB).
export class BasculeMaintenanceDto {
  le!: Date;
  // Nom de l'auteur ; « compte supprimé » s'il n'existe plus.
  par!: string | null;
}

export class EtatMaintenanceDto {
  actif!: boolean;
  message!: string;
  // null : jamais basculée.
  depuis!: BasculeMaintenanceDto | null;
}

export class InterrupteursDto {
  modules!: ModuleInterrupteurDto[];
  maintenance!: EtatMaintenanceDto;
}

// Écran « Modules » : catalogue du HUB par famille (lot 10, 31/10/2026).
export class ModuleCatalogueDto {
  nom: string;
  statut: 'en_service' | 'en_partie' | 'a_venir';
  note: string | null;
  // Module de la matrice qui le porte, et son état dans la société ; null sinon.
  module: { cle: string; actif: boolean } | null;
}
export class FamilleModulesDto {
  nom: string;
  modules: ModuleCatalogueDto[];
}
export class CatalogueModulesDto {
  familles: FamilleModulesDto[];
}
