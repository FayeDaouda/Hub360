import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change-moi-en-production',
    });
  }

  // Injecté dans req.user sur toutes les routes protégées par JwtAuthGuard.
  // On ne fait pas confiance aux claims du token les yeux fermés : on vérifie
  // que l'utilisateur existe toujours, et on ré-résout `societeId` depuis le
  // `societeSlug` (stable) plutôt que depuis l'id du token (qui peut dériver
  // après un reset de base en dev). Un token qui référence des lignes disparues
  // -> 401 propre plutôt que des écrans vides / des 500 sur FK.
  async validate(payload: {
    sub: string;
    email: string;
    societeId?: string | null;
    societeSlug?: string | null;
    role: string;
    iat?: number;
  }) {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, actif: true, sessionsValidesDepuis: true },
    });
    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException('Session invalide — reconnecte-toi.');
    }
    // Token émis avant la dernière invalidation (reset de mot de passe,
    // désactivation) -> rejeté même s'il n'est pas expiré.
    if (
      utilisateur.sessionsValidesDepuis &&
      payload.iat &&
      payload.iat * 1000 < utilisateur.sessionsValidesDepuis.getTime()
    ) {
      throw new UnauthorizedException('Session expirée — reconnecte-toi.');
    }

    let societeId = payload.societeId ?? null;
    if (payload.societeSlug) {
      const societe = await this.prisma.societe.findUnique({
        where: { slug: payload.societeSlug },
        select: { id: true },
      });
      if (!societe) {
        throw new UnauthorizedException('Société introuvable — reconnecte-toi.');
      }
      societeId = societe.id;
    }

    return {
      userId: utilisateur.id,
      email: utilisateur.email,
      societeId,
      societeSlug: payload.societeSlug ?? null,
      role: payload.role,
    };
  }
}
