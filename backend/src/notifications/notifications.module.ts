import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ReglagesModule } from '../reglages/reglages.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { RappelsService } from './rappels.service';
import { NotificationsFluxController } from './notifications-flux.controller';
import { RealtimeModule } from '../realtime/realtime.module';

// Exporte le service : ProjetsModule l'importe pour pousser les notifications
// au moment de l'assignation / du changement de phase.
@Module({
  // RealtimeModule : signal instantané des notifications (flux SSE).
  imports: [ReglagesModule, FinancesModule, RealtimeModule], // délai des relances de demandes RH ; seuil de contresignature (relances du CEO)
  // RappelsService : tournée quotidienne de 7 h ; PushService : notifications système (Web Push).
  providers: [NotificationsService, RappelsService, PushService],
  controllers: [NotificationsController, NotificationsFluxController],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
