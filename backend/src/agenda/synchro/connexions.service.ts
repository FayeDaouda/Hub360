import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { genererJeton, hacherJeton } from '../../auth/jetons';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { identifyCompany, runAsSystem } from '../../tenancy/tenant-context';
import type { Acteur } from '../agenda.service';
import { lienAgendaHub, urlApiPublique, urlFront } from '../liens';
import { chiffrer, cleChiffrement, dechiffrer } from './chiffrement';
import { ClientGoogle, pkce } from './google.client';
import { retirerDeGoogle } from './retrait';
import { SynchroAgendaService, VERROU_MS } from './synchro.service';

// Le temps d'autoriser chez Google, puis de confirmer dans le HUB.
const DUREE_ETAT_MS = 10 * 60_000;
// Agendas importés au plus par connexion (volume de la synchronisation).
export const AGENDAS_IMPORTES_MAX = 10;
export const redirectionGoogle = () => `${urlApiPublique()}/agenda/google/retour`;

// Agendas connectés d'une personne (16/11/2026) : Google aujourd'hui (Apple
// ensuite). Chacun connecte le sien, dans la société de sa session, choisit
// les agendas à importer et celui où le HUB écrit (un agenda dont il est
// propriétaire), et peut se déconnecter (l'accès est révoqué chez Google).
// Connexion en trois temps, liée à la personne qui l'a lancée :
//  1. le HUB rend l'adresse d'autorisation (état aléatoire, PKCE) ;
//  2. au retour de Google, rien n'est encore relié : le code est gardé
//     chiffré et un ticket est remis au navigateur (fragment « # », qui ne
//     quitte jamais le navigateur) ;
//  3. la session HUB de la personne confirme le ticket — un lien
//     d'autorisation envoyé à quelqu'un d'autre ne relie donc jamais son
//     Google à notre compte. Un e-mail avertit de chaque connexion.
// L'accès chiffré n'est jamais renvoyé à l'écran.
@Injectable()
export class ConnexionsAgendaService {
  private readonly log = new Logger('ConnexionsAgenda');

  constructor(
    private prisma: PrismaService,
    private google: ClientGoogle,
    private synchro: SynchroAgendaService,
    private email: EmailService,
  ) {}

  async etat(a: Acteur) {
    const connexions = await this.prisma.connexionAgenda.findMany({
      where: { societeId: a.societeId, utilisateurId: a.userId },
      include: { agendas: { orderBy: { nom: 'asc' } } },
      orderBy: { creeLe: 'asc' },
    });
    const chiffrementPret = !!cleChiffrement();
    return {
      disponibles: { google: chiffrementPret && this.google.configure(), apple: false },
      connexions: connexions.map((c) => ({
        id: c.id,
        fournisseur: c.fournisseur,
        compte: c.compte,
        derniereSynchroLe: c.derniereSynchroLe?.toISOString() ?? null,
        erreur: c.erreur,
        agendas: c.agendas.map((x) => ({
          id: x.id,
          nom: x.nom,
          couleur: x.couleur,
          importe: x.importe,
          cible: x.cible,
          proprietaire: x.proprietaire,
        })),
      })),
    };
  }

  // 1. L'adresse où envoyer la personne pour autoriser l'accès chez Google.
  async debutGoogle(a: Acteur): Promise<{ url: string }> {
    if (!cleChiffrement() || !this.google.configure()) {
      throw new BadRequestException('La connexion à Google Agenda n’est pas encore configurée sur ce HUB.');
    }
    // L'état : 256 bits d'aléa, seule son empreinte est gardée.
    const { clair: etat, hash } = genererJeton();
    const { verificateur, defi } = pkce();
    await this.prisma.etatConnexionAgenda.create({
      data: {
        societeId: a.societeId,
        utilisateurId: a.userId,
        etatHash: hash,
        verificateur,
        expireLe: new Date(Date.now() + DUREE_ETAT_MS),
      },
    });
    return { url: this.google.urlAutorisation(etat, defi, redirectionGoogle()) };
  }

