import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ComptesService } from './comptes.service';
import { ConfirmationIdentiteService } from './confirmation-identite.service';
import { AuthController } from './auth.controller';
import { MonCompteController, PhotosController } from './profil.controller';
import { ProfilService } from './profil.service';
import { JwtStrategy } from './jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PassportModule,
    NotificationsModule, // connexions du compte de secours (revue CIO)
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-moi-en-production',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    }),
  ],
  controllers: [AuthController, MonCompteController, PhotosController],
  providers: [AuthService, ComptesService, ConfirmationIdentiteService, ProfilService, JwtStrategy],
  exports: [JwtModule, ComptesService, ConfirmationIdentiteService],
})
export class AuthModule {}
