import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinancesModule } from '../finances/finances.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccesProjetGuard } from './acces-projet.guard';
import { FacturationService } from './facturation/facturation.service';
import { OuvertureProjetService } from './gabarit/ouverture.service';
import { ProjetsOuvertsService } from './gabarit/projets-ouverts.service';
import { TachesProjetService } from './gabarit/taches-projet.service';
import { FilsProjetService } from './gabarit/fils-projet.service';
import { ProjetsOuvertsController } from './gabarit/projets-ouverts.controller';
import { FacturationController } from './facturation/facturation.controller';
import { ControleInterneService } from './facturation/controle-interne.service';
import { ParametresFacturationService } from './facturation/parametres-facturation.service';
import { FacturationCentraleController } from './facturation/facturation-centrale.controller';

// L'agrégat « projet » : le tronc (assignation, phase) plus les sections aval,
// chacune avec son service + son contrôleur mais sous le même module —
// frontière métier unique. Voir l'artifact « Backend Grey Concrete » §05 / §08.
@Module({
  imports: [AuthModule, NotificationsModule, ReglagesModule, FinancesModule],
  providers: [
    AccesProjetGuard,
    FacturationService,
    ControleInterneService,
    ParametresFacturationService,
    OuvertureProjetService,
    ProjetsOuvertsService,
    TachesProjetService,
    FilsProjetService,
  ],
  controllers: [ProjetsOuvertsController, FacturationController, FacturationCentraleController],
  // FacturationService exporté pour DevisModule (conversion d'un devis
  // accepté en facture, cf. FacturationService.creerDepuisDevis) ;
  // TachesProjetService pour Mon espace (RhModule : remise, validation).
  // ProjetsOuvertsService : alertes de l'accueil CEO (Pilotage).
  exports: [FacturationService, TachesProjetService, ProjetsOuvertsService],
})
export class ProjetsModule {}
