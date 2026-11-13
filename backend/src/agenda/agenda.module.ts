import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RhModule } from '../rh/rh.module';
import { AbonnementAgendaPublicController } from './abonnement-public.controller';
import { AbonnementAgendaGuard } from './abonnement.guard';
import { AbonnementAgendaService } from './abonnement.service';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { InvitationsAgendaService } from './invitations.service';
import { RappelsAgendaService } from './rappels.service';

@Module({
  imports: [NotificationsModule, RhModule], // demandes d'absence à trancher
  providers: [
    AgendaService,
    AbonnementAgendaService,
    AbonnementAgendaGuard,
    InvitationsAgendaService,
    RappelsAgendaService,
  ],
  controllers: [AgendaController, AbonnementAgendaPublicController],
  exports: [InvitationsAgendaService], // entretiens du recrutement
})
export class AgendaModule {}
