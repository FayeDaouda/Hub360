import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RhModule } from '../rh/rh.module';
import { RecrutementController } from './recrutement.controller';
import { RecrutementService } from './recrutement.service';

@Module({
  imports: [NotificationsModule, RhModule], // l'embauche ouvre le dossier du personnel
  providers: [RecrutementService],
  controllers: [RecrutementController],
  exports: [RecrutementService], // « À votre attention » (Pilotage)
})
export class RecrutementModule {}
