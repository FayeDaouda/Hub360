import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { verifierMotDePasse } from './mot-de-passe';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email },
    });

    // Compte inconnu, désactivé, ou invité pas encore activé (pas de mot de
    // passe) : message unique, aucune distinction (anti-énumération).
    if (!utilisateur || !utilisateur.actif || !utilisateur.motDePasseHash) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const motDePasseValide = await verifierMotDePasse(
      dto.motDePasse,
      utilisateur.motDePasseHash,
    );
    if (!motDePasseValide) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const societe = await this.prisma.societe.findUnique({
      where: { slug: dto.societeSlug },
    });
    if (!societe || !societe.actif) {
      throw new UnauthorizedException('Société introuvable');
    }

    // Cherche un rôle spécifique à cette société, ou un rôle transverse (societeId null)
    const acces = await this.prisma.utilisateurSocieteRole.findFirst({
      where: {
        utilisateurId: utilisateur.id,
        OR: [{ societeId: societe.id }, { societeId: null }],
      },
      include: { role: true },
    });

    if (!acces) {
      throw new UnauthorizedException("Vous n'avez pas accès à cette société");
    }

    const payload = {
      sub: utilisateur.id,
      email: utilisateur.email,
      societeId: societe.id,
      societeSlug: societe.slug,
      role: acces.role.nom,
    };

    return {
      access_token: this.jwtService.sign(payload),
      utilisateur: {
        id: utilisateur.id,
        email: utilisateur.email,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
      },
      societe: {
        id: societe.id,
        nom: societe.nom,
        slug: societe.slug,
      },
      role: acces.role.nom,
    };
  }
}
