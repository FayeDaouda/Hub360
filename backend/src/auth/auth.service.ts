import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { hacherMotDePasse, verifierMotDePasse } from './mot-de-passe';
import { LoginDto } from './dto/login.dto';
import {
  chiffrerSecret,
  dechiffrerSecret,
  genererCodesSecours,
  genererSecret,
  hacherCodeSecours,
  lienOtpauth,
  verifierCode,
} from './totp';
import { cheminPhoto } from './profil';
import { EmailService, type AvisSecurite } from '../email/email.service';

// Double authentification obligatoire pour tous les rôles (décision du
// 28/10/2026, lot A ; elle épargnait jusque-là le Salarié qui ne pilote pas de
// cellule). Appliquée en production. HUB_DOUBLE_FACTEUR = « obligatoire » la
// force partout ; « desactive » ne vaut que sur un poste de développement ou un
// serveur de démonstration (HUB_DONNEES_DEMO=autorise) — jamais sur un HUB
// réel (revue CIO, 22/10/2026).
export function doubleFacteurExige(env: NodeJS.ProcessEnv = process.env): boolean {
  const reglage = env.HUB_DOUBLE_FACTEUR;
  const production = env.NODE_ENV === 'production';
  const desactivable = !production || env.HUB_DONNEES_DEMO === 'autorise';
  return reglage === 'obligatoire' || (production && !(reglage === 'desactive' && desactivable));
}

// Comptes techniques de secours (revue CIO, 22/10/2026) : sans usage
// quotidien, accès confié au CEO ; chaque connexion est tracée au journal et
// notifiée au CEO et au CIO.
export const ROLES_SECOURS: ReadonlySet<string> = new Set(['holding_admin', 'societe_admin']);

