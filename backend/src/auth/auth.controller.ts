import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ComptesService } from './comptes.service';
import { LoginDto } from './dto/login.dto';
import {
  ActiverCompteDto,
  MotDePasseOublieDto,
  ReinitialiserMotDePasseDto,
} from './dto/comptes.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private comptes: ComptesService,
  ) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Activation d'un compte invité : le collaborateur choisit son mot de passe.
  @Post('activation')
  @HttpCode(200)
  async activer(@Body() dto: ActiverCompteDto) {
    await this.comptes.definirMotDePasse(dto.token, dto.motDePasse, 'invitation');
    return { ok: true };
  }

  // Réponse constante — l'appelant ne peut pas savoir si l'email existe.
  @Post('mot-de-passe-oublie')
  @HttpCode(200)
  async motDePasseOublie(@Body() dto: MotDePasseOublieDto) {
    await this.comptes.motDePasseOublie(dto.email);
    return {
      message:
        'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.',
    };
  }

  @Post('reinitialisation')
  @HttpCode(200)
  async reinitialiser(@Body() dto: ReinitialiserMotDePasseDto) {
    await this.comptes.definirMotDePasse(dto.token, dto.motDePasse, 'reset');
    return { ok: true };
  }
}