  // 2. Retour de Google (route publique, sans session) : le code est gardé
  // chiffré, un ticket est remis au navigateur (dans le fragment de
  // l'adresse). Rien n'est encore relié.
  async retourGoogle(etat: string | undefined, code: string | undefined, erreur: string | undefined): Promise<string> {
    const enCours = etat
      ? await runAsSystem('agenda : retour de Google', () =>
          this.prisma.etatConnexionAgenda.findUnique({
            where: { etatHash: hacherJeton(etat) },
            include: { societe: { select: { slug: true } } },
          }),
        )
      : null;
    // Inconnu, ou déjà passé par ici (un ticket existe) : rien.
    if (!enCours || enCours.ticketHash) return `${urlFront()}/?connexion=echec`;
    identifyCompany(enCours.societeId);
    const retour = (resultat: string, suite = '') =>
      `${lienAgendaHub(enCours.societe.slug)}?connexion=${resultat}${suite}`;
    const cle = cleChiffrement();
    if (erreur || !code || enCours.expireLe < new Date() || !cle) {
      await this.prisma.etatConnexionAgenda.delete({ where: { id: enCours.id } });
      return retour('annulee');
    }
    const ticket = genererJeton();
    // Un seul ticket par autorisation, même si Google rappelle deux fois.
    const pose = await this.prisma.etatConnexionAgenda.updateMany({
      where: { id: enCours.id, ticketHash: null },
      data: { codeChiffre: chiffrer(code, cle), ticketHash: ticket.hash },
    });
    if (!pose.count) return retour('echec');
    // Dans le fragment (#) : jamais envoyé à un serveur, ni dans un Referer,
    // ni dans un journal ; seul le navigateur de la personne le lit.
    return retour('confirmer', `#ticket=${ticket.clair}`);
  }

