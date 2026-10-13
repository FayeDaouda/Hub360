import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { hacherMotDePasse, verifierMotDePasse } from './mot-de-passe';
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

    return this.ouvrirSession(utilisateur, dto.societeSlug);
  }

  // Changement par la personne connectée : mot de passe actuel exigé (un
  // poste resté ouvert ne suffit pas). Toutes les sessions émises avant
  // sont coupées ; une nouvelle est rendue pour ne pas déconnecter l'auteur.
  async changerMotDePasse(utilisateurId: string, societeSlug: string, actuel: string, nouveau: string) {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
    if (!utilisateur?.motDePasseHash || !(await verifierMotDePasse(actuel, utilisateur.motDePasseHash))) {
      throw new BadRequestException('Mot de passe actuel incorrect.');
    }
    if (actuel === nouveau) {
      throw new BadRequestException("Le nouveau mot de passe doit être différent de l'actuel.");
    }
    const maintenant = new Date();
    await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id: utilisateurId },
        data: { motDePasseHash: await hacherMotDePasse(nouveau), sessionsValidesDepuis: maintenant },
      }),
      this.prisma.evenementCompte.create({
        data: { utilisateurId, type: 'mdp_reinitialise', parId: utilisateurId, detail: 'Changé par le titulaire' },
      }),
    ]);
    // iat arrondi à la seconde SUPÉRIEURE : le jeton est daté à la seconde,
    // la coupure à la milliseconde (cf. JwtStrategy) — sans cela, la nouvelle
    // session serait refusée dans la seconde même du changement.
    return this.ouvrirSession(utilisateur, societeSlug, Math.ceil(maintenant.getTime() / 1000));
  }

  private async ouvrirSession(
    utilisateur: { id: string; email: string; nom: string; prenom: string },
    societeSlug: string,
    iat?: number,
  ) {
    const societe = await this.prisma.societe.findUnique({
      where: { slug: societeSlug },
    });
    if (!societe || !societe.actif) {
      throw new UnauthorizedException('Société introuvable');
    }

    // Affectation dans cette société, sinon affectation transverse
    // (societeId null, ex. holding_admin). Choix explicite plutôt qu'un
    // findFirst non ordonné, qui prenait l'une ou l'autre au hasard quand un
    // compte a les deux. Un rôle supprimé (soft-delete) n'ouvre aucun accès.
    const affectations = await this.prisma.utilisateurSocieteRole.findMany({
      where: {
        utilisateurId: utilisateur.id,
        OR: [{ societeId: societe.id }, { societeId: null }],
        role: { supprimeLe: null },
      },
      include: { role: { include: { permissions: { include: { module: true } } } } },
    });
    const acces =
      affectations.find((a) => a.societeId === societe.id) ??
      affectations.find((a) => a.societeId === null);

    if (!acces) {
      throw new UnauthorizedException("Vous n'avez pas accès à cette société");
    }

    // Niveau par module (cle), lu dans la matrice RolePermission. societe_admin
    // y a des lignes explicites (validation partout, cf. seed.ts) ; les autres
    // rôles socles (holding_admin/collaborateur) n'en ont pas → {} (fail closed
    // sur toute route marquée @RequiertPermission).
    const permissions: Record<string, string> = {};
    for (const p of acces.role.permissions) {
      permissions[p.module.cle] = p.niveau;
    }

    const payload = {
      sub: utilisateur.id,
      email: utilisateur.email,
      societeId: societe.id,
      societeSlug: societe.slug,
      role: acces.role.nom,
      permissions,
      ...(iat !== undefined && { iat }),
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
      // Même carte que dans le JWT — l'interface s'en sert pour afficher ou
      // masquer (le serveur reste seul juge : chaque route revérifie).
      permissions,
    };
  }
}
