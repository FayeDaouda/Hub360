import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { SocietesModule } from './societes/societes.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { CrmModule } from './crm/crm.module';
import { ProjetsModule } from './projets/projets.module';
import { EquipeModule } from './equipe/equipe.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { DevisModule } from './devis/devis.module';
import { FinancesModule } from './finances/finances.module';
import { RolesModule } from './roles/roles.module';
import { GroupeModule } from './groupe/groupe.module';
import { RhModule } from './rh/rh.module';
import { LocalitesModule } from './localites/localites.module';
import { ContratsModule } from './contrats/contrats.module';
import { ReglagesModule } from './reglages/reglages.module';
import { PilotageModule } from './pilotage/pilotage.module';
import { SerialisationInterceptor } from './commun/serialisation.interceptor';
import { FiltreExceptionsGlobal } from './commun/exception.filter';

@Module({
  imports: [
    PrismaModule,
    // Rate-limiting — stockage en mémoire (OK mono-instance ; passer sur un
    // storage partagé type Redis si l'API est répliquée). Le ThrottlerGuard
    // n'est posé que sur AuthController : le reste de l'API n'est pas limité.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 10 }],
      errorMessage: 'Trop de tentatives. Réessayez dans une minute.',
    }),
    EmailModule,
    AuthModule,
    SocietesModule,
    UsersModule,
    ClientsModule,
    CrmModule,
    ProjetsModule,
    EquipeModule,
    NotificationsModule,
    ChatModule,
    DevisModule,
    FinancesModule,
    RolesModule,
    GroupeModule,
    RhModule,
    PilotageModule,
    LocalitesModule,
    ContratsModule,
    ReglagesModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: SerialisationInterceptor },
    { provide: APP_FILTER, useClass: FiltreExceptionsGlobal },
  ],
})
export class AppModule {}