  // 3. La session HUB de la personne confirme : seulement la sienne, dans la
  // même société, dans les dix minutes. Alors seulement le compte est relié.
  async confirmerGoogle(a: Acteur, ticket: string) {
    const ticketHash = hacherJeton(ticket);
    const enCours = await this.prisma.etatConnexionAgenda.findUnique({ where: { ticketHash } });
    const cle = cleChiffrement();
    const introuvable = new NotFoundException('Connexion introuvable ou déjà utilisée.');
    if (!enCours?.codeChiffre || !cle) throw introuvable;
    // Usage unique, quoi qu'il arrive ensuite : une seule confirmation passe
    // (deux onglets en même temps : la seconde ne trouve plus rien).
    const pris = await this.prisma.etatConnexionAgenda.deleteMany({ where: { id: enCours.id, ticketHash } });
    if (!pris.count) throw introuvable;
    // (Une autre société : déjà introuvable, l'isolation filtre la lecture.)
    if (enCours.utilisateurId !== a.userId || enCours.societeId !== a.societeId) {
      this.log.warn(
        `confirmation refusée : autorisation de ${enCours.utilisateurId}/${enCours.societeId} présentée par ${a.userId}/${a.societeId}`,
      );
      throw new ForbiddenException('Cette autorisation Google a été lancée depuis un autre compte du HUB.');
    }
    if (enCours.expireLe < new Date())
      throw new BadRequestException('Autorisation expirée : recommencez la connexion.');

    let jeton: { rafraichissement: string; compte: string };
    try {
      jeton = await this.google.echangerCode(
        dechiffrer(enCours.codeChiffre, cle),
        enCours.verificateur,
        redirectionGoogle(),
      );
    } catch (e) {
      this.log.error(`échange du code Google : ${e instanceof Error ? e.message : e}`);
      throw new BadRequestException('Google n’a pas confirmé l’autorisation : recommencez la connexion.');
    }
    const ou = {
      societeId_utilisateurId_fournisseur: {
        societeId: a.societeId,
        utilisateurId: a.userId,
        fournisseur: 'google' as const,
      },
    };
    const avant = await this.prisma.connexionAgenda.findUnique({ where: ou, include: { liens: true } });
    // Un autre compte Google : les réunions écrites dans l'ancien en sont
    // retirées, son accès révoqué, et tout ce qui en venait quitte le HUB.
    // (Même compte : surtout pas de révocation, elle couperait aussi le
    // nouvel accès, Google révoquant toute l'autorisation.)
    if (avant && avant.compte !== jeton.compte) {
      // Pas pendant une synchronisation de l'ancien compte (elle écrirait
      // encore chez lui) : le nouvel accès est alors rendu à Google.
      if (!(await this.prendreVerrou(avant.id))) {
        await this.google.revoquer(jeton.rafraichissement).catch(() => undefined);
        throw new ConflictException('Synchronisation en cours : recommencez la connexion dans un instant.');
      }
      // Ancien compte injoignable : on relie quand même le nouveau.
      if ((await retirerDeGoogle(this.google, avant, cle, this.log)) === 'injoignable') {
        this.log.warn(`ancien compte Google ${avant.id} injoignable : réunions laissées chez lui`);
      }
      await this.prisma.connexionAgenda.delete({ where: { id: avant.id } });
    }
    const maintenant = new Date();
    const accesChiffre = chiffrer(jeton.rafraichissement, cle);
    const connexion = await this.prisma.connexionAgenda.upsert({
      where: ou,
      create: {
        societeId: a.societeId,
        utilisateurId: a.userId,
        fournisseur: 'google',
        compte: jeton.compte,
        accesChiffre,
        autoriseLe: maintenant,
      },
      // Pas encore synchronisée avec ce nouvel accès : les invitations
      // repartent par e-mail jusqu'à la première tournée réussie.
      update: { accesChiffre, erreur: null, autoriseLe: maintenant, derniereSynchroLe: null },
    });
    // Ses agendas, à la première connexion : le principal importé, et le HUB
    // y écrit s'il lui appartient (modifiable ensuite). Une reconnexion garde
    // les choix déjà faits.
    const dejaChoisis = await this.prisma.agendaExterne.count({ where: { connexionId: connexion.id } });
    try {
      for (const g of await this.google.agendas(await this.google.acces(jeton.rafraichissement))) {
        await this.prisma.agendaExterne.upsert({
          where: { connexionId_idExterne: { connexionId: connexion.id, idExterne: g.id } },
          create: {
            societeId: a.societeId,
            connexionId: connexion.id,
            idExterne: g.id,
            nom: g.nom,
            couleur: g.couleur,
            proprietaire: g.proprietaire,
            importe: !dejaChoisis && g.principal,
            cible: !dejaChoisis && g.principal && g.proprietaire,
          },
          update: { nom: g.nom, couleur: g.couleur, proprietaire: g.proprietaire },
        });
      }
    } catch (e) {
      // Relié quand même : la prochaine tournée relira la liste.
      this.log.warn(`liste des agendas Google : ${e instanceof Error ? e.message : e}`);
    }
    await this.avertir(a.userId, jeton.compte, maintenant);
    // Première synchronisation tout de suite, sans faire attendre l'écran.
    Promise.resolve()
      .then(() => this.synchro.synchroniser(connexion.id))
      .catch((e) => this.log.error(`première synchro ${connexion.id} : ${e instanceof Error ? e.message : e}`));
    return this.etat(a);
  }

