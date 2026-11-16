import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { addDays, todayIso } from '@hub/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { RightsService } from '../../rights/rights.service';
import { runAsSystem, runInCompany } from '../../tenancy/tenant-context';
import { acteurAgenda } from '../acteur';
import { AgendaService, type Acteur } from '../agenda.service';
import { lienAgendaHub } from '../liens';
import { cleChiffrement, dechiffrer } from './chiffrement';
import { ClientGoogle, ErreurGoogle, type EvenementGoogle } from './google.client';
import { CLE_HUB, decider, empreinteGoogle, voulus, type Action } from './reconciliation';

// Période suivie : de la veille à six mois (les réunions passées ne bougent plus).
const JOURS_AVANT = 1;
const JOURS_APRES = 180;

// Synchronisation de l'Agenda avec Google (16/11/2026), dans les deux sens,
// pour chaque connexion : toutes les 5 minutes, et à la demande.
//  1. Import : les agendas choisis par la personne (occurrences déroulées par
//     Google), sauf ce que le HUB y a lui-même écrit.
//  2. Export et réconciliation : ses réunions du HUB dans l'agenda choisi ;
//     ce que l'organisateur change ou supprime chez Google revient au HUB
//     (invités prévenus), ce qu'un invité supprime vaut « je décline »
//     (décisions du 16/11/2026) ; la version du HUB revient sinon.
// Découverte en périmètre système, puis chaque connexion dans sa société
// (ADR 0001) ; une erreur sur une connexion est notée pour la personne et
// n'arrête pas les autres.
@Injectable()
export class SynchroAgendaService {
  private readonly log = new Logger('SynchroAgenda');
  private enCours = false;

