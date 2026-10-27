import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { avecDelegataire } from '../commun/delegation-ceo';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjetsOuvertsService } from '../projets/gabarit/projets-ouverts.service';
import { runAsSystem, runInCompany } from '../tenancy/tenant-context';
import { formatAmount, todayIso } from '@hub/domain';

const ROLE_CEO = 'CEO (transverse)';
const HEURE = 3_600_000;

// Revue CEO (22/10/2026) : une facture à contresigner (au-delà du seuil)
// relance le CEO 24 h après être devenue prête à émettre, puis chaque jour.
// « Prête » = tranche dont les conditions du gabarit sont remplies (même
// règle que « À votre attention »), ou facture directe préparée d'un lead.
// Une tranche préparée à la signature mais pas encore due ne relance pas.
@Injectable()
export class RelancesCeoService implements OnApplicationBootstrap {
  private readonly log = new Logger(RelancesCeoService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private projetsOuverts: ProjetsOuvertsService,
    private seuilCeo: SeuilCeoService,
  ) {}

  // Serveur redémarré après l'heure : la tournée du jour est rattrapée.
  onApplicationBootstrap() {
    if (process.env.NODE_ENV !== 'test' && new Date().getUTCHours() >= 7) setTimeout(() => void this.tournee(), 40_000);
  }

  @Cron('10 7 * * *', { timeZone: 'UTC' })
  async tournee(jour = todayIso()): Promise<number> {
    // Tâche planifiée (ADR 0001) : sociétés ayant un CEO lues en périmètre
    // système, puis les relances de chacune dans son seul périmètre.
    const societes = await runAsSystem('relances du CEO · sociétés concernées', () =>
      this.prisma.utilisateurSocieteRole.findMany({
        where: { role: { nom: ROLE_CEO }, utilisateur: { actif: true }, societeId: { not: null } },
        distinct: ['societeId'],
        select: { societeId: true },
      }),
    );
    let envoyes = 0;
    for (const { societeId } of societes) {
      try {
        envoyes += await runInCompany(societeId!, () => this.factures(societeId!, jour));
      } catch (e) {
        this.log.error(`Relances du CEO interrompues (${societeId}) : ${e instanceof Error ? e.message : e}`);
      }
    }
    return envoyes;
  }

  async factures(societeId: string, jour: string): Promise<number> {
    const [{ tranches }, directes] = await Promise.all([
      this.projetsOuverts.alertes(societeId),
      this.prisma.facture.findMany({
        where: { societeId, statut: 'brouillon', estAvoir: false, dossierCrmId: { not: null }, projetId: null },
        select: { id: true },
      }),
    ]);
    const libelles = new Map<string, string>(
      tranches.filter((t) => t.factureId).map((t) => [t.factureId!, `${t.tranche} · ${t.code} · ${t.client}`]),
    );
    const ids = [...libelles.keys(), ...directes.map((f) => f.id)];
    if (!ids.length) return 0;
    const brouillons = await this.prisma.facture.findMany({
      where: { id: { in: ids }, statut: 'brouillon' },
      select: {
        id: true,
        montantHt: true,
        tauxTva: true,
        devisEcheancierId: true,
        devisOrigineId: true,
        dossierCrmId: true,
        projetId: true,
      },
    });
    const [affaires, seuil, ceo] = await Promise.all([
      this.seuilCeo.montantsAffaire(brouillons),
      this.seuilCeo.seuil(societeId),
      this.notifications.titulairesRole(societeId, ROLE_CEO),
    ]);
    let envoyes = 0;
    for (const f of brouillons) {
      const affaire = affaires.get(f.id) ?? 0;
      if (affaire <= seuil) continue;
      // Premier passage : la facture est vue prête ; la relance attend 24 h.
      const vue = `ceo:facture-prete:${f.id}`;
      await this.prisma.rappelEnvoye.createMany({ data: [{ cle: vue }], skipDuplicates: true });
      const depuis = (await this.prisma.rappelEnvoye.findUnique({ where: { cle: vue } }))!.createdAt;
      const heures = (Date.now() - depuis.getTime()) / HEURE;
      if (heures < 24) continue;
      const { count } = await this.prisma.rappelEnvoye.createMany({
        data: [{ cle: `ceo:facture:${f.id}:${jour}` }],
        skipDuplicates: true,
      });
      if (!count) continue;
      const ecrites = await this.notifications.envoyer({
        societeId,
        type: 'attente_ceo',
        titre: `Facture à contresigner · ${libelles.get(f.id) ?? 'facture directe'} · affaire de ${formatAmount(affaire)} TTC · prête depuis ${Math.floor(heures / 24)} j`,
        destinataireIds: await avecDelegataire(this.prisma, societeId, ceo, null),
        factureId: f.id,
      });
      if (ecrites) envoyes++;
      else await this.prisma.rappelEnvoye.deleteMany({ where: { cle: `ceo:facture:${f.id}:${jour}` } });
    }
    return envoyes;
  }
}