  // Les agendas importés (dix au plus), et celui où le HUB écrit : un agenda
  // dont la personne est propriétaire, ou aucun.
  async choisirAgendas(a: Acteur, connexionId: string, importes: string[], cible: string | null) {
    const c = await this.connexion(a, connexionId);
    const parId = new Map(c.agendas.map((x) => [x.id, x]));
    if (importes.some((x) => !parId.has(x)) || (cible && !parId.has(cible))) {
      throw new BadRequestException('Agenda inconnu pour cette connexion.');
    }
    if (new Set(importes).size > AGENDAS_IMPORTES_MAX) {
      throw new BadRequestException(`${AGENDAS_IMPORTES_MAX} agendas affichés au plus.`);
    }
    if (cible && !parId.get(cible)!.proprietaire) {
      throw new BadRequestException('Le HUB n’écrit que dans un agenda qui vous appartient, jamais un agenda partagé.');
    }
    await this.prisma.$transaction(
      c.agendas.map((x) =>
        this.prisma.agendaExterne.update({
          where: { id: x.id },
          data: { importe: importes.includes(x.id), cible: x.id === cible },
        }),
      ),
    );
    // Un agenda qui n'est plus importé : ses rendez-vous quittent le HUB.
    await this.prisma.evenementExterne.deleteMany({
      where: { agendaId: { in: c.agendas.filter((x) => !importes.includes(x.id)).map((x) => x.id) } },
    });
    return this.etat(a);
  }

  async synchroniserMaintenant(a: Acteur, connexionId: string) {
    await this.connexion(a, connexionId);
    if (!(await this.synchro.synchroniser(connexionId))) {
      throw new ConflictException('Une synchronisation est déjà en cours : le résultat arrive dans un instant.');
    }
    return this.etat(a);
  }

  // Déconnecter : les réunions que le HUB avait écrites chez Google en sont
  // retirées, l'accès est révoqué, tout ce qui venait de ce compte quitte le
  // HUB. Google injoignable alors que l'accès vaut encore : on ne laisse pas
  // de réunions orphelines chez Google, on demande de réessayer.
  async deconnecter(a: Acteur, connexionId: string) {
    const c = await this.connexion(a, connexionId);
    // Pas pendant une synchronisation (elle écrirait encore chez Google
    // après le nettoyage) : le verrou est pris, puis la connexion supprimée.
    if (!(await this.prendreVerrou(c.id))) {
      throw new ConflictException('Synchronisation en cours : réessayez dans un instant.');
    }
    const cle = cleChiffrement();
    if (cle && c.fournisseur === 'google' && (await retirerDeGoogle(this.google, c, cle, this.log)) === 'injoignable') {
      await this.prisma.connexionAgenda.updateMany({ where: { id: c.id }, data: { synchroDepuis: null } });
      throw new ServiceUnavailableException('Google Agenda ne répond pas : réessayez dans un instant.');
    }
    await this.prisma.connexionAgenda.delete({ where: { id: c.id } });
    return this.etat(a);
  }

  // Le verrou de synchronisation d'une connexion, s'il est libre (ou abandonné).
  private async prendreVerrou(id: string): Promise<boolean> {
    const maintenant = new Date();
    const { count } = await this.prisma.connexionAgenda.updateMany({
      where: { id, OR: [{ synchroDepuis: null }, { synchroDepuis: { lt: new Date(+maintenant - VERROU_MS) } }] },
      data: { synchroDepuis: maintenant },
    });
    return count > 0;
  }

  private async connexion(a: Acteur, id: string) {
    const c = await this.prisma.connexionAgenda.findFirst({
      where: { id, societeId: a.societeId, utilisateurId: a.userId },
      include: { agendas: true, liens: true },
    });
    if (!c) throw new NotFoundException('Connexion introuvable');
    return c;
  }

  // Avis de sécurité : un compte Google vient d'être relié au sien. Envoyé
  // sans retarder la réponse ; un échec d'envoi n'est jamais bloquant.
  private async avertir(utilisateurId: string, compte: string, le: Date) {
    const u = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { email: true, prenom: true },
    });
    if (u)
      void this.email.envoyerAvisSecurite({
        email: u.email,
        prenom: u.prenom,
        evenement: 'agenda_connecte',
        le,
        detail: compte,
      });
  }
}
