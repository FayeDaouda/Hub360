import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccesProjetGuard } from './acces-projet.guard';
import { ProjetsService } from './projets.service';
import { ProjetsController } from './projets.controller';
import { AvantProjetController } from './avant-projet.controller';
import { PreBilanController } from './pre-bilan.controller';
import { PhaseController } from './phase.controller';
import { PermisService } from './permis/permis.service';
import { PermisController } from './permis/permis.controller';
import { EtudesService } from './etudes/etudes.service';
import { EtudesController } from './etudes/etudes.controller';
import { EtudesGabaritService } from './etudes/gabarit.service';
import { EtudesGabaritController } from './etudes/gabarit.controller';
import { UnbordService } from './unbord/unbord.service';
import { UnbordController } from './unbord/unbord.controller';
import { UnbordGabaritService } from './unbord/gabarit.service';
import { UnbordGabaritController } from './unbord/gabarit.controller';
import { ExecutionService } from './execution/execution.service';
import { ExecutionController } from './execution/execution.controller';
import { ImagesService } from './images/images.service';
import { FichiersService } from './fichiers/fichiers.service';
import { ImagesController } from './images/images.controller';
import { FichiersController } from './fichiers/fichiers.controller';
import { FacturationService } from './facturation/facturation.service';
import { OuvertureProjetService } from './gabarit/ouverture.service';
import { ProjetsOuvertsService } from './gabarit/projets-ouverts.service';
import { TachesProjetService } from './gabarit/taches-projet.service';
import { FilsProjetService } from './gabarit/fils-projet.service';
import { ProjetsOuvertsController } from './gabarit/projets-ouverts.controller';
import { FacturationController } from './facturation/facturation.controller';
import { FacturationCentraleController } from './facturation/facturation-centrale.controller';

// L'agrégat « projet » : le tronc (assignation, phase) plus les sections aval,
// chacune avec son service + son contrôleur mais sous le même module —
// frontière métier unique. Voir l'artifact « Backend Grey Concrete » §05 / §08.
@Module({
  imports: [NotificationsModule, ReglagesModule, FinancesModule],
  providers: [
    AccesProjetGuard,
    ProjetsService,
    PermisService,
    EtudesService,
    EtudesGabaritService,
    UnbordService,
    UnbordGabaritService,
    ExecutionService,
    ImagesService,
    FichiersService,
    FacturationService,
    OuvertureProjetService,
    ProjetsOuvertsService,
    TachesProjetService,
    FilsProjetService,
  ],
  controllers: [
    ProjetsOuvertsController,
    ProjetsController,
    AvantProjetController,
    PreBilanController,
    PhaseController,
    PermisController,
    EtudesController,
    EtudesGabaritController,
    UnbordController,
    UnbordGabaritController,
    ExecutionController,
    ImagesController,
    FichiersController,
    FacturationController,
    FacturationCentraleController,
  ],
  // FacturationService exporté pour DevisModule (conversion d'un devis
  // accepté en facture, cf. FacturationService.creerDepuisDevis) ;
  // TachesProjetService pour Mon espace (RhModule : remise, validation).
  exports: [FacturationService, TachesProjetService],
})
export class ProjetsModule {}
