import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { montantHtLignes } from '../devis/domaine';
import { RentabiliteService } from '../finances/rentabilite/rentabilite.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { moisClos } from '../projets/facturation/cloture';
import { ventilationTva } from '../projets/domaine/gardes';
import { bornesMois } from '../rh/regles-temps';
import { DECISION_EN_VIGUEUR, statutDecision } from './pilotage-regles';
import { PilotageService } from './pilotage.service';
import { ReportingRhService } from './reporting-rh.service';
import { runAsSystem, runInCompany } from '../tenancy/tenant-context';
import { addDays, formatAmount, formatDate, formatMonthYear, plural, todayIso } from '@hub/domain';

type Acteur = { userId: string; societeId: string; role: string };
export type LigneSynthese = { libelle: string; valeur: string; ton?: 'risque' | 'attention' | 'succes' };
export type SectionSynthese = { titre: string; lignes: LigneSynthese[] };

const ROLE_CEO = 'CEO (transverse)';
const ROLE_CFO = 'CFO';
const LECTEURS = new Set([ROLE_CEO, ROLE_CFO, 'societe_admin']);

// Synthèse mensuelle du CEO (revue CEO, 22/10/2026) : générée par le HUB
// après la clôture du mois par le CFO, avec ce qu'il sait déjà — facturation,
// créances et trésorerie à 30/60/90 j, marge provisoire, équipe (reporting
// RH), production, commercial, décisions. Le CFO peut la commenter.
@Injectable()
export class SyntheseService {
  private readonly log = new Logger(SyntheseService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private pilotage: PilotageService,
    private reportingRh: ReportingRhService,
    private rentabilite: RentabiliteService,
  ) {}

