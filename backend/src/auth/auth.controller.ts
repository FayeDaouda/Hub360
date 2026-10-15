import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ComptesService } from './comptes.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CodeDoubleFacteurDto, EtapeDoubleFacteurDto, LoginDto } from './dto/login.dto';
import {
  ActiverCompteDto,
  ChangerMotDePasseDto,
  MotDePasseOublieDto,
  ReinitialiserMotDePasseDto,
} from './dto/comptes.dto';

// Seul contrôleur exposé sans authentification (login / activation / reset) →
// seul à porter le rate-limiting. Défaut : 10 requêtes / min / IP ; login et
// « mot de passe oublié » (sondés avec de vraies valeurs) descendent à 5.
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private authService: AuthService,
    private comptes: ComptesService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Double authentification (après le mot de passe, jeton d'étape) : code de
  // l'application ou de secours ; première activation (QR puis premier code).
  @Post('login/code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  connexionAvecCode(@Body() dto: CodeDoubleFacteurDto) {
    return this.authService.connexionAvecCode(dto.jeton, dto.code);
  }

  @Post('double-facteur/preparation')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  preparerDoubleFacteur(@Body() dto: EtapeDoubleFacteurDto) {
    return this.authService.preparerDoubleFacteur(dto.jeton);
  }

  @Post('double-facteur/activation')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  activerDoubleFacteur(@Body() dto: CodeDoubleFacteurDto) {
    return this.authService.activerDoubleFacteur(dto.jeton, dto.code);
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  // Seule route authentifiée du contrôleur : la personne connectée change son
  // propre mot de passe. Même plafond que le login (essais sur l'actuel).
  @Post('mot-de-passe')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changerMotDePasse(
    @Req() req: { user: { userId: string; societeSlug: string } },
    @Body() dto: ChangerMotDePasseDto,
  ) {
    return this.authService.changerMotDePasse(req.user.userId, req.user.societeSlug, dto.actuel, dto.nouveau);
  }
}
