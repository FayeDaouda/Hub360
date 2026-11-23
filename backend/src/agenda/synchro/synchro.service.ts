import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { addDays, ETAPE, hasRight, todayIso } from '@hub/domain';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { hasFullAccess, RightsService } from '../../rights/rights.service';
import { SwitchesService } from '../../switches/switches.service';
import { runAsSystem, runInCompany } from '../../tenancy/tenant-context';
import { acteurAgenda } from '../acteur';
import { AgendaService, type Acteur } from '../agenda.service';
import { lienAgendaHub } from '../liens';
import { cleChiffrement, dechiffrer } from './chiffrement';
import { retirerDeGoogle } from './retrait';
import { ClientGoogle, ErreurGoogle, type EvenementGoogle } from './google.client';
import { CLE_HUB, decider, empreinteGoogle, MASQUE, voulus, type Action, type Lien } from './reconciliation';

// Période suivie : de la veille à six mois (les réunions passées ne bougent plus).
const JOURS_AVANT = 1;
const JOURS_APRES = 180;
// Une synchronisation prise depuis plus longtemps est tenue pour interrompue
// (au-delà de la plus longue possible, appels Google bornés à 20 s).
export const VERROU_MS = 30 * 60_000;
// Événements suivis absents de la période lue, relus un à un par tournée.
const RELECTURES_MAX = 50;
// Domaine des identifiants des invitations du HUB (rdv-…@hub360.space).
const UID_HUB = /@hub360\.space$/;

type ConnexionLue = {
  id: string;
  societeId: string;
  liens: (Lien & { agendaId: string })[];
};

// Synchronisation de l'Agenda avec Google (16/11/2026), dans les deux sens,
// pour chaque connexion : toutes les 5 minutes, et à la demande.
//  1. Import : les agendas choisis par la personne (occurrences déroulées par
//     Google), sauf ce que le HUB y a lui-même écrit ou envoyé par e-mail.
//  2. Export et réconciliation : ses réunions du HUB dans son agenda ; ce que
//     l'organisateur change ou supprime chez Google revient au HUB (invités
//     prévenus), ce qu'un invité supprime vaut « je décline » ; la version du
//     HUB revient sinon (décisions du 16/11/2026).
// Garde-fous : un verrou par connexion (jamais deux synchronisations à la
// fois), les droits relus comme pour une session (compte actif, accès à la
// société, Lecture de « Mon agenda », maintenance) ; une coupure des
// sessions (« déconnecter partout », mot de passe) ou un compte désactivé
// révoque l'accès et supprime la connexion.
// Découverte en périmètre système, puis chaque connexion dans sa société
// (ADR 0001) ; une erreur est notée pour la personne et n'arrête pas les autres.
@Injectable()
export class SynchroAgendaService {
  private readonly log = new Logger('SynchroAgenda');
  private enCours = false;

