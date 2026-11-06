import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { RappelsService } from './rappels.service';

// Exporte le service : ProjetsModule l'importe pour pousser les notifications
// au moment de l'assignation / du changement de phase.
@Module({
  imports: [ReglagesModule, FinancesModule], // délai des relances de demandes RH ; seuil de contresignature (relances du CEO)
  // RappelsService : tournée quotidienne de 7 h ; PushService : notifications système (Web Push).
  providers: [NotificationsService, RappelsService, PushService],
  controllers: [NotificationsController],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
