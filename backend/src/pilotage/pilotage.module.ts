import { DelegationService } from './delegation.service';
import { RentabiliteModule } from '../finances/rentabilite/rentabilite.module';
import { SyntheseService } from './synthese.service';
import { RelancesCeoService } from './relances-ceo.service';
import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ProjetsModule } from '../projets/projets.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { RecrutementModule } from '../recrutement/recrutement.module';
import { RhModule } from '../rh/rh.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PilotageController } from './pilotage.controller';
import { AttentionService } from './attention.service';
import { ChiffresPilotageService } from './chiffres.service';
import { PilotageService } from './pilotage.service';
import { ReportingRhService } from './reporting-rh.service';
import { SuiviReportingService } from './suivi-reporting.service';

@Module({
  // Réglages : objectifs, jours fériés ; RH : feuilles de temps, absences à
  // valider ; Projets et Finances : alertes de l'accueil CEO ; Recrutement :
  // postes à approuver, candidats à décider.
  imports: [
    ReglagesModule,
    RhModule,
    ProjetsModule,
    FinancesModule,
    NotificationsModule,
    RentabiliteModule,
    RecrutementModule,
  ],
  providers: [
    PilotageService,
    AttentionService,
    ChiffresPilotageService,
    ReportingRhService,
    SuiviReportingService,
    RelancesCeoService,
    SyntheseService,
    DelegationService,
  ],
  controllers: [PilotageController],
})
export class PilotageModule {}