  constructor(
    private prisma: PrismaService,
    private rights: RightsService,
    private agenda: AgendaService,
    private google: ClientGoogle,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tourner(): Promise<number> {
    if (this.enCours || !cleChiffrement()) return 0;
    this.enCours = true;
    try {
      const connexions = await runAsSystem('agenda : connexions à synchroniser', () =>
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

  // Une connexion, dans la société de la requête en cours.
  async synchroniser(connexionId: string, maintenant = new Date()): Promise<void> {
    const c = await this.prisma.connexionAgenda.findUnique({
      where: { id: connexionId },
      include: { agendas: true, liens: true },
    });
    const cle = cleChiffrement();
    if (!c || !cle || c.fournisseur !== 'google') return;
    const noter = (erreur: string | null) =>
      this.prisma.connexionAgenda.update({
        where: { id: c.id },
        data: { erreur, ...(erreur ? {} : { derniereSynchroLe: maintenant }) },
      });

    const lu = await acteurAgenda(this.prisma, this.rights, c.utilisateurId, c.societeId);
    if (!lu) {
      await noter('Votre compte n’a plus accès à cette société : la synchronisation est arrêtée.');
      return;
    }
    let acces: string;
    try {
      acces = await this.google.acces(dechiffrer(c.accesChiffre, cle));
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

    try {
      for (const a of c.agendas.filter((x) => x.importe)) {
        await this.importer(acces, c.societeId, a.id, a.idExterne, du, au);
      }
      const cible = c.agendas.find((x) => x.cible);
      if (cible) await this.exporter(acces, c, cible.idExterne, lu.acteur, lu.societe.slug, du, au, maintenant);
      await noter(null);
    } catch (e) {
      this.log.error(`synchro ${c.id} : ${e instanceof Error ? e.message : e}`);
      await noter(e instanceof ErreurGoogle ? e.message : 'La synchronisation a échoué : nouvel essai dans 5 minutes.');
    }
  }

  // Les rendez-vous de l'agenda importé, remplacés pour la période.
  private async importer(acces: string, societeId: string, agendaId: string, idExterne: string, du: Date, au: Date) {
    const evenements = (await this.google.evenements(acces, idExterne, du, au)).filter(
      (g) => g.status !== 'cancelled' && !g.extendedProperties?.private?.[CLE_HUB],
    );
    const lignes = evenements.map((g) => ligneImportee(g)).filter((x): x is NonNullable<typeof x> => !!x);
    await this.prisma.$transaction([
      this.prisma.evenementExterne.deleteMany({
        where: { agendaId, debut: { lt: au }, fin: { gt: du }, idExterne: { notIn: lignes.map((l) => l.idExterne) } },
      }),
      ...lignes.map((l) =>
        this.prisma.evenementExterne.upsert({
          where: { agendaId_idExterne: { agendaId, idExterne: l.idExterne } },
          create: { societeId, agendaId, ...l },
          update: l,
        }),
      ),
    ]);
  }

  private async exporter(
    acces: string,
    c: {
      id: string;
      societeId: string;
      liens: { cle: string; idExterne: string; empreinte: string; agendaId: string }[];
    },
    agendaCible: string,
    acteur: Acteur,
    slug: string,
    du: Date,
    au: Date,
    maintenant: Date,
  ) {
    const periode = await this.agenda.semaine(
      acteur,
      du.toISOString().slice(0, 10),
      undefined,
      addDays(au.toISOString().slice(0, 10), -1),
      {
        sansDemandes: true,
      },
    );
    const hub = voulus(periode.elements, lienAgendaHub(slug));
    // Ce que le HUB a écrit et qui est encore chez Google (agenda cible).
    const actuels = new Map<string, EvenementGoogle>();
    for (const g of await this.google.evenements(acces, agendaCible, du, au)) {
      const cleHub = g.extendedProperties?.private?.[CLE_HUB];
      if (cleHub) actuels.set(cleHub, g);
    }
    // Un lien vers un autre agenda (la cible a changé) : l'ancien événement
    // est retiré, la réunion sera recréée dans le nouvel agenda.
    const liens = [];
    for (const l of c.liens) {
      if (l.agendaId === agendaCible) liens.push(l);
      else {
        try {
          await this.google.supprimer(acces, l.agendaId, l.idExterne);
        } catch {
          // Déjà parti chez Google (ou agenda retiré) : rien à retirer.
        }
        await this.prisma.lienExportAgenda.delete({ where: { connexionId_cle: { connexionId: c.id, cle: l.cle } } });
      }
    }
    for (const action of decider(liens, hub, actuels, maintenant)) {
      try {
        await this.appliquer(action, acces, c, agendaCible, acteur);
      } catch (e) {
        // Une réunion qui échoue n'empêche pas les autres.
        this.log.error(`synchro ${c.id}, ${action.type} : ${e instanceof Error ? e.message : e}`);
      }
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
    switch (action.type) {
      case 'creer': {
        const g = await this.google.creer(acces, agendaCible, action.voulu.ecriture);
        const e = action.voulu.element;
        await this.prisma.lienExportAgenda.create({
          data: {
            societeId: c.societeId,
            connexionId: c.id,
            cle: action.voulu.cle,
            rendezVousId: e.serieId ?? e.id,
            occurrence: e.occurrence ? new Date(e.occurrence) : null,
            agendaId: agendaCible,
            idExterne: g.id,
            empreinte: action.voulu.empreinte,
          },
        });
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
        // la modifie comme depuis son Agenda (invités prévenus).
        const e = action.voulu.element;
        const g = action.google;
        await this.agenda.modifier(acteur, e.serieId ?? e.id, {
          titre: (g.summary ?? e.titre).slice(0, 160) || e.titre,
          debut: g.start?.dateTime ?? e.debut!,
          fin: g.end?.dateTime ?? e.fin!,
          lieu: g.location === e.lienVisio ? (e.lieu ?? undefined) : (g.location ?? undefined),
          description: e.description ?? undefined,
          inviteIds: e.inviteIds,
          lienVisio: e.lienVisio,
          rappelMinutes: e.rappelMinutes,
          ...(e.serieId && e.occurrence ? { portee: 'occurrence' as const, occurrence: e.occurrence } : {}),
        });
        await ecrire(action.lien.cle, action.lien.idExterne, empreinteGoogle(g) ?? action.lien.empreinte);
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
        await this.agenda.repondre(acteur, action.voulu.element.serieId ?? action.voulu.element.id, 'non');
        await oublier(action.lien.cle);
        return;
      }
      case 'oublier':
        await oublier(action.lien.cle);
    }
  }
}

// Un événement Google → une ligne importée (journée entière : de minuit à
// minuit, fin exclue comme chez Google).
export function ligneImportee(
  g: EvenementGoogle,
): { idExterne: string; titre: string; lieu: string | null; debut: Date; fin: Date; journee: boolean } | null {
  const journee = !g.start?.dateTime && !!g.start?.date;
  const debut = g.start?.dateTime ?? (g.start?.date ? `${g.start.date}T00:00:00.000Z` : null);
  const fin = g.end?.dateTime ?? (g.end?.date ? `${g.end.date}T00:00:00.000Z` : null);
  if (!g.id || !debut || !fin) return null;
  return {
    idExterne: g.id,
    titre: (g.summary ?? '(sans titre)').slice(0, 300),
    lieu: g.location?.slice(0, 300) ?? null,
    debut: new Date(debut),
    fin: new Date(fin),
    journee,
  };
}
