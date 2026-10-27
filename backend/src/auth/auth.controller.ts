import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ComptesService } from './comptes.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CodeApplicationDto, CodeDoubleFacteurDto, EtapeDoubleFacteurDto, LoginDto } from './dto/login.dto';
import {
  ActiverCompteDto,
  ChangerMotDePasseDto,
  MotDePasseOublieDto,
  ReinitialiserMotDePasseDto,
} from './dto/comptes.dto';
import { SystemScope } from '../tenancy/tenant-scope.decorators';

// Seul contrôleur exposé sans authentification (login / activation / reset) →
// seul à porter le rate-limiting. Défaut : 10 requêtes / min / IP ; login et
// « mot de passe oublié » (sondés avec de vraies valeurs) descendent à 5.
// Connexion, activation, mot de passe oublié, double authentification : avant
// toute session de société, sur les comptes et leurs sociétés (ADR 0001).
@SystemScope('connexion et sécurité des comptes')
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
      message: 'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.',
    };
  }

  @Post('reinitialisation')
  @HttpCode(200)
  async reinitialiser(@Body() dto: ReinitialiserMotDePasseDto) {
    await this.comptes.definirMotDePasse(dto.token, dto.motDePasse, 'reset');
    return { ok: true };
  }

  // Double authentification depuis le HUB (personne connectée) : état, puis
  // activation là où elle n'est pas exigée (développement, démonstration).
  @Get('double-facteur')
  @UseGuards(JwtAuthGuard)
  etatDoubleFacteur(@Req() req: { user: { userId: string } }) {
    return this.authService.etatDoubleFacteur(req.user.userId);
  }

  @Post('double-facteur/compte/preparation')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  preparerDoubleFacteurCompte(@Req() req: { user: { userId: string } }) {
    return this.authService.preparerDoubleFacteurCompte(req.user.userId);
  }

  @Post('double-facteur/compte/activation')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  activerDoubleFacteurCompte(@Req() req: { user: { userId: string } }, @Body() dto: CodeApplicationDto) {
    return this.authService.activerDoubleFacteurCompte(req.user.userId, dto.code);
  }

  // Routes authentifiées du contrôleur : la personne connectée change son
  // propre mot de passe (ci-dessous) ou règle sa double authentification (ci-dessus). Même plafond que le login (essais sur l'actuel).
  @Post('mot-de-passe')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changerMotDePasse(
    @Req() req: { user: { userId: string; societeSlug: string; debutSession: number } },
    @Body() dto: ChangerMotDePasseDto,
  ) {
    const u = req.user;
    return this.authService.changerMotDePasse(u.userId, u.societeSlug, dto.actuel, dto.nouveau, u.debutSession);
  }
}
