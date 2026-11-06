import { NotificationsService } from '../notifications/notifications.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  formatTime,
  ROLE_CEO,
  ROLE_CIO,
  ROLE_COMPANY_ADMIN,
  ROLE_HOLDING_ADMIN,
  ROLE_HUB_ADMIN,
  ROLES_ENDOSSABLES,
} from '@hub/domain';
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
import { dureeJeton } from './session';
import { dureeVerrouillage, ESSAIS_AVANT_VERROUILLAGE, estVerrouille } from './verrouillage';
import type { UtilisateurConnecte } from './jwt.strategy';
import { EmailService, type AvisSecurite } from '../email/email.service';
import { SwitchesService } from '../switches/switches.service';
import { hasFullAccess, RightsService } from '../rights/rights.service';

// Double authentification obligatoire pour tous les rôles (décision du
// 28/10/2026, lot A ; elle épargnait jusque-là le Salarié qui ne pilote pas de
// cellule). Appliquée en production. HUB_DOUBLE_FACTEUR = « obligatoire » la
// force partout ; « desactive » la suspend, production comprise.
export function doubleFacteurExige(env: NodeJS.ProcessEnv = process.env): boolean {
  const reglage = env.HUB_DOUBLE_FACTEUR;
  return reglage === 'obligatoire' || (env.NODE_ENV === 'production' && reglage !== 'desactive');
}

// Suspension pendant le pilote (décision du user, 28/10/2026, qui lève le
// verrou de la revue CIO du 22/10/2026) : aucun code demandé, même aux
// comptes inscrits, dont l'inscription est gardée ; vider le réglage la
// réactive telle quelle.
export function doubleFacteurSuspendue(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HUB_DOUBLE_FACTEUR === 'desactive';
}

// Comptes techniques de secours (revue CIO, 22/10/2026) : sans usage
// quotidien, accès confié au CEO ; chaque connexion est tracée au journal et
// notifiée au CEO et au CIO.
export const ROLES_SECOURS: ReadonlySet<string> = new Set([ROLE_HOLDING_ADMIN, ROLE_COMPANY_ADMIN]);

// Administrateur HUB (décision du 29/10/2026) : carte blanche. Le compte le
// plus puissant du HUB garde la double authentification en production, même
// quand elle est suspendue pour les autres (pilote).
export function doubleFacteurExigePour(role: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return doubleFacteurExige(env) || (role === ROLE_HUB_ADMIN && env.NODE_ENV === 'production');
}
export function doubleFacteurSuspenduePour(role: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return doubleFacteurSuspendue(env) && role !== ROLE_HUB_ADMIN;
}

const estEndossable = (role: string | undefined): role is string =>
  !!role && (ROLES_ENDOSSABLES as readonly string[]).includes(role);

// Jeton d'étape entre le mot de passe et le code : signé avec une autre clé
// que les sessions (jamais accepté comme session), valable 10 minutes.
const secretEtape = () => `${process.env.JWT_SECRET || 'change-moi-en-production'}:double-facteur`;
type EtapeConnexion = { etape: 'code' | 'enrolement'; jeton: string };

// Compte verrouillé (lot C) : 423 ; le message, affiché tel quel par les
// écrans de connexion et du code, donne l'heure de fin (le filtre global ne
// transmet que le message). Aucun essai n'est examiné pendant le verrouillage.
function compteVerrouille(jusquau: Date) {
  return new HttpException(
    `Compte verrouillé jusqu’à ${formatTime(jusquau.toISOString())} (heure de Dakar) après ${ESSAIS_AVANT_VERROUILLAGE} essais infructueux. Le CIO peut le débloquer plus tôt.`,
    HttpStatus.LOCKED,
  );
}

