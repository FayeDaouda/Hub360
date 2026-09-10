import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { SerialisationInterceptor } from './commun/serialisation.interceptor';

@Module({
  imports: [
    PrismaModule,
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
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: SerialisationInterceptor }],
})
export class AppModule {}
