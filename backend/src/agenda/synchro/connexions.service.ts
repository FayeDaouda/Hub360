import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { genererJeton, hacherJeton } from '../../auth/jetons';
import { PrismaService } from '../../prisma/prisma.service';
import { identifyCompany, runAsSystem } from '../../tenancy/tenant-context';
import type { Acteur } from '../agenda.service';
import { lienAgendaHub, urlApiPublique, urlFront } from '../liens';
import { chiffrer, cleChiffrement, dechiffrer } from './chiffrement';
import { ClientGoogle, pkce } from './google.client';
import { SynchroAgendaService } from './synchro.service';

// Le temps d'autoriser chez Google.
const DUREE_ETAT_MS = 10 * 60_000;
export const redirectionGoogle = () => `${urlApiPublique()}/agenda/google/retour`;

// Agendas connectés d'une personne (16/11/2026) : Google aujourd'hui (Apple
// ensuite). Chaque personne connecte le sien, dans la société de sa session,
// choisit les agendas à importer et celui où le HUB écrit, et peut se
// déconnecter (l'accès est alors révoqué chez Google). L'accès chiffré n'est
// jamais renvoyé à l'écran.
@Injectable()
export class ConnexionsAgendaService {
  private readonly log = new Logger('ConnexionsAgenda');

  constructor(
    private prisma: PrismaService,
    private google: ClientGoogle,
    private synchro: SynchroAgendaService,
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
        })),
      })),
    };
  }

  // L'adresse où envoyer la personne pour autoriser l'accès chez Google.
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

  // Retour de Google (route publique : c'est l'état qui désigne la personne).
  // Rend l'adresse de l'Agenda où la renvoyer, avec le résultat.
  async retourGoogle(etat: string | undefined, code: string | undefined, erreur: string | undefined): Promise<string> {
    const enCours = etat
      ? await runAsSystem('agenda : retour de Google', () =>
          this.prisma.etatConnexionAgenda.findUnique({
            where: { etatHash: hacherJeton(etat) },
            include: { societe: { select: { slug: true } } },
          }),
        )
      : null;
    if (!enCours) return `${urlFront()}/?connexion=echec`;
    identifyCompany(enCours.societeId);
    await this.prisma.etatConnexionAgenda.delete({ where: { id: enCours.id } });
    const retour = (resultat: string) => `${lienAgendaHub(enCours.societe.slug)}?connexion=${resultat}`;
    const cle = cleChiffrement();
    if (erreur || !code || enCours.expireLe < new Date() || !cle) return retour('annulee');
    try {
      const { rafraichissement, compte } = await this.google.echangerCode(
        code,
        enCours.verificateur,
        redirectionGoogle(),
      );
      const connexion = await this.prisma.connexionAgenda.upsert({
        where: {
          societeId_utilisateurId_fournisseur: {
            societeId: enCours.societeId,
            utilisateurId: enCours.utilisateurId,
            fournisseur: 'google',
          },
        },
        create: {
          societeId: enCours.societeId,
          utilisateurId: enCours.utilisateurId,
          fournisseur: 'google',
          compte,
          accesChiffre: chiffrer(rafraichissement, cle),
        },
        update: { compte, accesChiffre: chiffrer(rafraichissement, cle), erreur: null },
      });
      // Ses agendas : le principal importé, et le HUB y écrit (modifiable ensuite).
      const agendas = await this.google.agendas(await this.google.acces(rafraichissement));
      for (const g of agendas) {
        await this.prisma.agendaExterne.upsert({
          where: { connexionId_idExterne: { connexionId: connexion.id, idExterne: g.id } },
          create: {
            societeId: enCours.societeId,
            connexionId: connexion.id,
            idExterne: g.id,
            nom: g.nom,
            couleur: g.couleur,
            importe: g.principal,
            cible: g.principal && g.ecriture,
          },
          update: { nom: g.nom, couleur: g.couleur },
        });
      }
      return retour('google');
    } catch (e) {
      this.log.error(`retour de Google : ${e instanceof Error ? e.message : e}`);
      return retour('echec');
    }
  }

  // Les agendas importés, et celui où le HUB écrit (un seul, ou aucun).
  async choisirAgendas(a: Acteur, connexionId: string, importes: string[], cible: string | null) {
    const c = await this.connexion(a, connexionId);
    const ids = new Set(c.agendas.map((x) => x.id));
    if (importes.some((x) => !ids.has(x)) || (cible && !ids.has(cible))) {
      throw new BadRequestException('Agenda inconnu pour cette connexion.');
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
    await this.synchro.synchroniser(connexionId);
    return this.etat(a);
  }

  // Déconnecter : les réunions que le HUB avait écrites chez Google en sont
  // retirées, l'accès est révoqué, tout ce qui venait de ce compte quitte le HUB.
  async deconnecter(a: Acteur, connexionId: string) {
    const c = await this.connexion(a, connexionId);
    const cle = cleChiffrement();
    if (cle && c.fournisseur === 'google') {
      try {
        const rafraichissement = dechiffrer(c.accesChiffre, cle);
        const acces = await this.google.acces(rafraichissement);
        for (const l of c.liens) {
          try {
            await this.google.supprimer(acces, l.agendaId, l.idExterne);
          } catch {
            // Un événement déjà parti chez Google : on continue.
          }
        }
        await this.google.revoquer(rafraichissement);
      } catch (e) {
        // Accès déjà retiré chez Google : rien à nettoyer là-bas.
        this.log.warn(`déconnexion ${c.id} : ${e instanceof Error ? e.message : e}`);
      }
    }
    await this.prisma.connexionAgenda.delete({ where: { id: c.id } });
    return this.etat(a);
  }

  private async connexion(a: Acteur, id: string) {
    const c = await this.prisma.connexionAgenda.findFirst({
      where: { id, societeId: a.societeId, utilisateurId: a.userId },
      include: { agendas: true, liens: true },
    });
    if (!c) throw new NotFoundException('Connexion introuvable');
    return c;
  }
}
