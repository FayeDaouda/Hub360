import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem, runInCompany } from '../tenancy/tenant-context';
import { quandRendezVous } from './liens';
import { occurrencesDans, type Occurrence } from './series';

import { RAPPEL_MAX_MINUTES } from '@hub/domain';

// Horizon d'une tournée : le plus long rappel proposé (la veille).
const HORIZON_MS = RAPPEL_MAX_MINUTES * 60_000;

// Rappels des rendez-vous (12/11/2026) : chaque minute, les rendez-vous dont
// l'heure du rappel est venue (et qui n'ont pas commencé) préviennent leur
// organisateur et leurs invités — sauf ceux qui ont décliné —, une seule
// fois (la ligne est prise avant l'envoi : deux tournées ne doublent rien).
// Découverte en périmètre système, puis chaque envoi dans sa société
// (ADR 0001, tâches planifiées). Une tournée à la fois ; un rappel qui n'a
// pas pu partir est rendu (la tournée suivante le reprend) ; une erreur dans
// une société n'arrête pas les autres. Seuls les membres actifs de la
// société sont prévenus.
@Injectable()
export class RappelsAgendaService {
  private readonly log = new Logger('RappelsAgenda');
  private enCours = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tourner(maintenant = new Date()): Promise<number> {
    if (this.enCours) return 0;
    this.enCours = true;
    try {
      return (await this.tournee(maintenant)) + (await this.tourneeSeries(maintenant));
    } finally {
      this.enCours = false;
    }
  }

  private async tournee(maintenant: Date): Promise<number> {
    const candidats = await runAsSystem('agenda : rappels à envoyer', () =>
      this.prisma.rendezVous.findMany({
        where: {
          annuleLe: null,
          regle: null,
          rappelEnvoyeLe: null,
          rappelMinutes: { not: null },
          debut: { gt: maintenant, lte: new Date(+maintenant + HORIZON_MS) },
        },
        select: { id: true, societeId: true, debut: true, rappelMinutes: true },
      }),
    );
    let envoyes = 0;
    for (const r of candidats) {
      if (+r.debut - (r.rappelMinutes ?? 0) * 60_000 > +maintenant) continue;
      try {
        envoyes += await runInCompany(r.societeId, () => this.envoyer(r.id, r.societeId, maintenant));
      } catch (e) {
        this.log.error(`rappel du rendez-vous ${r.id} : ${e instanceof Error ? e.message : e}`);
        await runInCompany(r.societeId, () => this.rendre(r.id, maintenant)).catch(() => undefined);
      }
    }
    return envoyes;
  }

  private async envoyer(id: string, societeId: string, maintenant: Date): Promise<number> {
    const pris = await this.prisma.rendezVous.updateMany({
      where: { id, rappelEnvoyeLe: null, annuleLe: null },
      data: { rappelEnvoyeLe: maintenant },
    });
    if (!pris.count) return 0;
    const r = await this.prisma.rendezVous.findUnique({
      where: { id },
      select: {
        titre: true,
        debut: true,
        lieu: true,
        organisateurId: true,
        invites: { select: { utilisateurId: true, reponse: true } },
      },
    });
    if (!r) return 0;
    const notifies = await this.notifier(societeId, r, r);
    if (notifies === null) return 0; // plus personne à prévenir : rien à reprendre
    // L'envoi a échoué (le service des notifications rend 0 sans lever) :
    // le rappel est rendu pour la tournée suivante.
    if (!notifies) {
      await this.rendre(id, maintenant);
      return 0;
    }
    return 1;
  }

