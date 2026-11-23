import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RhModule } from '../rh/rh.module';
import { AppelsService } from './appels.service';
import { CandidaturePublicController } from './candidature-public.controller';
import { RecrutementController } from './recrutement.controller';
import { RecrutementService } from './recrutement.service';

@Module({
  // L'embauche ouvre le dossier du personnel ; l'entretien part en invitation.
  imports: [NotificationsModule, RhModule, AgendaModule],
  providers: [RecrutementService, AppelsService],
  controllers: [RecrutementController, CandidaturePublicController],
  exports: [RecrutementService], // « À votre attention » (Pilotage)
})
export class RecrutementModule {}