  // Toutes les 15 minutes : un mois clôturé depuis la dernière synthèse (ou
  // rouvert puis clôturé de nouveau) est (re)généré.
  @Cron('*/15 * * * *')
  async synchroniser() {
    // Tâche planifiée (ADR 0001) : clôtures de toutes les sociétés lues en
    // périmètre système, puis chaque synthèse générée dans le sien.
    const clotures = await runAsSystem('synthèses mensuelles · clôtures', () =>
      this.prisma.journalCloture.findMany({
        where: { action: 'cloture' },
        orderBy: { createdAt: 'desc' },
        select: { societeId: true, mois: true, createdAt: true },
      }),
    );
    const vus = new Set<string>();
    for (const c of clotures) {
      const cle = `${c.societeId}:${c.mois}`;
      if (vus.has(cle)) continue; // la clôture la plus récente de ce mois
      vus.add(cle);
      try {
        await runInCompany(c.societeId, async () => {
          if (!(await moisClos(this.prisma, c.societeId)).has(c.mois)) return;
          const existante = await this.prisma.syntheseMensuelle.findUnique({
            where: { societeId_mois: { societeId: c.societeId, mois: c.mois } },
            select: { genereLe: true },
          });
          if (existante && existante.genereLe >= c.createdAt) return;
          await this.generer(c.societeId, c.mois, !existante);
        });
      } catch (e) {
        this.log.error(`Synthèse ${c.mois} non générée (${c.societeId}) : ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  async generer(societeId: string, mois: string, premiere: boolean) {
    const contenu = await this.calculer(societeId, mois, todayIso());
    await this.prisma.syntheseMensuelle.upsert({
      where: { societeId_mois: { societeId, mois } },
      create: { societeId, mois, contenu: contenu as unknown as Prisma.InputJsonValue, genereLe: new Date() },
      update: { contenu: contenu as unknown as Prisma.InputJsonValue, genereLe: new Date() },
    });
    const [ceo, cfo] = await Promise.all([
      this.notifications.titulairesRole(societeId, ROLE_CEO),
      this.notifications.titulairesRole(societeId, ROLE_CFO),
    ]);
    await this.notifications.envoyer({
      societeId,
      type: 'synthese_mensuelle',
      titre: `Synthèse de ${formatMonthYear(mois)} ${premiere ? 'disponible' : 'mise à jour (mois clôturé de nouveau)'} · facturation, trésorerie, marge, équipe, production, commercial`,
      destinataireIds: [...ceo, ...cfo],
    });
  }

  async calculer(societeId: string, mois: string, jour: string): Promise<SectionSynthese[]> {
    const { debut, fin } = bornesMois(mois);
    const du = new Date(`${debut}T00:00:00Z`);
    const au = new Date(`${fin}T23:59:59.999Z`);
    const [emises, paiements, factures, rentabilite, rh, direction, dossiers, signatures, decisions] =
      await Promise.all([
        this.prisma.facture.findMany({
          where: { societeId, emiseLe: { gte: du, lte: au } },
          select: { estAvoir: true, montantHt: true, tauxTva: true },
        }),
        this.prisma.paiement.aggregate({
          where: { facture: { societeId }, date: { gte: debut, lte: fin } },
          _sum: { montant: true },
          _count: true,
        }),
        this.prisma.facture.findMany({
          where: { societeId, estAvoir: false, statut: { in: ['emise', 'brouillon'] } },
          select: {
            statut: true,
            dossierCrmId: true,
            projetId: true,
            echeanceLe: true,
            montantHt: true,
            tauxTva: true,
            paiements: { select: { montant: true } },
          },
        }),
        this.rentabilite.portefeuille({ userId: '', societeId, role: ROLE_CEO }, mois).catch(() => null),
        this.reportingRh.contenu(societeId, mois).catch((): { libelle: string; valeur: string }[] => []),
        this.pilotage.contenuDirection(societeId, mois, jour).catch((): { libelle: string; valeur: string }[] => []),
        this.prisma.dossierCrm.findMany({
          where: { societeId, archiveLe: null, statut: { in: ['nouveau_projet', 'en_validation', 'offre_envoyee'] } },
          select: {
            statut: true,
            offres: {
              orderBy: { creeLe: 'desc' },
              take: 1,
              select: { lignes: { select: { quantite: true, prixUnitaire: true } } },
            },
          },
        }),
        this.prisma.dossierCrmTransition.findMany({
          where: { vers: 'onboard', creeLe: { gte: du, lte: au }, dossier: { societeId } },
          select: {
            dossier: {
              select: {
                code: true,
                offres: {
                  where: { statut: 'accepte' },
                  take: 1,
                  select: { lignes: { select: { quantite: true, prixUnitaire: true } } },
                },
              },
            },
          },
        }),
        this.prisma.decisionRegistre.findMany({
          where: { societeId, closeLe: null, ...DECISION_EN_VIGUEUR },
          select: { echeance: true, closeLe: true },
        }),
      ]);
    const ttc = (f: { montantHt: Prisma.Decimal; tauxTva: Prisma.Decimal }) =>
      ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc;
    const sections: SectionSynthese[] = [];

    // 1. Facturation du mois.
    const facturees = emises.filter((f) => !f.estAvoir);
    const avoirs = emises.filter((f) => f.estAvoir);
    sections.push({
      titre: `Facturation · ${formatMonthYear(mois)}`,
      lignes: [
        {
          libelle: 'Facturé',
          valeur: `${formatAmount(facturees.reduce((t, f) => t + ttc(f), 0))} TTC · ${plural(facturees.length, 'facture')}`,
        },
        {
          libelle: 'Encaissé',
          valeur: `${formatAmount(paiements._sum.montant?.toNumber() ?? 0)} · ${plural(paiements._count, 'paiement')}`,
        },
        {
          libelle: 'Avoirs',
          valeur: avoirs.length
            ? `${formatAmount(avoirs.reduce((t, f) => t + ttc(f), 0))} TTC · ${plural(avoirs.length, 'avoir')}`
            : 'aucun',
          ton: avoirs.length ? 'attention' : undefined,
        },
      ],
    });

    // 2. Créances et trésorerie attendue (au jour de la synthèse) — mêmes
    // règles que l'onglet Trésorerie : créance = émise non soldée à son
    // échéance ; « prévu » = tranche chiffrée pas encore émise, à sa date.
    let retard = 0;
    let enRetard = 0;
    let nonDate = 0;
    const fenetres = [30, 60, 90].map((n) => ({ n, au: addDays(jour, n), sur: 0, prevu: 0 }));
    for (const f of factures) {
      const prevu = f.statut === 'brouillon' && !f.dossierCrmId && f.montantHt.toNumber() > 0;
      const reste =
        f.statut === 'brouillon' ? ttc(f) : ttc(f) - f.paiements.reduce((t, p) => t + p.montant.toNumber(), 0);
      if ((!prevu && f.statut !== 'emise') || reste <= 0) continue;
      const date = f.echeanceLe?.slice(0, 10) ?? null;
      if (!date) {
        nonDate += reste;
        continue;
      }
      if (date <= jour) {
        if (prevu) fenetres[0].prevu += reste;
        else {
          retard += reste;
          enRetard++;
        }
        continue;
      }
      const w = fenetres.find((x) => date <= x.au);
      if (w) w[prevu ? 'prevu' : 'sur'] += reste;
    }
    sections.push({
      titre: `Créances et trésorerie · au ${formatDate(jour)}`,
      lignes: [
        {
          libelle: 'Créances en retard',
          valeur: enRetard
            ? `${formatAmount(retard)} · ${plural(enRetard, 'facture')} échue${enRetard > 1 ? 's' : ''}`
            : 'aucune',
          ton: enRetard ? 'risque' : 'succes',
        },
        ...fenetres.map((w, i) => ({
          libelle:
            i === 0 ? 'Encaissements attendus · 30 j' : `Encaissements attendus · ${fenetres[i - 1].n + 1} à ${w.n} j`,
          valeur: `${formatAmount(w.sur + w.prevu)} (${formatAmount(w.sur)} de factures émises, ${formatAmount(w.prevu)} de tranches prévues)`,
        })),
        ...(nonDate
          ? [
              {
                libelle: 'Attendu sans date',
                valeur: `${formatAmount(nonDate)} · tranches ou factures sans échéance fixée`,
              },
            ]
          : []),
      ],
    });

    // 3. Marge provisoire (rentabilité, projets aux données complètes).
    const t = rentabilite?.totaux;
    sections.push({
      titre: 'Marge provisoire',
      lignes:
        t && t.marge !== null && t.ht !== null
          ? [
              {
                libelle: 'Marge',
                valeur: `${formatAmount(t.marge)} sur ${formatAmount(t.ht)} HT${t.taux !== null ? ` · ${t.taux} %` : ''}`,
              },
              {
                libelle: 'Périmètre',
                valeur: `${plural(rentabilite.projetsComplets, 'projet')} aux données complètes · provisoire tant que les mois ne sont pas tous contrôlés`,
              },
            ]
          : [
              {
                libelle: 'Marge',
                valeur: 'pas encore calculable (données de temps ou de salaires incomplètes)',
                ton: 'attention',
              },
            ],
    });

    // 4. Équipe (reporting RH du mois, déjà calculé).
    const rhLigne = (libelle: string) => rh.find((r) => r.libelle === libelle);
    sections.push({
      titre: 'Équipe',
      lignes: [rhLigne('Effectif'), rhLigne('Masse salariale brute')]
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((r) => ({ libelle: r.libelle, valeur: r.valeur })),
    });

    // 5. Production (contenu du reporting de la direction, même calcul).
    sections.push({
      titre: 'Production',
      lignes: direction
        .filter((r) => ['Projets en cours', 'Étapes closes', 'Étapes en retard', 'Livrables émis'].includes(r.libelle))
        .map((r) => ({
          libelle: r.libelle,
          valeur: r.valeur,
          ton: r.libelle === 'Étapes en retard' && !r.valeur.startsWith('0') ? ('risque' as const) : undefined,
        })),
    });

    // 6. Commercial : pipeline en cours, signatures du mois.
    const htOffre = (o?: { lignes: { quantite: Prisma.Decimal; prixUnitaire: Prisma.Decimal }[] }) =>
      o ? montantHtLignes(o.lignes) : 0;
    const signeHt = signatures.reduce((s, x) => s + htOffre(x.dossier.offres[0]), 0);
    sections.push({
      titre: 'Commercial',
      lignes: [
        {
          libelle: 'Pipeline en cours',
          valeur: `${plural(dossiers.length, 'dossier')} · ${formatAmount(dossiers.reduce((s, d) => s + htOffre(d.offres[0]), 0))} HT d’offres`,
        },
        {
          libelle: 'Signatures du mois',
          valeur: signatures.length
            ? `${plural(signatures.length, 'contrat')} · ${formatAmount(signeHt)} HT · ${signatures.map((x) => x.dossier.code).join(', ')}`
            : 'aucune',
        },
      ],
    });

    // 7. Décisions ouvertes au registre.
    const depassees = decisions.filter(
      (d) => statutDecision({ echeance: d.echeance, closeLe: null }, jour) === 'echeance_depassee',
    ).length;
    sections.push({
      titre: 'Décisions',
      lignes: [
        {
          libelle: 'Décisions ouvertes',
          valeur: `${decisions.length}${depassees ? ` · dont ${depassees} à échéance dépassée` : ''}`,
          ton: depassees ? 'risque' : undefined,
        },
      ],
    });
    return sections;
  }

  async liste(a: Acteur) {
    this.exigerLecteur(a);
    const syntheses = await this.prisma.syntheseMensuelle.findMany({
      where: { societeId: a.societeId },
      orderBy: { mois: 'desc' },
    });
    const ids = syntheses.map((s) => s.commentaireParId).filter((x): x is string => !!x);
    const auteurs = ids.length
      ? await this.prisma.utilisateur.findMany({
          where: { id: { in: ids } },
          select: { id: true, prenom: true, nom: true },
        })
      : [];
    const noms = new Map(auteurs.map((u) => [u.id, `${u.prenom} ${u.nom}`]));
    return {
      peutCommenter: a.role === ROLE_CFO,
      syntheses: syntheses.map((s) => ({
        mois: s.mois,
        libelle: formatMonthYear(s.mois),
        genereLe: s.genereLe.toISOString(),
        sections: s.contenu as unknown as SectionSynthese[],
        commentaire: s.commentaire
          ? {
              texte: s.commentaire,
              par: (s.commentaireParId && noms.get(s.commentaireParId)) ?? null,
              le: s.commentaireLe?.toISOString() ?? null,
            }
          : null,
      })),
    };
  }

  async commenter(a: Acteur, mois: string, texte: string) {
    if (a.role !== ROLE_CFO) throw new ForbiddenException('Le commentaire de la synthèse est celui du CFO.');
    const propre = texte.trim();
    if (propre.length > 2000) throw new BadRequestException('Commentaire trop long (2 000 caractères au plus).');
    const s = await this.prisma.syntheseMensuelle.findUnique({
      where: { societeId_mois: { societeId: a.societeId, mois } },
    });
    if (!s) throw new NotFoundException('Synthèse introuvable.');
    await this.prisma.syntheseMensuelle.update({
      where: { id: s.id },
      data: propre
        ? { commentaire: propre, commentaireParId: a.userId, commentaireLe: new Date() }
        : { commentaire: null, commentaireParId: null, commentaireLe: null },
    });
    return this.liste(a);
  }

  private exigerLecteur(a: Acteur) {
    if (!LECTEURS.has(a.role)) throw new ForbiddenException('La synthèse mensuelle est réservée au CEO et au CFO.');
  }
}