  constructor(
    private prisma: PrismaService,
    private rights: RightsService,
    private agenda: AgendaService,
    private google: ClientGoogle,
    private switches: SwitchesService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tourner(): Promise<number> {
    if (this.enCours || !cleChiffrement()) return 0;
    this.enCours = true;
    try {
      // Les connexions Google commencées et jamais finies.
      await runAsSystem('agenda : purge des connexions en cours expirées', () =>
        this.prisma.etatConnexionAgenda.deleteMany({ where: { expireLe: { lt: new Date() } } }),
      );
      const connexions = await runAsSystem('agenda : connexions à synchroniser', () =>
        // Toutes, même en pause : un compte en pause reste contrôlé (départ de
        // la personne, sessions coupées → accès révoqué), sans synchroniser.
        this.prisma.connexionAgenda.findMany({ select: { id: true, societeId: true } }),
      );
      let faites = 0;
      for (const c of connexions) {
        try {
          await runInCompany(c.societeId, () => this.synchroniser(c.id));
          faites++;
        } catch (e) {
          this.log.error(`connexion ${c.id} : ${e instanceof Error ? e.message : e}`);
        }
      }
      return faites;
    } finally {
      this.enCours = false;
    }
  }

  // Une connexion, dans la société de la requête en cours. false : une
  // synchronisation de cette connexion est déjà en cours (rien de fait).
  async synchroniser(connexionId: string, maintenant = new Date()): Promise<boolean> {
    const cle = cleChiffrement();
    if (!cle) return false;
    // Le verrou : pris seulement s'il est libre (ou abandonné).
    const pris = await this.prisma.connexionAgenda.updateMany({
      where: {
        id: connexionId,
        OR: [{ synchroDepuis: null }, { synchroDepuis: { lt: new Date(+maintenant - VERROU_MS) } }],
      },
      data: { synchroDepuis: maintenant },
    });
    if (!pris.count) return false;
    try {
      await this.sousVerrou(connexionId, cle, maintenant);
    } finally {
      // Rendu seulement s'il est encore le sien (repris entre-temps après
      // abandon : il appartient à l'autre synchronisation).
      await this.prisma.connexionAgenda
        .updateMany({ where: { id: connexionId, synchroDepuis: maintenant }, data: { synchroDepuis: null } })
        .catch(() => undefined);
    }
    return true;
  }

  private async sousVerrou(connexionId: string, cle: Buffer, maintenant: Date) {
    const c = await this.prisma.connexionAgenda.findUnique({
      where: { id: connexionId },
      include: { agendas: true, liens: true },
    });
    if (!c || c.fournisseur !== 'google') return;
    const noter = (erreur: string | null) =>
      this.prisma.connexionAgenda.update({
        where: { id: c.id },
        data: { erreur, ...(erreur ? {} : { derniereSynchroLe: maintenant }) },
      });

    let rafraichissement: string;
    try {
      rafraichissement = dechiffrer(c.accesChiffre, cle);
    } catch {
      if (c.active) await noter('L’accès enregistré ne peut plus être lu : reconnectez votre compte Google.');
      return;
    }
    // Compte désactivé, plus d'accès à la société, ou sessions coupées depuis
    // l'autorisation : les réunions écrites chez Google en sont retirées
    // (sinon figées), l'accès est révoqué, la connexion supprimée, et la
    // personne prévenue de la reconnecter.
    const lu = await acteurAgenda(this.prisma, this.rights, c.utilisateurId, c.societeId);
    if (!lu || (lu.sessionsValidesDepuis && lu.sessionsValidesDepuis > c.autoriseLe)) {
      if ((await retirerDeGoogle(this.google, c, cle, this.log)) === 'injoignable') {
        await noter('Google Agenda ne répond pas : nouvel essai dans 5 minutes.');
        return; // on réessaiera : rien n'est abandonné chez Google
      }
      await this.prisma.connexionAgenda.delete({ where: { id: c.id } });
      this.log.log(`connexion ${c.id} supprimée (compte, accès ou sessions coupés)`);
      if (lu) {
        await this.notifications.envoyer({
          societeId: c.societeId,
          type: 'agenda_deconnecte',
          titre: 'Google Agenda déconnecté (sessions coupées) : reconnectez-le dans « Agendas connectés »',
          destinataireIds: [c.utilisateurId],
        });
      }
      return;
    }
    // En pause : contrôlé ci-dessus, mais rien ne se synchronise (la reprise relit tout).
    if (!c.active) return;
    if (!hasRight(lu.acteur.permissions, ETAPE.agenda, 'lecture')) {
      await noter('Votre rôle n’a plus accès à « Mon agenda » : la synchronisation est arrêtée.');
      return;
    }
    try {
      await this.switches.refuseDuringMaintenance(hasFullAccess({ adminHub: lu.adminHub, role: lu.acteur.role }));
    } catch (e) {
      // Maintenance : on reprendra à la tournée suivante ; autre chose : on le dit.
      if (!(e instanceof ServiceUnavailableException)) throw e;
      return;
    }

    let acces: string;
    try {
      acces = await this.google.acces(rafraichissement);
    } catch (e) {
      await noter(
        e instanceof ErreurGoogle && e.accesRevoque
          ? 'L’accès à Google Agenda a été retiré : reconnectez le compte.'
          : 'Google Agenda ne répond pas : nouvel essai dans 5 minutes.',
      );
      return;
    }
    const du = new Date(`${addDays(todayIso(maintenant), -JOURS_AVANT)}T00:00:00.000Z`);
    const au = new Date(`${addDays(todayIso(maintenant), JOURS_APRES)}T00:00:00.000Z`);
    const echecs: string[] = [];

    try {
      const agendas = await this.relireAgendas(acces, c);
      for (const a of agendas.filter((x) => x.importe)) {
        try {
          await this.importer(acces, c.societeId, a.id, a.idExterne, du, au);
        } catch (e) {
          echecs.push(`« ${a.nom} » : ${e instanceof Error ? e.message : e}`);
        }
      }
      const cible = agendas.find((x) => x.cible);
      if (cible) {
        const ratees = await this.exporter(acces, c, cible.idExterne, lu.acteur, lu.societe.slug, du, au, maintenant);
        if (ratees)
          echecs.push(`${ratees} réunion(s) n’ont pas pu être écrites dans Google : nouvel essai dans 5 minutes.`);
      } else {
        // Plus d'agenda cible : les réunions que le HUB avait écrites en sont retirées.
        await this.retirerTout(acces, c);
      }
      await noter(echecs.length ? echecs.join(' ') : null);
    } catch (e) {
      this.log.error(`synchro ${c.id} : ${e instanceof Error ? e.message : e}`);
      await noter(e instanceof ErreurGoogle ? e.message : 'La synchronisation a échoué : nouvel essai dans 5 minutes.');
    }
  }

  // La liste des agendas du compte, relue à chaque tournée : un nouvel agenda
  // apparaît (ni importé ni cible), un agenda supprimé chez Google disparaît.
  private async relireAgendas(
    acces: string,
    c: { id: string; societeId: string; agendas: { id: string; idExterne: string }[] },
  ) {
    const chezGoogle = await this.google.agendas(acces);
    const ids = new Set(chezGoogle.map((g) => g.id));
    for (const g of chezGoogle) {
      await this.prisma.agendaExterne.upsert({
        where: { connexionId_idExterne: { connexionId: c.id, idExterne: g.id } },
        create: {
          societeId: c.societeId,
          connexionId: c.id,
          idExterne: g.id,
          nom: g.nom,
          couleur: g.couleur,
          proprietaire: g.proprietaire,
        },
        // Un agenda dont elle n'est plus propriétaire ne peut plus être cible.
        update: {
          nom: g.nom,
          couleur: g.couleur,
          proprietaire: g.proprietaire,
          ...(g.proprietaire ? {} : { cible: false }),
        },
      });
    }
    const partis = c.agendas.filter((a) => !ids.has(a.idExterne)).map((a) => a.id);
    if (partis.length) await this.prisma.agendaExterne.deleteMany({ where: { id: { in: partis } } });
    return this.prisma.agendaExterne.findMany({ where: { connexionId: c.id } });
  }

  // Les rendez-vous de l'agenda importé, remplacés pour la période ; jamais
  // ce que le HUB a écrit (clé du HUB) ou envoyé par e-mail (UID du HUB).
  private async importer(acces: string, societeId: string, agendaId: string, idExterne: string, du: Date, au: Date) {
    const evenements = (await this.google.evenements(acces, idExterne, du, au)).filter(
      (g) => g.status !== 'cancelled' && !g.extendedProperties?.private?.[CLE_HUB] && !UID_HUB.test(g.iCalUID ?? ''),
    );
    const lignes = evenements.map((g) => ligneImportee(g)).filter((x): x is NonNullable<typeof x> => !!x);
    const gardes = new Set(lignes.map((l) => l.idExterne));
    const presents = await this.prisma.evenementExterne.findMany({
      where: { agendaId, debut: { lt: au }, fin: { gt: du } },
      select: { id: true, idExterne: true },
    });
    const partis = presents.filter((p) => !gardes.has(p.idExterne)).map((p) => p.id);
    // Par paquets : jamais une transaction ni une liste d'identifiants géantes.
    for (let i = 0; i < partis.length; i += 500) {
      await this.prisma.evenementExterne.deleteMany({ where: { id: { in: partis.slice(i, i + 500) } } });
    }
    for (let i = 0; i < lignes.length; i += 200) {
      await this.prisma.$transaction(
        lignes.slice(i, i + 200).map((l) =>
          this.prisma.evenementExterne.upsert({
            where: { agendaId_idExterne: { agendaId, idExterne: l.idExterne } },
            create: { societeId, agendaId, ...l },
            update: l,
          }),
        ),
      );
    }
  }

  // Le nombre de réunions qui n'ont pas pu être écrites (0 : tout va bien).
  private async exporter(
    acces: string,
    c: ConnexionLue,
    agendaCible: string,
    acteur: Acteur,
    slug: string,
    du: Date,
    au: Date,
    maintenant: Date,
  ): Promise<number> {
    const periode = await this.agenda.semaine(
      acteur,
      du.toISOString().slice(0, 10),
      undefined,
      addDays(au.toISOString().slice(0, 10), -1),
      { sansDemandes: true },
    );
    const hub = voulus(periode.elements, lienAgendaHub(slug));
    // Ce que le HUB a écrit et qui est encore chez Google ; un doublon (deux
    // événements pour une même réunion) est retiré.
    const actuels = new Map<string, EvenementGoogle>();
    for (const g of await this.google.evenements(acces, agendaCible, du, au)) {
      const cleHub = g.extendedProperties?.private?.[CLE_HUB];
      if (!cleHub) continue;
      const deja = actuels.get(cleHub);
      if (!deja) {
        actuels.set(cleHub, g);
        continue;
      }
      // Garder celui que suit le lien (sinon le premier vu), retirer l'autre.
      const suivi = c.liens.find((l) => l.cle === cleHub)?.idExterne;
      const [garde, enTrop] = suivi === g.id ? [g, deja] : [deja, g];
      actuels.set(cleHub, garde);
      try {
        await this.google.supprimer(acces, agendaCible, enTrop.id);
      } catch {
        // Déjà parti : rien à faire.
      }
    }
    const liens: Lien[] = [];
    for (const l of c.liens) {
      if (l.agendaId !== agendaCible) {
        // La cible a changé : l'ancien événement est retiré, la réunion sera
        // recréée dans le nouvel agenda.
        try {
          await this.google.supprimer(acces, l.agendaId, l.idExterne);
        } catch {
          // Déjà parti chez Google (ou agenda retiré) : rien à retirer.
        }
        await this.prisma.lienExportAgenda.delete({ where: { connexionId_cle: { connexionId: c.id, cle: l.cle } } });
      } else liens.push(l);
    }
    // Un événement suivi absent de la période lue n'est pas forcément
    // supprimé : déplacé loin dans le temps, il est relu un à un — d'abord
    // ceux des réunions encore au HUB (une suppression y annule ou décline).
    // Au-delà de la borne, pas relu : aucune décision pour lui cette tournée.
    const aRelire = liens
      .filter((l) => !actuels.has(l.cle) && l.empreinte !== MASQUE)
      .sort((x, y) => +hub.has(y.cle) - +hub.has(x.cle));
    const reportes = new Set(aRelire.slice(RELECTURES_MAX).map((l) => l.cle));
    for (const l of aRelire.slice(0, RELECTURES_MAX)) {
      const g = await this.google.lire(acces, agendaCible, l.idExterne);
      if (g && g.status !== 'cancelled') actuels.set(l.cle, g);
    }
    let ratees = 0;
    // (Retirée des deux côtés : sinon elle passerait pour nouvelle et serait recréée.)
    const decides = liens.filter((l) => !reportes.has(l.cle));
    const voulusDecides = new Map([...hub].filter(([cle]) => !reportes.has(cle)));
    for (const action of decider(decides, voulusDecides, actuels, maintenant)) {
      try {
        await this.appliquer(action, acces, c, agendaCible, acteur);
      } catch (e) {
        ratees++;
        this.log.error(`synchro ${c.id}, ${action.type} : ${e instanceof Error ? e.message : e}`);
      }
    }
    return ratees;
  }

  // Plus d'agenda cible : retirer de Google ce que le HUB y avait écrit.
  private async retirerTout(acces: string, c: ConnexionLue) {
    for (const l of c.liens) {
      try {
        await this.google.supprimer(acces, l.agendaId, l.idExterne);
      } catch {
        // Déjà parti chez Google.
      }
      await this.prisma.lienExportAgenda.delete({ where: { connexionId_cle: { connexionId: c.id, cle: l.cle } } });
    }
  }

  private async appliquer(
    action: Action,
    acces: string,
    c: { id: string; societeId: string },
    agendaCible: string,
    acteur: Acteur,
  ) {
    const lien = (cle: string) => ({ connexionId_cle: { connexionId: c.id, cle } });
    const oublier = (cle: string) => this.prisma.lienExportAgenda.delete({ where: lien(cle) });
    const ecrire = (cle: string, idExterne: string, empreinte: string) =>
      this.prisma.lienExportAgenda.update({ where: lien(cle), data: { idExterne, empreinte } });
    const suivre = (
      voulu: {
        cle: string;
        empreinte: string;
        element: { serieId: string | null; id: string; occurrence: string | null };
      },
      idExterne: string,
    ) =>
      this.prisma.lienExportAgenda.create({
        data: {
          societeId: c.societeId,
          connexionId: c.id,
          cle: voulu.cle,
          rendezVousId: voulu.element.serieId ?? voulu.element.id,
          occurrence: voulu.element.occurrence ? new Date(voulu.element.occurrence) : null,
          agendaId: agendaCible,
          idExterne,
          empreinte: voulu.empreinte,
        },
      });
    switch (action.type) {
      case 'creer': {
        const g = await this.google.creer(acces, agendaCible, action.voulu.ecriture);
        await suivre(action.voulu, g.id);
        return;
      }
      case 'adopter': {
        // Déjà chez Google (une tournée interrompue après l'écriture) : on le
        // reprend et on le remet à jour, sans en créer un second.
        await this.google.modifier(acces, agendaCible, action.google.id, action.voulu.ecriture);
        await suivre(action.voulu, action.google.id);
        return;
      }
      case 'recreer': {
        const g = await this.google.creer(acces, agendaCible, action.voulu.ecriture);
        await ecrire(action.lien.cle, g.id, action.voulu.empreinte);
        return;
      }
      case 'mettre_a_jour':
      case 'retablir': {
        await this.google.modifier(acces, agendaCible, action.lien.idExterne, action.voulu.ecriture);
        await ecrire(action.lien.cle, action.lien.idExterne, action.voulu.empreinte);
        return;
      }
      case 'reprendre': {
        // L'organisateur a déplacé ou renommé la réunion dans Google : le HUB
        // la modifie comme depuis son Agenda (invités prévenus), avec les
        // mêmes bornes que le formulaire.
        const e = action.voulu.element;
        const g = action.google;
        const titre = (g.summary ?? '').trim().slice(0, 160);
        const lieuGoogle = (g.location ?? '').trim().slice(0, 160) || null;
        await this.agenda.modifier(acteur, e.serieId ?? e.id, {
          titre: titre.length >= 2 ? titre : e.titre,
          debut: g.start?.dateTime ?? e.debut!,
          fin: g.end?.dateTime ?? e.fin!,
          lieu: lieuGoogle === e.lienVisio ? (e.lieu ?? undefined) : (lieuGoogle ?? undefined),
          description: e.description ?? undefined,
          inviteIds: e.inviteIds,
          lienVisio: e.lienVisio,
          rappelMinutes: e.rappelMinutes,
          ...(e.serieId && e.occurrence ? { portee: 'occurrence' as const, occurrence: e.occurrence } : {}),
        });
        await ecrire(action.lien.cle, action.lien.idExterne, empreinteGoogle(g) ?? action.lien.empreinte);
        return;
      }
      case 'masquer': {
        await ecrire(action.lien.cle, action.lien.idExterne, MASQUE);
        return;
      }
      case 'supprimer_google': {
        await this.google.supprimer(acces, agendaCible, action.lien.idExterne);
        await oublier(action.lien.cle);
        return;
      }
      case 'annuler_hub': {
        const e = action.voulu.element;
        await this.agenda.annuler(
          acteur,
          e.serieId ?? e.id,
          e.serieId ? 'occurrence' : undefined,
          e.occurrence ?? undefined,
        );
        await oublier(action.lien.cle);
        return;
      }
      case 'decliner_hub': {
        await this.agenda.repondre(acteur, action.voulu.element.id, 'non');
        await oublier(action.lien.cle);
        return;
      }
      case 'oublier':
        await oublier(action.lien.cle);
    }
  }
}

// Un événement Google → une ligne importée (journée entière : de minuit à
// minuit, fin exclue comme chez Google), titre et lieu bornés.
export function ligneImportee(
  g: EvenementGoogle,
): { idExterne: string; titre: string; lieu: string | null; debut: Date; fin: Date; journee: boolean } | null {
  const journee = !g.start?.dateTime && !!g.start?.date;
  const debut = g.start?.dateTime ?? (g.start?.date ? `${g.start.date}T00:00:00.000Z` : null);
  const fin = g.end?.dateTime ?? (g.end?.date ? `${g.end.date}T00:00:00.000Z` : null);
  if (!g.id || !debut || !fin || Number.isNaN(Date.parse(debut)) || Number.isNaN(Date.parse(fin))) return null;
  return {
    idExterne: g.id,
    titre: (g.summary ?? '').trim().slice(0, 300) || '(sans titre)',
    lieu: g.location?.trim().slice(0, 300) || null,
    debut: new Date(debut),
    fin: new Date(fin),
    journee,
  };
}