// Jeton d'étape entre le mot de passe et le code : signé avec une autre clé
// que les sessions (jamais accepté comme session), valable 10 minutes.
const secretEtape = () => `${process.env.JWT_SECRET || 'change-moi-en-production'}:double-facteur`;
type EtapeConnexion = { etape: 'code' | 'enrolement'; jeton: string };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notifications: NotificationsService,
    private email: EmailService,
  ) {}

  // Avis de sécurité à la personne (lot A) : envoyé sans retarder la réponse ;
  // un échec d'envoi est journalisé par le transport, jamais bloquant.
  private avertir(u: { email: string; prenom: string }, evenement: AvisSecurite['evenement']) {
    void this.email.envoyerAvisSecurite({ email: u.email, prenom: u.prenom, evenement, le: new Date() });
  }

  async login(dto: LoginDto) {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email },
    });

    // Compte inconnu, désactivé, ou invité pas encore activé (pas de mot de
    // passe) : message unique, aucune distinction (anti-énumération).
    if (!utilisateur || !utilisateur.actif || !utilisateur.motDePasseHash) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const motDePasseValide = await verifierMotDePasse(dto.motDePasse, utilisateur.motDePasseHash);
    if (!motDePasseValide) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    // Refuse un compte sans accès à la société demandée.
    await this.acces(utilisateur.id, dto.societeSlug);
    if (utilisateur.totpActifLe) return this.etape('code', utilisateur.id, dto.societeSlug);
    if (doubleFacteurExige()) return this.etape('enrolement', utilisateur.id, dto.societeSlug);
    return this.ouvrirSession(utilisateur, dto.societeSlug);
  }

  // --- Double authentification ---------------------------------------------

  private etape(etape: EtapeConnexion['etape'], utilisateurId: string, societeSlug: string): EtapeConnexion {
    const jeton = this.jwtService.sign(
      { sub: utilisateurId, slug: societeSlug, but: 'double-facteur' },
      { secret: secretEtape(), expiresIn: '10m' },
    );
    return { etape, jeton };
  }

  private async lireEtape(jeton: string) {
    let p: { sub: string; slug: string; but: string };
    try {
      p = this.jwtService.verify(jeton, { secret: secretEtape() });
    } catch {
      throw new UnauthorizedException('Connexion expirée : saisissez à nouveau votre mot de passe.');
    }
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id: p.sub } });
    if (p.but !== 'double-facteur' || !utilisateur?.actif) throw new UnauthorizedException('Identifiants invalides');
    return { utilisateur, societeSlug: p.slug };
  }

  // Code de l'application (6 chiffres) ou code de secours (usage unique).
  async connexionAvecCode(jeton: string, saisie: string) {
    const { utilisateur, societeSlug } = await this.lireEtape(jeton);
    const secret = utilisateur.totpSecret ? dechiffrerSecret(utilisateur.totpSecret) : null;
    if (!utilisateur.totpActifLe || !secret)
      throw new UnauthorizedException('Double authentification indisponible : contactez le CIO.');
    const code = saisie.trim();
    if (/^\d{6}$/.test(code)) {
      const pas = verifierCode(secret, code, utilisateur.totpDernierPas);
      if (pas === null) throw new UnauthorizedException('Code incorrect.');
      // Conditionnel : deux envois simultanés du même code n'ouvrent qu'une session.
      const { count } = await this.prisma.utilisateur.updateMany({
        where: { id: utilisateur.id, OR: [{ totpDernierPas: null }, { totpDernierPas: { lt: pas } }] },
        data: { totpDernierPas: pas },
      });
      if (!count) throw new UnauthorizedException('Code incorrect.');
    } else {
      const h = hacherCodeSecours(code);
      if (!utilisateur.totpCodesSecours.includes(h)) throw new UnauthorizedException('Code incorrect.');
      await this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { totpCodesSecours: utilisateur.totpCodesSecours.filter((x) => x !== h) },
      });
    }
    return this.ouvrirSession(utilisateur, societeSlug);
  }

  // Première activation : secret généré, montré une seule fois (QR + texte).
  async preparerDoubleFacteur(jeton: string) {
    const { utilisateur } = await this.lireEtape(jeton);
    return this.preparerPour(utilisateur);
  }

  // Le premier code juste prouve que l'application est réglée : activation,
  // codes de secours (affichés une seule fois) et ouverture de la session.
  async activerDoubleFacteur(jeton: string, code: string) {
    const { utilisateur, societeSlug } = await this.lireEtape(jeton);
    const codesSecours = await this.activerPour(utilisateur, code);
    return { ...(await this.ouvrirSession(utilisateur, societeSlug)), codesSecours };
  }

  // Depuis le HUB, par la personne connectée (Salarié : facultatif) — même
  // parcours, la session en cours reste valable.
  async etatDoubleFacteur(utilisateurId: string) {
    const u = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId }, select: { totpActifLe: true } });
    return {
      actifLe: u?.totpActifLe?.toISOString() ?? null,
      exige: doubleFacteurExige(),
    };
  }

  async preparerDoubleFacteurCompte(utilisateurId: string) {
    return this.preparerPour(await this.prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } }));
  }

  async activerDoubleFacteurCompte(utilisateurId: string, code: string) {
    const utilisateur = await this.prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    return { codesSecours: await this.activerPour(utilisateur, code) };
  }

  private async preparerPour(utilisateur: { id: string; email: string; totpActifLe: Date | null }) {
    if (utilisateur.totpActifLe) throw new ConflictException('Double authentification déjà active.');
    const secret = genererSecret();
    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { totpSecret: chiffrerSecret(secret), totpDernierPas: null },
    });
    const lien = lienOtpauth(secret, utilisateur.email);
    return { secret, qr: await QRCode.toDataURL(lien, { margin: 1, width: 220 }) };
  }

  private async activerPour(
    utilisateur: { id: string; email: string; prenom: string; totpActifLe: Date | null; totpSecret: string | null },
    code: string,
  ) {
    if (utilisateur.totpActifLe) throw new ConflictException('Double authentification déjà active.');
    const secret = utilisateur.totpSecret ? dechiffrerSecret(utilisateur.totpSecret) : null;
    if (!secret) throw new BadRequestException('Recommencez l’activation : affichez un nouveau QR code.');
    const pas = verifierCode(secret, code.trim(), null);
    if (pas === null) throw new UnauthorizedException('Code incorrect : vérifiez l’heure du téléphone et réessayez.');
    const { clairs, hashes } = genererCodesSecours();
    await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { totpActifLe: new Date(), totpDernierPas: pas, totpCodesSecours: hashes },
      }),
      this.prisma.evenementCompte.create({
        data: {
          utilisateurId: utilisateur.id,
          type: 'double_facteur_active',
          parId: utilisateur.id,
          detail: 'Application d’authentification',
        },
      }),
    ]);
    this.avertir(utilisateur, 'double_facteur_active');
    return clairs;
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
    this.avertir(utilisateur, 'mot_de_passe_modifie');
    return this.ouvrirSession({ ...utilisateur, sessionsValidesDepuis: maintenant }, societeSlug);
  }

  // Société de l'URL et affectation du compte : celle de la société, sinon
  // l'affectation transverse.
  private async acces(utilisateurId: string, societeSlug: string) {
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
        utilisateurId,
        OR: [{ societeId: societe.id }, { societeId: null }],
        role: { supprimeLe: null },
      },
      include: { role: { include: { permissions: { include: { module: true } } } } },
    });
    const acces =
      affectations.find((a) => a.societeId === societe.id) ?? affectations.find((a) => a.societeId === null);

    if (!acces) {
      throw new UnauthorizedException("Vous n'avez pas accès à cette société");
    }

    return { societe, acces };
  }

  // Connexion d'un compte de secours : trace (journal d'audit) et alerte au
  // CEO et au CIO de la société. L'échec de l'alerte ne bloque pas l'accès.
  private async tracerSecours(utilisateur: { id: string; email: string }, societe: { id: string; nom: string }) {
    const le = new Date();
    await this.prisma.evenementCompte.create({
      data: {
        utilisateurId: utilisateur.id,
        type: 'connexion_secours',
        parId: utilisateur.id,
        detail: `Connexion à ${societe.nom}`,
      },
    });
    const destinataires = await this.prisma.utilisateurSocieteRole.findMany({
      where: {
        societeId: societe.id,
        role: { nom: { in: ['CEO (transverse)', 'CIO (transverse)'] } },
        utilisateur: { actif: true },
      },
      select: { utilisateurId: true },
    });
    await this.notifications.envoyer({
      societeId: societe.id,
      type: 'connexion_secours',
      titre: `Connexion du compte de secours ${utilisateur.email} · ${societe.nom} · le ${le.toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' })}`,
      destinataireIds: destinataires.map((d) => d.utilisateurId),
      parId: null,
    });
  }

  private async ouvrirSession(
    utilisateur: { id: string; email: string; nom: string; prenom: string; sessionsValidesDepuis: Date | null },
    societeSlug: string,
  ) {
    const { societe, acces } = await this.acces(utilisateur.id, societeSlug);

    // Niveau par module (cle), lu dans la matrice RolePermission. societe_admin
    // y a des lignes explicites (validation partout, cf. seed.ts) ; les autres
    // rôles socles (holding_admin/collaborateur) n'en ont pas → {} (fail closed
    // sur toute route marquée @RequiertPermission).
    const permissions: Record<string, string> = {};
    for (const p of acces.role.permissions) {
      permissions[p.module.cle] = p.niveau;
    }

    if (ROLES_SECOURS.has(acces.role.nom)) await this.tracerSecours(utilisateur, societe);

    // Connexions (sécurité du compte : « connexion précédente le… ») et profil
    // affiché dans la coquille (nom affiché, photo).
    const avant = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateur.id },
      select: { derniereConnexionLe: true, nomAffiche: true, photoCle: true },
    });
    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { derniereConnexionLe: new Date(), connexionPrecedenteLe: avant?.derniereConnexionLe ?? null },
    });

    const payload = {
      sub: utilisateur.id,
      email: utilisateur.email,
      societeId: societe.id,
      societeSlug: societe.slug,
      role: acces.role.nom,
      permissions,
      iat: dateEmission(utilisateur.sessionsValidesDepuis),
    };

    return {
      access_token: this.jwtService.sign(payload),
      utilisateur: {
        id: utilisateur.id,
        email: utilisateur.email,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        nomAffiche: avant?.nomAffiche ?? null,
        photoUrl: cheminPhoto(avant?.photoCle),
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

// Le jeton est daté à la seconde, la coupure des sessions à la milliseconde
// (cf. JwtStrategy) : un jeton émis dans la seconde qui suit une coupure
// (reconnexion après un changement de droits, de rôle, de mot de passe…)
// serait refusé d'emblée. On le date alors de la seconde suivant la coupure ;
// un jeton émis AVANT la coupure garde sa date et reste refusé.
export function dateEmission(sessionsValidesDepuis: Date | null, maintenant = Date.now()): number {
  const iat = Math.floor(maintenant / 1000);
  if (!sessionsValidesDepuis) return iat;
  return Math.max(iat, Math.ceil(sessionsValidesDepuis.getTime() / 1000));
}
