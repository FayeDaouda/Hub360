import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { SocietesModule } from './societes/societes.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { CrmModule } from './crm/crm.module';
import { ProjetsModule } from './projets/projets.module';
import { InterventionsModule } from './interventions/interventions.module';
import { SwitchesModule } from './switches/switches.module';
import { RightsModule } from './rights/rights.module';
import { TeamsModule } from './teams/teams.module';
import { TasksModule } from './tasks/tasks.module';
import { MySpaceModule } from './my-space/my-space.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { DevisModule } from './devis/devis.module';
import { FinancesModule } from './finances/finances.module';
import { RentabiliteModule } from './finances/rentabilite/rentabilite.module';
import { RolesModule } from './roles/roles.module';
import { GroupeModule } from './groupe/groupe.module';
import { RhModule } from './rh/rh.module';
import { LocalitesModule } from './localites/localites.module';
import { ContratsModule } from './contrats/contrats.module';
import { SignalementsModule } from './signalements/signalements.module';
import { AuditModule } from './audit/audit.module';
import { RechercheModule } from './recherche/recherche.module';
import { ContactsModule } from './contacts/contacts.module';
import { ReglagesModule } from './reglages/reglages.module';
import { PilotageModule } from './pilotage/pilotage.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { SerialisationInterceptor } from './commun/serialisation.interceptor';
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware';
import { TenantScopeGuard } from './tenancy/tenant-scope.guard';
import { FiltreExceptionsGlobal } from './commun/exception.filter';

@Module({
  imports: [
    PrismaModule,
    // Tâches planifiées (rappels quotidiens, cf. RappelsService).
    ScheduleModule.forRoot(),
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
    TeamsModule,
    TasksModule,
    MySpaceModule,
    NotificationsModule,
    ChatModule,
    DevisModule,
    FinancesModule,
    RentabiliteModule,
    RolesModule,
    GroupeModule,
    RhModule,
    PilotageModule,
    LocalitesModule,
    ContratsModule,
    ReglagesModule,
    RechercheModule,
    ContactsModule,
    SignalementsModule,
    AuditModule,
    InterventionsModule,
    SwitchesModule,
    RightsModule,
    MonitoringModule,
  ],
  providers: [
    // Périmètre d'isolation de la requête d'après sa route (ADR 0001), avant
    // les gardes des contrôleurs.
    { provide: APP_GUARD, useClass: TenantScopeGuard },
    { provide: APP_INTERCEPTOR, useClass: SerialisationInterceptor },
    { provide: APP_FILTER, useClass: FiltreExceptionsGlobal },
  ],
})
export class AppModule implements NestModule {
  // Contexte d'isolation ouvert pour toute requête, avant les gardes (ADR 0001).
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