// Contenu d'un jeton de session, hors dates (iat, debut, exp).
type ContenuSession = {
  sub: string;
  email: string;
  societeId: string | null;
  societeSlug: string | null;
  role: string;
  permissions: Record<string, string>;
  // Administrateur HUB : `role` est alors le rôle endossé.
  adminHub?: true;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notifications: NotificationsService,
    private email: EmailService,
    private switches: SwitchesService,
    private rights: RightsService,
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
    this.refuserSiVerrouille(utilisateur);

    const motDePasseValide = await verifierMotDePasse(dto.motDePasse, utilisateur.motDePasseHash);
    if (!motDePasseValide) {
      const jusquau = await this.compterEchec(utilisateur);
      throw jusquau ? compteVerrouille(jusquau) : new UnauthorizedException('Identifiants invalides');
    }

    // Refuse un compte sans accès à la société demandée.
    const { acces } = await this.acces(utilisateur.id, dto.societeSlug);
    const role = acces.role.nom;
    // Maintenance du HUB : dit tout de suite, avant le code de double authentification.
    await this.switches.refuseDuringMaintenance(role === ROLE_HUB_ADMIN || role === ROLE_CIO);
    if (utilisateur.totpActifLe && !doubleFacteurSuspenduePour(role))
      return this.etape('code', utilisateur.id, dto.societeSlug);
    if (doubleFacteurExigePour(role)) return this.etape('enrolement', utilisateur.id, dto.societeSlug);
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
    this.refuserSiVerrouille(utilisateur);
    return { utilisateur, societeSlug: p.slug };
  }

  // --- Verrouillage (lot C, src/auth/verrouillage.ts) ------------------------

  private refuserSiVerrouille(u: { verrouilleJusquau: Date | null }) {
    if (u.verrouilleJusquau && estVerrouille(u.verrouilleJusquau)) throw compteVerrouille(u.verrouilleJusquau);
  }

  // Essai infructueux (mot de passe ou code). Au dixième, le compte est
  // verrouillé : une seule requête voit le compteur atteindre le seuil, même
  // si plusieurs essais arrivent ensemble. Rend la fin du verrouillage posé.
  private async compterEchec(u: { id: string; email: string; prenom: string }): Promise<Date | null> {
    const { echecsConnexion, verrouillages } = await this.prisma.utilisateur.update({
      where: { id: u.id },
      data: { echecsConnexion: { increment: 1 } },
      select: { echecsConnexion: true, verrouillages: true },
    });
    if (echecsConnexion !== ESSAIS_AVANT_VERROUILLAGE) return null;
    const le = new Date();
    const duree = dureeVerrouillage(verrouillages);
    const jusquau = new Date(le.getTime() + duree);
    await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id: u.id },
        data: { echecsConnexion: 0, verrouilleJusquau: jusquau, verrouillages: { increment: 1 } },
      }),
      this.prisma.evenementCompte.create({
        data: {
          utilisateurId: u.id,
          type: 'compte_verrouille',
          parId: null,
          detail: `${ESSAIS_AVANT_VERROUILLAGE} essais infructueux ; verrouillé ${duree / 60_000} min`,
        },
      }),
    ]);
    void this.email.envoyerAvisSecurite({
      email: u.email,
      prenom: u.prenom,
      evenement: 'compte_verrouille',
      le,
      jusquau,
    });
    return jusquau;
  }

  private async codeRefuse(u: { id: string; email: string; prenom: string }) {
    const jusquau = await this.compterEchec(u);
    return jusquau ? compteVerrouille(jusquau) : new UnauthorizedException('Code incorrect.');
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
      if (pas === null) throw await this.codeRefuse(utilisateur);
      // Conditionnel : deux envois simultanés du même code n'ouvrent qu'une session.
      const { count } = await this.prisma.utilisateur.updateMany({
        where: { id: utilisateur.id, OR: [{ totpDernierPas: null }, { totpDernierPas: { lt: pas } }] },
        data: { totpDernierPas: pas },
      });
      if (!count) throw new UnauthorizedException('Code incorrect.');
    } else {
      const h = hacherCodeSecours(code);
      if (!utilisateur.totpCodesSecours.includes(h)) throw await this.codeRefuse(utilisateur);
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

  // Depuis le HUB, par la personne connectée, là où elle n'est pas exigée
  // (développement, démonstration) — même parcours, la session en cours reste
  // valable.
  async etatDoubleFacteur(utilisateurId: string, adminHub = false) {
    const u = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId }, select: { totpActifLe: true } });
    const role = adminHub ? ROLE_HUB_ADMIN : '';
    return {
      actifLe: u?.totpActifLe?.toISOString() ?? null,
      exige: doubleFacteurExigePour(role),
      suspendue: doubleFacteurSuspenduePour(role),
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
  // sont coupées ; une nouvelle est rendue pour ne pas déconnecter l'auteur,
  // sur le même début de session (le changement ne repousse pas les 12 h).
  async changerMotDePasse(
    utilisateurId: string,
    societeSlug: string,
    actuel: string,
    nouveau: string,
    debutSession: number,
    roleEndosse?: string,
  ) {
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
    return this.ouvrirSession(
      { ...utilisateur, sessionsValidesDepuis: maintenant },
      societeSlug,
      debutSession,
      roleEndosse,
    );
  }

  // Prolongation par l'activité dans le HUB (lot B) : même rôle, même début
  // de session ; seule l'expiration avance (session.ts). Les droits sont
  // relus (matrice, puis interrupteurs : un module coupé ou rendu entre-temps)
  // et rendus avec le jeton — l'écran les redemande aussi dès qu'un avis
  // « Vos droits ont changé » arrive (31/10/2026). Un compte désactivé ou une session coupée
  // n'arrivent pas jusqu'ici (JwtStrategy). Jamais daté avant le jeton
  // présenté (cf. dateEmission).
  async prolongerSession(u: UtilisateurConnecte) {
    const iat = Math.max(Math.floor(Date.now() / 1000), u.emissionJeton);
    const permissions = await this.rights.forUser(u);
    const contenu = {
      sub: u.userId,
      email: u.email,
      societeId: u.societeId,
      societeSlug: u.societeSlug,
      role: u.role,
      permissions,
      ...(u.adminHub && { adminHub: true as const }),
    };
    return { access_token: this.signerSession(contenu, iat, u.debutSession), permissions };
  }

  // Administrateur HUB : endosse un autre rôle (menu du compte), mêmes droits
  // complets, même début de session. Revérifie que le compte détient
  // toujours ce rôle d'administration dans la société de la session.
  async endosserRole(u: UtilisateurConnecte, role: string) {
    if (!u.adminHub || !u.societeSlug) throw new ForbiddenException('Réservé à l’Administrateur HUB.');
    if (!estEndossable(role)) throw new BadRequestException('Rôle inconnu.');
    const { societe, acces } = await this.acces(u.userId, u.societeSlug);
    if (acces.role.nom !== ROLE_HUB_ADMIN) throw new ForbiddenException('Réservé à l’Administrateur HUB.');
    const permissions = await this.rights.full();
    await this.tracerRoleEndosse(u.userId, `${societe.nom} · en tant que ${role}`);
    const iat = Math.max(Math.floor(Date.now() / 1000), u.emissionJeton);
    const contenu = {
      sub: u.userId,
      email: u.email,
      societeId: societe.id,
      societeSlug: societe.slug,
      role,
      permissions,
      adminHub: true as const,
    };
    return { access_token: this.signerSession(contenu, iat, u.debutSession), role, permissions };
  }

  private async tracerRoleEndosse(utilisateurId: string, detail: string) {
    await this.prisma.evenementCompte.create({
      data: { utilisateurId, type: 'role_endosse', parId: utilisateurId, detail },
    });
  }

  private signerSession(contenu: ContenuSession, iat: number, debut: number) {
    // Inactivité de l'Administrateur HUB, quel que soit le rôle endossé.
    const duree = dureeJeton(contenu.adminHub ? ROLE_HUB_ADMIN : contenu.role, debut, iat);
    if (duree <= 0) throw new UnauthorizedException('Session expirée — reconnecte-toi.');
    return this.jwtService.sign({ ...contenu, debut, iat }, { expiresIn: duree });
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
      include: { role: true },
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
        role: { nom: { in: [ROLE_CEO, ROLE_CIO] } },
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

  // `debut` : heure de la connexion, reprise d'une session en cours ; absente,
  // la session commence avec ce jeton. `roleEndosse` : rôle que garde un
  // Administrateur HUB (CEO à défaut).
  private async ouvrirSession(
    utilisateur: { id: string; email: string; nom: string; prenom: string; sessionsValidesDepuis: Date | null },
    societeSlug: string,
    debut?: number,
    roleEndosse?: string,
  ) {
    const { societe, acces } = await this.acces(utilisateur.id, societeSlug);
    const adminHub = acces.role.nom === ROLE_HUB_ADMIN;

    // Droits par étape (matrice, interrupteurs de la société appliqués).
    // societe_admin y a des lignes explicites (cf. socle.ts) ; les autres
    // rôles socles (holding_admin/collaborateur) n'en ont pas → {} (refus par
    // défaut sur toute route marquée @RequiertPermission). Carte blanche
    // (Administrateur HUB, CIO) : tout.
    const role = adminHub ? (estEndossable(roleEndosse) ? roleEndosse : ROLE_CEO) : acces.role.nom;
    const fullAccess = hasFullAccess({ adminHub, role });
    await this.switches.refuseDuringMaintenance(fullAccess);
    const permissions = fullAccess ? await this.rights.full() : await this.rights.forRole(acces.roleId, societe.id);
    if (adminHub && debut === undefined) {
      await this.tracerRoleEndosse(utilisateur.id, `Connexion à ${societe.nom} · en tant que ${role}`);
    }

    if (ROLES_SECOURS.has(acces.role.nom)) await this.tracerSecours(utilisateur, societe);

    // Connexions (sécurité du compte : « connexion précédente le… ») et profil
    // affiché dans la coquille (nom affiché, photo).
    const avant = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateur.id },
      select: { derniereConnexionLe: true, nomAffiche: true, photoCle: true },
    });
    // Connexion réussie : essais infructueux et récidives remis à zéro (lot C).
    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        derniereConnexionLe: new Date(),
        connexionPrecedenteLe: avant?.derniereConnexionLe ?? null,
        echecsConnexion: 0,
        verrouillages: 0,
        verrouilleJusquau: null,
      },
    });

    const contenu = {
      sub: utilisateur.id,
      email: utilisateur.email,
      societeId: societe.id,
      societeSlug: societe.slug,
      role,
      permissions,
      ...(adminHub && { adminHub: true as const }),
    };
    const iat = dateEmission(utilisateur.sessionsValidesDepuis);

    return {
      access_token: this.signerSession(contenu, iat, debut ?? iat),
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
      role,
      adminHub,
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
