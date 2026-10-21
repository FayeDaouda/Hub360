import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ComptesService } from './comptes.service';
import { ConfirmationIdentiteService } from './confirmation-identite.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-moi-en-production',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, ComptesService, ConfirmationIdentiteService, JwtStrategy],
  exports: [JwtModule, ComptesService, ConfirmationIdentiteService],
})
export class AuthModule {}
