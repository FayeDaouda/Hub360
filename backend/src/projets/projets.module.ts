import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccesProjetGuard } from './acces-projet.guard';
import { ProjetsService } from './projets.service';
import { PermisService } from './permis/permis.service';
import { EtudesService } from './etudes/etudes.service';
import { EtudesGabaritService } from './etudes/gabarit.service';
import { UnbordService } from './unbord/unbord.service';
import { UnbordGabaritService } from './unbord/gabarit.service';
import { ExecutionService } from './execution/execution.service';
import { ImagesService } from './images/images.service';
import { FichiersService } from './fichiers/fichiers.service';
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
    FacturationController,
    FacturationCentraleController,
  ],
  // FacturationService exporté pour DevisModule (conversion d'un devis
  // accepté en facture, cf. FacturationService.creerDepuisDevis) ;
  // TachesProjetService pour Mon espace (RhModule : remise, validation).
  // ProjetsOuvertsService : alertes de l'accueil CEO (Pilotage).
  exports: [FacturationService, TachesProjetService, ProjetsOuvertsService],
})
export class ProjetsModule {}
