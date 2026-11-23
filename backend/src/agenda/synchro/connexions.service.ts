import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
// Comptes reliés au plus par personne (18/11/2026 : perso, pro…).
export const COMPTES_MAX = 5;
export const redirectionGoogle = () => `${urlApiPublique()}/agenda/google/retour`;

// Agendas connectés d'une personne (16/11/2026) : Google aujourd'hui (Apple
// ensuite). Chacun connecte les siens, dans la société de sa session —
// plusieurs comptes (18/11/2026 : perso, pro…), chacun activé ou en pause —,
// choisit les agendas affichés dans le HUB et le seul agenda, tous comptes
// confondus, où le HUB écrit (un agenda dont il est propriétaire), et peut
// se déconnecter (l'accès est révoqué chez Google).
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
    const couleur = (c: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
    return {
      disponibles: { google: chiffrementPret && this.google.configure(), apple: false },
      connexions: connexions.map((c) => ({
        id: c.id,
        fournisseur: c.fournisseur,
        compte: c.compte,
        active: c.active,
        derniereSynchroLe: c.derniereSynchroLe?.toISOString() ?? null,
        erreur: c.erreur,
        agendas: c.agendas.map((x) => ({
          id: x.id,
          nom: x.nom,
          couleur: couleur(x.couleur),
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

    let jeton: { rafraichissement: string; compte: string; sujet: string };
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
    // Plusieurs comptes par personne (18/11/2026), reconnus par leur
    // identifiant stable (une adresse renommée reste le même compte) : celui-ci
    // est relié de nouveau (accès renouvelé, choix gardés, réactivé), ou ajouté.
    const ou = {
      societeId_utilisateurId_fournisseur_idCompte: {
        societeId: a.societeId,
        utilisateurId: a.userId,
        fournisseur: 'google' as const,
        idCompte: jeton.sujet,
      },
    };
    const existe = await this.prisma.connexionAgenda.findUnique({ where: ou, select: { id: true } });
    if (!existe) {
      const comptes = await this.prisma.connexionAgenda.count({
        where: { societeId: a.societeId, utilisateurId: a.userId },
      });
      // Refusé, sans révoquer : la révocation couperait toute l'autorisation
      // Google, y compris ce même compte relié dans une autre société.
      if (comptes >= COMPTES_MAX) {
        throw new BadRequestException(`${COMPTES_MAX} comptes reliés au plus : déconnectez-en un d’abord.`);
      }
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
        idCompte: jeton.sujet,
        accesChiffre,
        autoriseLe: maintenant,
      },
      // Pas encore synchronisée avec ce nouvel accès : les invitations
      // repartent par e-mail jusqu'à la première tournée réussie. L'adresse
      // suit celle du compte (renommage).
      update: {
        compte: jeton.compte,
        accesChiffre,
        erreur: null,
        autoriseLe: maintenant,
        derniereSynchroLe: null,
        active: true,
      },
    });
    // Ses agendas, à la première connexion : le principal importé, et le HUB
    // y écrit s'il lui appartient et si rien d'autre n'est choisi (modifiable
    // ensuite). Une reconnexion garde les choix déjà faits.
    const dejaChoisis = await this.prisma.agendaExterne.count({ where: { connexionId: connexion.id } });
    try {
      const agendas = await this.google.agendas(await this.google.acces(jeton.rafraichissement));
      for (const g of agendas) {
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
          },
          update: { nom: g.nom, couleur: g.couleur, proprietaire: g.proprietaire },
        });
      }
      const principal = agendas.find((g) => g.principal && g.proprietaire);
      if (!dejaChoisis && principal) await this.cibleSiAucune(a, connexion.id, principal.id);
    } catch (e) {
      // Relié quand même : la prochaine tournée relira la liste.
      this.log.warn(`liste des agendas Google : ${e instanceof Error ? e.message : e}`);
    }
    await this.avertir(a.userId, jeton.compte, maintenant);
    // Première synchronisation tout de suite, sans faire attendre l'écran.
    this.synchroniserPlusTard(connexion.id);
    return this.etat(a);
  }

  // Un agenda affiché ou masqué dans le HUB (colonne de gauche, fenêtre),
  // dix au plus par compte. Masqué : ses rendez-vous quittent le HUB ;
  // affiché : ils arrivent à la synchronisation lancée aussitôt.
  async afficherAgenda(a: Acteur, connexionId: string, agendaId: string, importe: boolean) {
    const c = await this.connexion(a, connexionId);
    const agenda = c.agendas.find((x) => x.id === agendaId);
    if (!agenda) throw new NotFoundException('Agenda inconnu pour ce compte.');
    if (importe && !agenda.importe && c.agendas.filter((x) => x.importe).length >= AGENDAS_IMPORTES_MAX) {
      throw new BadRequestException(`${AGENDAS_IMPORTES_MAX} agendas affichés au plus par compte.`);
    }
    await this.prisma.agendaExterne.update({ where: { id: agenda.id }, data: { importe } });
    if (!importe) await this.prisma.evenementExterne.deleteMany({ where: { agendaId: agenda.id } });
    else if (c.active) this.synchroniserPlusTard(c.id);
    return this.etat(a);
  }

  // Le seul agenda où le HUB écrit ses réunions, tous comptes confondus : un
  // agenda à soi, d'un compte actif — ou aucun. L'ancien est vidé de ce que
  // le HUB y avait écrit à la synchronisation suivante, lancée aussitôt.
  async choisirCible(a: Acteur, agendaId: string | null) {
    const miens = { societeId: a.societeId, utilisateurId: a.userId };
    if (agendaId) {
      const agenda = await this.prisma.agendaExterne.findFirst({
        where: { id: agendaId, connexion: miens },
        include: { connexion: { select: { active: true } } },
      });
      if (!agenda) throw new NotFoundException('Agenda inconnu.');
      if (!agenda.proprietaire) {
        throw new BadRequestException(
          'Le HUB n’écrit que dans un agenda qui vous appartient, jamais un agenda partagé.',
        );
      }
      if (!agenda.connexion.active) throw new BadRequestException('Ce compte est en pause : réactivez-le d’abord.');
    }
    // Atomique (transaction sérialisable) : deux choix simultanés ne laissent
    // jamais deux agendas où le HUB écrit — le second échoue et se refait.
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.agendaExterne.updateMany({ where: { cible: true, connexion: miens }, data: { cible: false } });
          if (agendaId) await tx.agendaExterne.update({ where: { id: agendaId }, data: { cible: true } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
        throw new ConflictException('Un autre changement est en cours : réessayez.');
      }
      throw e;
    }
    const actives = await this.prisma.connexionAgenda.findMany({
      where: { ...miens, active: true },
      select: { id: true },
    });
    for (const c of actives) this.synchroniserPlusTard(c.id);
    return this.etat(a);
  }

  // Activer ou mettre en pause un compte (18/11/2026). En pause : les
  // réunions que le HUB y avait écrites en sont retirées (sans couper
  // l'accès), ses rendez-vous quittent le HUB, plus rien ne se synchronise ;
  // la reprise relit tout. Google injoignable : on demande de réessayer
  // (jamais de réunions laissées figées chez Google).
  async activer(a: Acteur, connexionId: string, active: boolean) {
    const c = await this.connexion(a, connexionId);
    if (c.active === active) return this.etat(a);
    if (active) {
      await this.prisma.connexionAgenda.update({
        where: { id: c.id },
        data: { active: true, erreur: null, derniereSynchroLe: null },
      });
      this.synchroniserPlusTard(c.id);
      return this.etat(a);
    }
    // Sans la clé, rien ne peut être retiré chez Google : pas de pause (les
    // réunions y resteraient figées, sans plus de trace pour les retirer).
    const cle = cleChiffrement();
    if (!cle) throw new ServiceUnavailableException('La synchronisation est indisponible sur ce HUB pour l’instant.');
    await this.retirerSousVerrou(c, cle, false);
    await this.prisma.$transaction([
      this.prisma.lienExportAgenda.deleteMany({ where: { connexionId: c.id } }),
      this.prisma.evenementExterne.deleteMany({ where: { agendaId: { in: c.agendas.map((x) => x.id) } } }),
      this.prisma.connexionAgenda.update({ where: { id: c.id }, data: { erreur: null, synchroDepuis: null } }),
    ]);
    return this.etat(a);
  }

  // Le HUB écrit dans l'agenda principal d'un compte qu'on vient de relier,
  // seulement si aucun autre n'est déjà choisi (tous comptes confondus) :
  // atomique, deux connexions simultanées ne font jamais deux cibles.
  private async cibleSiAucune(a: Acteur, connexionId: string, idExterne: string) {
    const miens = { societeId: a.societeId, utilisateurId: a.userId };
    try {
      await this.prisma.$transaction(
        async (tx) => {
          if (await tx.agendaExterne.count({ where: { cible: true, connexion: miens } })) return;
          await tx.agendaExterne.updateMany({ where: { connexionId, idExterne }, data: { cible: true } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      // Une autre connexion l'a fait au même moment : c'est elle qui l'emporte.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034')) throw e;
    }
  }

  // Une synchronisation lancée sans faire attendre l'écran.
  private synchroniserPlusTard(connexionId: string) {
    Promise.resolve()
      .then(() => this.synchro.synchroniser(connexionId))
      .catch((e) => this.log.error(`synchro ${connexionId} : ${e instanceof Error ? e.message : e}`));
  }

  async synchroniserMaintenant(a: Acteur, connexionId: string) {
    const c = await this.connexion(a, connexionId);
    if (!c.active) throw new BadRequestException('Ce compte est en pause : réactivez-le d’abord.');
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
    const cle = cleChiffrement();
    if (cle && c.fournisseur === 'google') await this.retirerSousVerrou(c, cle, true);
    await this.prisma.connexionAgenda.delete({ where: { id: c.id } });
    return this.etat(a);
  }

  // Retirer de Google ce que le HUB y a écrit (pause, déconnexion), dans
  // l'ordre qui ne peut rien casser : le verrou ; le compte en pause (plus
  // aucune synchronisation ne prendra ces réunions pour « supprimées chez
  // Google » et ne les annulerait dans le HUB) ; la liste relue sous verrou ;
  // le retrait. Google injoignable : tout revient comme avant, on réessaiera.
  private async retirerSousVerrou(
    c: { id: string; active: boolean; accesChiffre: string },
    cle: Buffer,
    revoquer: boolean,
  ) {
    if (!(await this.prendreVerrou(c.id))) {
      throw new ConflictException('Synchronisation en cours : réessayez dans un instant.');
    }
    await this.prisma.connexionAgenda.update({ where: { id: c.id }, data: { active: false } });
    const liens = await this.prisma.lienExportAgenda.findMany({
      where: { connexionId: c.id },
      select: { agendaId: true, idExterne: true },
    });
    const resultat = await retirerDeGoogle(this.google, { ...c, liens }, cle, this.log, { revoquer });
    if (resultat === 'injoignable') {
      await this.prisma.connexionAgenda.update({
        where: { id: c.id },
        data: { active: c.active, synchroDepuis: null },
      });
      throw new ServiceUnavailableException('Google Agenda ne répond pas : réessayez dans un instant.');
    }
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
