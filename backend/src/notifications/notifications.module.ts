import { Module } from '@nestjs/common';
import { ReglagesModule } from '../reglages/reglages.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { RappelsService } from './rappels.service';

// Exporte le service : ProjetsModule l'importe pour pousser les notifications
// au moment de l'assignation / du changement de phase.
@Module({
  imports: [ReglagesModule], // délai des relances de demandes RH
  providers: [NotificationsService, RappelsService], // RappelsService : tournée quotidienne de 7 h
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
