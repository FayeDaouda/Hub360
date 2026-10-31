import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { identifyCompany } from '../tenancy/tenant-context';
import { sessionEchue } from './session';
import { SwitchesService } from '../switches/switches.service';
import { hasFullAccess, RightsService } from '../rights/rights.service';

// Personne connectée, posée sur req.user par JwtAuthGuard.
export type UtilisateurConnecte = {
  userId: string;
  email: string;
  societeId: string | null;
  societeSlug: string | null;
  role: string;
  // Droits par étape (« crm » → « LE »), relus à chaque requête.
  permissions: Record<string, string>;
  // Administrateur HUB (carte blanche) : `role` est le rôle qu'il endosse.
  adminHub: boolean;
  // Carte blanche (31/10/2026) : Administrateur HUB ou CIO.
  fullAccess: boolean;
  // Session (src/auth/session.ts) : heure de la connexion et émission du
  // jeton présenté, en secondes.
  debutSession: number;
  emissionJeton: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private switches: SwitchesService,
    private rights: RightsService,
  ) {
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
    permissions?: Record<string, string>;
    adminHub?: boolean;
    iat?: number;
    debut?: number;
  }): Promise<UtilisateurConnecte> {
    // Douze heures au plus depuis la connexion, même pour un jeton émis avant
    // cette règle (sans `debut` : sa propre émission en tient lieu).
    const debutSession = payload.debut ?? payload.iat ?? 0;
    if (sessionEchue(debutSession)) {
      throw new UnauthorizedException('Session expirée — reconnecte-toi.');
    }

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

    // Maintenance du HUB : toute requête refusée, sauf la carte blanche.
    const fullAccess = hasFullAccess({ adminHub: payload.adminHub === true, role: payload.role });
    await this.switches.refuseDuringMaintenance(fullAccess);

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

    // Société de la requête pour l'isolation (ADR 0001) : dès ici, les gardes
    // qui suivent lisent déjà dans son seul périmètre.
    if (societeId) identifyCompany(societeId);

    // Droits relus ici plutôt que pris dans le jeton : un changement de la
    // matrice ou un module coupé vaut dès la requête suivante, sans reconnexion.
    const permissions = await this.rights.forUser({
      userId: utilisateur.id,
      societeId,
      role: payload.role,
      adminHub: payload.adminHub === true,
    });

    return {
      userId: utilisateur.id,
      email: utilisateur.email,
      societeId,
      societeSlug: payload.societeSlug ?? null,
      role: payload.role,
      permissions,
      adminHub: payload.adminHub === true,
      fullAccess,
      debutSession,
      emissionJeton: payload.iat ?? 0,
    };
  }
}
