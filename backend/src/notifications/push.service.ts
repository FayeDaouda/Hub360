import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { Interval } from '@nestjs/schedule';
import * as webpush from 'web-push';
import {
  type CategorieNotification,
  categorieNotification,
  enHeuresCalmes,
  LIBELLES_CATEGORIE,
  normaliserPreferences,
  type PreferencesNotifications,
} from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsBus } from '../realtime/notifications.bus';
import { runAsSystem } from '../tenancy/tenant-context';

export type MessagePush = { titre: string; corps: string; url: string; tag: string };
type Abonnement = { endpoint: string; p256dh: string; auth: string };

// Notifications système (Web Push, 02/11/2026) : sur l'ordinateur ou le
// téléphone, même HUB fermé. Chaque notification du HUB est poussée une
// fois, quel que soit le module qui l'a créée (tournée toutes les 5 s), selon
// les préférences de la personne (catégorie, heures calmes). Le service
// worker de l'appareil n'affiche rien si le HUB est déjà devant elle (le
// pop-up s'en charge). Sans clés VAPID, rien n'est envoyé.
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Push');
  private actif = false;
  private enCours = false;
  // Temps réel (09/11/2026) : une notification écrite déclenche la tournée
  // aussitôt (regroupée sur 200 ms) ; l'intervalle de 5 s reste le filet.
  private aRelancer = false;
  private planifiee: NodeJS.Timeout | null = null;
  private abonnement: Subscription | null = null;

  constructor(
    private prisma: PrismaService,
    private bus: NotificationsBus,
  ) {}

  onModuleDestroy() {
    this.abonnement?.unsubscribe();
    if (this.planifiee) clearTimeout(this.planifiee);
  }

  // Tournée dans 200 ms (plusieurs signaux rapprochés = une seule tournée).
  private bientot() {
    if (this.planifiee) return;
    this.planifiee = setTimeout(() => {
      this.planifiee = null;
      void this.distribuer();
    }, 200);
    this.planifiee.unref?.();
  }

  onModuleInit() {
    const [publique, privee] = [process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY];
    if (!publique || !privee) return;
    try {
      webpush.setVapidDetails(process.env.VAPID_SUJET || 'mailto:contact@hub360.space', publique, privee);
      this.actif = true;
      // Nouvelles seulement : une lecture n'a rien à envoyer.
      this.abonnement = this.bus.all().subscribe((s) => {
        if (s.kind === 'new') this.bientot();
      });
    } catch (e) {
      this.log.error(`Clés VAPID invalides : ${e instanceof Error ? e.message : e}`);
    }
  }

  clePublique(): string | null {
    return this.actif ? process.env.VAPID_PUBLIC_KEY! : null;
  }

  async abonner(utilisateurId: string, a: Abonnement, appareil?: string) {
    await this.prisma.abonnementPush.upsert({
      where: { endpoint: a.endpoint },
      create: { utilisateurId, endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth, appareil: appareil ?? null },
      update: { utilisateurId, p256dh: a.p256dh, auth: a.auth, appareil: appareil ?? null },
    });
    return { ok: true };
  }

  async desabonner(utilisateurId: string, endpoint: string) {
    await this.prisma.abonnementPush.deleteMany({ where: { utilisateurId, endpoint } });
    return { ok: true };
  }

  async preferences(utilisateurId: string): Promise<PreferencesNotifications> {
    const u = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { preferencesNotifications: true },
    });
    return normaliserPreferences(u?.preferencesNotifications);
  }

  async majPreferences(utilisateurId: string, brut: unknown): Promise<PreferencesNotifications> {
    const p = normaliserPreferences(brut);
    await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { preferencesNotifications: p as object },
    });
    return p;
  }

  // Envoi direct (nouveau message de la messagerie) : ceux dont les
  // préférences le permettent, hors heures calmes.
  async envoyer(utilisateurIds: string[], message: MessagePush, categorie: CategorieNotification) {
    if (!this.actif || !utilisateurIds.length) return;
    const comptes = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(utilisateurIds)] }, actif: true },
      select: { preferencesNotifications: true, abonnementsPush: true },
    });
    const maintenant = new Date();
    await Promise.all(
      comptes
        .filter((c) => {
          const p = normaliserPreferences(c.preferencesNotifications);
          return p.categories[categorie].systeme && !enHeuresCalmes(p, maintenant);
        })
        .flatMap((c) => c.abonnementsPush.map((a) => this.pousser(a, message))),
    );
  }

  // Tournée : les notifications pas encore poussées (une heure au plus).
  @Interval(5_000)
  async distribuer() {
    // Tournée en cours : une autre suivra juste après (rien n'attend 5 s).
    if (this.enCours) {
      this.aRelancer = true;
      return;
    }
    this.enCours = true;
    try {
      await runAsSystem('notifications système : tournée', async () => {
        const depuis = new Date(Date.now() - 3_600_000);
        const lot = await this.prisma.notification.findMany({
          where: { pousseeLe: null, createdAt: { gte: depuis } },
          select: {
            id: true,
            type: true,
            titre: true,
            destinataireId: true,
            societeId: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 200,
        });
        if (!lot.length) return;
        // Marquées d'abord : jamais deux fois, même si l'envoi échoue.
        await this.prisma.notification.updateMany({
          where: { id: { in: lot.map((n) => n.id) } },
          data: { pousseeLe: new Date() },
        });
        if (!this.actif) return;
        const [comptes, societes] = await Promise.all([
          this.prisma.utilisateur.findMany({
            where: { id: { in: [...new Set(lot.map((n) => n.destinataireId))] }, actif: true },
            select: { id: true, preferencesNotifications: true, abonnementsPush: true },
          }),
          this.prisma.societe.findMany({
            where: { id: { in: [...new Set(lot.map((n) => n.societeId))] } },
            select: { id: true, slug: true },
          }),
        ]);
        const parCompte = new Map(comptes.map((c) => [c.id, c]));
        const slugs = new Map(societes.map((s) => [s.id, s.slug]));
        const maintenant = new Date();
        await Promise.all(
          lot.flatMap((n) => {
            const c = parCompte.get(n.destinataireId);
            if (!c?.abonnementsPush.length) return [];
            const p = normaliserPreferences(c.preferencesNotifications);
            const categorie = categorieNotification(n.type);
            if (!p.categories[categorie].systeme || enHeuresCalmes(p, maintenant)) return [];
            const message: MessagePush = {
              titre: LIBELLES_CATEGORIE[categorie].libelle,
              corps: n.titre,
              url: `/admin/${slugs.get(n.societeId) ?? ''}?notification=${n.id}`,
              tag: n.id,
            };
            return c.abonnementsPush.map((a) => this.pousser(a, message));
          }),
        );
      });
    } catch (e) {
      this.log.error(`Tournée des notifications système : ${e instanceof Error ? e.message : e}`);
    } finally {
      this.enCours = false;
      if (this.aRelancer) {
        this.aRelancer = false;
        this.bientot();
      }
    }
  }

  private async pousser(a: Abonnement, message: MessagePush) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify(message),
        { TTL: 3600, urgency: 'high' },
      );
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Abonnement expiré ou retiré par l'appareil : on l'oublie.
      if (code === 404 || code === 410) {
        await this.prisma.abonnementPush.deleteMany({ where: { endpoint: a.endpoint } });
      } else {
        this.log.warn(`Envoi système refusé (${code ?? 'réseau'}) : ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
