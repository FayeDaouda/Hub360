import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem, runInCompany } from '../tenancy/tenant-context';
import { quandRendezVous } from './liens';

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
      return await this.tournee(maintenant);
    } finally {
      this.enCours = false;
    }
  }

  private async tournee(maintenant: Date): Promise<number> {
    const candidats = await runAsSystem('agenda : rappels à envoyer', () =>
      this.prisma.rendezVous.findMany({
        where: {
          annuleLe: null,
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
    const pressentis = [r.organisateurId, ...r.invites.filter((i) => i.reponse !== 'non').map((i) => i.utilisateurId)];
    const membres = await this.prisma.utilisateurSocieteRole.findMany({
      where: { societeId, utilisateurId: { in: pressentis }, utilisateur: { actif: true } },
      select: { utilisateurId: true },
    });
    const destinataires = [...new Set(membres.map((m) => m.utilisateurId))];
    if (!destinataires.length) return 0; // plus personne à prévenir : rien à reprendre
    const notifies = await this.notifications.envoyer({
      societeId,
      type: 'rdv_rappel',
      titre: `Rappel · ${r.titre} · ${quandRendezVous(r.debut)}${r.lieu ? ` · ${r.lieu}` : ''}`,
      destinataireIds: destinataires,
    });
    // L'envoi a échoué (le service des notifications rend 0 sans lever) :
    // le rappel est rendu pour la tournée suivante.
    if (!notifies) {
      await this.rendre(id, maintenant);
      return 0;
    }
    return 1;
  }

  // Rend un rappel pris par cette tournée (et par elle seule).
  private async rendre(id: string, maintenant: Date) {
    await this.prisma.rendezVous.updateMany({
      where: { id, rappelEnvoyeLe: maintenant },
      data: { rappelEnvoyeLe: null },
    });
  }
}