  // Séries (16/11/2026) : chaque occurrence a son rappel, pris par une ligne
  // de RappelOccurrence (clé unique : jamais deux fois) et rendu si l'envoi
  // échoue. Une occurrence annulée n'a pas de rappel ; une déplacée, à sa
  // nouvelle heure.
  private async tourneeSeries(maintenant: Date): Promise<number> {
    const horizon = new Date(+maintenant + HORIZON_MS);
    const series = await runAsSystem('agenda : rappels des séries', () =>
      this.prisma.rendezVous.findMany({
        where: {
          annuleLe: null,
          regle: { not: null },
          rappelMinutes: { not: null },
          debut: { lte: horizon },
          // Pas les séries terminées (fin de la dernière occurrence passée).
          OR: [{ finSerie: null }, { finSerie: { gt: maintenant } }],
        },
        select: {
          id: true,
          societeId: true,
          titre: true,
          debut: true,
          fin: true,
          lieu: true,
          description: true,
          lienVisio: true,
          regle: true,
          rappelMinutes: true,
          exceptions: true,
        },
      }),
    );
    // Les traces des rappels envoyés il y a plus de deux jours ne servent plus
    // (un rappel part au plus 24 h avant ; jamais sur la date d'origine, qu'une
    // occurrence déplacée rendrait fausse).
    await runAsSystem('agenda : purge des rappels envoyés', () =>
      this.prisma.rappelOccurrence.deleteMany({
        where: { envoyeLe: { lt: new Date(+maintenant - 2 * 86_400_000) } },
      }),
    );
    let envoyes = 0;
    for (const serie of series.filter((x) => x.regle)) {
      let dues: Occurrence[];
      try {
        dues = occurrencesDans(serie, maintenant, horizon).filter(
          (o) => +o.debut > +maintenant && +o.debut - (serie.rappelMinutes ?? 0) * 60_000 <= +maintenant,
        );
      } catch (e) {
        this.log.error(`série ${serie.id} illisible : ${e instanceof Error ? e.message : e}`);
        continue;
      }
      for (const o of dues) {
        try {
          envoyes += await runInCompany(serie.societeId, () => this.envoyerOccurrence(serie.id, serie.societeId, o));
        } catch (e) {
          this.log.error(`rappel de la série ${serie.id} : ${e instanceof Error ? e.message : e}`);
          await runInCompany(serie.societeId, () =>
            this.prisma.rappelOccurrence.deleteMany({ where: { rendezVousId: serie.id, occurrence: o.occurrence! } }),
          ).catch(() => undefined);
        }
      }
    }
    return envoyes;
  }

  private async envoyerOccurrence(id: string, societeId: string, o: Occurrence): Promise<number> {
    const pris = await this.prisma.rappelOccurrence.createMany({
      data: [{ rendezVousId: id, occurrence: o.occurrence! }],
      skipDuplicates: true,
    });
    if (!pris.count) return 0;
    const r = await this.prisma.rendezVous.findUnique({
      where: { id },
      select: { organisateurId: true, invites: { select: { utilisateurId: true, reponse: true } } },
    });
    const rendre = () =>
      this.prisma.rappelOccurrence.deleteMany({ where: { rendezVousId: id, occurrence: o.occurrence! } });
    if (!r) return 0;
    const notifies = await this.notifier(societeId, r, o);
    if (notifies === null) return 0;
    if (!notifies) {
      await rendre();
      return 0;
    }
    return 1;
  }

  // Les membres actifs à prévenir, puis la notification ; null : plus
  // personne à prévenir (rien à reprendre).
  private async notifier(
    societeId: string,
    r: { organisateurId: string; invites: { utilisateurId: string; reponse: string | null }[] },
    o: { titre: string; debut: Date; lieu: string | null },
  ): Promise<number | null> {
    const pressentis = [r.organisateurId, ...r.invites.filter((i) => i.reponse !== 'non').map((i) => i.utilisateurId)];
    const membres = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId, utilisateurId: { in: pressentis }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    const destinataires = [...new Set(membres.map((m) => m.utilisateurId))];
    if (!destinataires.length) return null;
    return this.notifications.envoyer({
      societeId,
      type: 'rdv_rappel',
      titre: `Rappel · ${o.titre} · ${quandRendezVous(o.debut)}${o.lieu ? ` · ${o.lieu}` : ''}`,
      destinataireIds: destinataires,
    });
  }

  // Rend un rappel pris par cette tournée (et par elle seule).
  private async rendre(id: string, maintenant: Date) {
    await this.prisma.rendezVous.updateMany({
      where: { id, rappelEnvoyeLe: maintenant },
      data: { rappelEnvoyeLe: null },
    });
  }
}
