import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinancesModule } from '../finances/finances.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccesProjetGuard } from './acces-projet.guard';
import { FacturationService } from './facturation/facturation.service';
import { FacturationController } from './facturation/facturation.controller';
import { ControleInterneService } from './facturation/controle-interne.service';
import { ParametresFacturationService } from './facturation/parametres-facturation.service';
import { FacturationCentraleController } from './facturation/facturation-centrale.controller';

// L'agrégat « projet » : le tronc (assignation, phase) plus les sections aval,
// chacune avec son service + son contrôleur mais sous le même module —
// frontière métier unique. Voir l'artifact « Backend Grey Concrete » §05 / §08.
@Module({
  imports: [AuthModule, NotificationsModule, ReglagesModule, FinancesModule, ProjectsModule],
  providers: [AccesProjetGuard, FacturationService, ControleInterneService, ParametresFacturationService],
  controllers: [FacturationController, FacturationCentraleController],
  // FacturationService exporté pour DevisModule (conversion d'un devis
  // accepté en facture, cf. FacturationService.creerDepuisDevis).
  // ProjectsModule réexporté : états des projets (Équipes, Mes tâches,
  // Pilotage), alertes de l'accueil CEO, et les services des tâches (Mes
  // tâches et Mon espace : remise, validation ; avenants TS : ajout en TS).
  // Les routes des projets ouverts (OpenProjectsController) vivent dans
  // ProjectsModule depuis S3d.
  exports: [FacturationService, ProjectsModule],
})
export class ProjetsModule {}
