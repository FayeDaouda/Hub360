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
import { ConnexionsAgendaController, RetourGoogleController } from './synchro/connexions.controller';
import { ConnexionsAgendaService } from './synchro/connexions.service';
import { ClientGoogle } from './synchro/google.client';
import { SynchroAgendaService } from './synchro/synchro.service';

@Module({
  imports: [NotificationsModule, RhModule], // demandes d'absence à trancher
  providers: [
    AgendaService,
    AbonnementAgendaService,
    AbonnementAgendaGuard,
    InvitationsAgendaService,
    RappelsAgendaService,
    // Synchronisation avec Google (16/11/2026) : le client HTTP de Google,
    // remplaçable dans les tests.
    { provide: ClientGoogle, useFactory: () => new ClientGoogle() },
    SynchroAgendaService,
    ConnexionsAgendaService,
  ],
  controllers: [AgendaController, AbonnementAgendaPublicController, ConnexionsAgendaController, RetourGoogleController],
  exports: [InvitationsAgendaService], // entretiens du recrutement
})
export class AgendaModule {}
