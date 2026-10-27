import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ModePaiement, Prisma, type NiveauPermission } from '@prisma/client';
import { ConfirmationIdentiteService } from '../auth/confirmation-identite.service';
import { aLaPermission } from '../commun/permission.guard';
import { montantHtLignes } from '../devis/domaine';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ventilationTva } from '../projets/domaine/gardes';
import { commissionsAttendues, modeA, type EncaissementHonoraires } from './commissions';
import { ROLE_DAF } from './cycle';
import { runAsSystem, runInCompany } from '../tenancy/tenant-context';
import { formatAmount, formatDayMonth, todayIso, toIsoDay } from '@hub/domain';

type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, NiveauPermission> };

const ROLE_COO = 'COO';
const ROLE_CEO = 'CEO (transverse)';
const CHAMPS_COORDONNEES = ['banque', 'rib', 'wave', 'orangeMoney'] as const;
type Coordonnees = Record<(typeof CHAMPS_COORDONNEES)[number], string>;
const LIBELLE_COORDONNEE: Record<keyof Coordonnees, string> = {
  banque: 'banque',
  rib: 'RIB',
  wave: 'Wave',
  orangeMoney: 'Orange Money',
};

const apporteurDe = (d: {
  apporteurType: string | null;
  apporteurNom: string | null;
  apporteurUtilisateur: { prenom: string; nom: string } | null;
}) =>
  d.apporteurType === 'interne' && d.apporteurUtilisateur
    ? `${d.apporteurUtilisateur.prenom} ${d.apporteurUtilisateur.nom}`
    : (d.apporteurNom ?? 'Apporteur');

// Commissions des apporteurs (revue COO, 22/10/2026) : le HUB calcule les
// lignes à partir des encaissements d'honoraires (ou de la signature), le
// COO suit, le CFO paie (« à payer » → « payée »). Calcul idempotent, rejoué
// à la lecture et chaque matin ; une ligne payée n'est jamais recalculée.
@Injectable()
export class CommissionsService {
  private readonly log = new Logger(CommissionsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private confirmation: ConfirmationIdentiteService,
  ) {}

  // Qui voit les commissions : le COO (il suit), le CFO (il paie), le CEO
  // et l'administration (finances_charges en lecture).
  voit(a: Acteur) {
    return (
      a.role === ROLE_COO ||
      a.role === ROLE_DAF ||
      a.role === 'societe_admin' ||
      aLaPermission(a.permissions, 'finances_charges', 'lecture')
    );
  }
  // Les coordonnées de paiement : celui qui les saisit et celui qui paie.
  private voitCoordonnees(a: Acteur) {
    return a.role === ROLE_COO || a.role === ROLE_DAF || a.role === 'societe_admin';
  }

  @Cron('5 7 * * *', { timeZone: 'UTC' })
  async tournee() {
    // Tâche planifiée (ADR 0001) : découverte des sociétés en périmètre
    // système, puis chacune traitée dans son seul périmètre.
    const societes = await runAsSystem('commissions · sociétés concernées', () =>
      this.prisma.dossierCrm.findMany({
        where: { statut: 'onboard', commissionApporteur: { not: null } },
        distinct: ['societeId'],
        select: { societeId: true },
      }),
    );
    for (const { societeId } of societes) {
      try {
        await runInCompany(societeId, () => this.synchroniser(societeId));
      } catch (e) {
        this.log.error(`Commissions non synchronisées (${societeId}) : ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  async synchroniser(societeId: string) {
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: { societeId, statut: 'onboard', apporteurType: { not: null }, commissionApporteur: { not: null } },
      select: {
        id: true,
        code: true,
        commissionApporteur: true,
        apporteurType: true,
        apporteurNom: true,
        apporteurUtilisateur: { select: { prenom: true, nom: true } },
        transitions: { where: { vers: 'onboard' }, orderBy: { creeLe: 'desc' }, take: 1, select: { creeLe: true } },
        offres: {
          where: { statut: 'accepte' },
          orderBy: { creeLe: 'desc' },
          take: 1,
          select: { lignes: { select: { quantite: true, prixUnitaire: true } } },
        },
      },
    });
    if (!dossiers.length) return;
    const ids = dossiers.map((d) => d.id);
    const [paiements, versions, existantes] = await Promise.all([
      this.prisma.paiement.findMany({
        where: {
          facture: {
            societeId,
            type: 'honoraires',
            estAvoir: false,
            OR: [{ dossierCrmId: { in: ids } }, { projet: { dossierCrmId: { in: ids } } }],
          },
        },
        select: {
          id: true,
          date: true,
          montant: true,
          facture: {
            select: { montantHt: true, tauxTva: true, dossierCrmId: true, projet: { select: { dossierCrmId: true } } },
          },
        },
      }),
      this.prisma.profilFacturation.findMany({
        where: { societeId },
        select: { modeCommission: true, createdAt: true },
      }),
      this.prisma.commissionApporteur.findMany({ where: { societeId } }),
    ]);
    const modes = versions.map((v) => ({ modeCommission: v.modeCommission, jour: toIsoDay(v.createdAt) }));
    const parCle = new Map(existantes.map((c) => [c.cle, c]));
    const attendues = new Set<string>();
    const nouvelles: {
      dossier: (typeof dossiers)[number];
      montant: number;
      baseHt: number;
      exigibleLe: string;
      taux: number;
    }[] = [];

    for (const d of dossiers) {
      const signeLe = d.transitions[0] ? toIsoDay(d.transitions[0].creeLe) : null;
      if (!signeLe) continue;
      const taux = d.commissionApporteur!.toNumber();
      const encaissements: EncaissementHonoraires[] = paiements
        .filter((p) => (p.facture.dossierCrmId ?? p.facture.projet?.dossierCrmId) === d.id)
        .map((p) => {
          const ht = p.facture.montantHt.toNumber();
          return {
            paiementId: p.id,
            date: p.date,
            montantTtc: p.montant.toNumber(),
            factureHt: ht,
            factureTtc: ventilationTva(ht, p.facture.tauxTva.toNumber()).montantTtc,
          };
        });
      const signeHt = d.offres[0] ? montantHtLignes(d.offres[0].lignes) : null;
      for (const c of commissionsAttendues(
        { id: d.id, taux, signeLe, signeHt },
        modeA(modes, signeLe),
        encaissements,
      )) {
        attendues.add(c.cle);
        const ligne = { baseHt: c.baseHt, taux, montant: c.montant, exigibleLe: c.exigibleLe };
        const existante = parCle.get(c.cle);
        if (!existante) {
          try {
            await this.prisma.commissionApporteur.create({
              data: { societeId, dossierCrmId: d.id, cle: c.cle, paiementId: c.paiementId, ...ligne },
            });
            nouvelles.push({ dossier: d, ...ligne });
          } catch (e) {
            // Créée entre-temps par une autre synchronisation : rien à faire.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
          }
        } else if (
          existante.statut === 'a_payer' &&
          (existante.montant.toNumber() !== c.montant ||
            existante.taux.toNumber() !== taux ||
            existante.exigibleLe !== c.exigibleLe)
        ) {
          // % modifié par le COO, encaissement corrigé : une ligne à payer suit.
          await this.prisma.commissionApporteur.update({ where: { id: existante.id }, data: ligne });
        }
      }
    }
    // Encaissement supprimé, apporteur retiré : la ligne à payer disparaît ;
    // une ligne déjà payée reste (trace).
    const orphelines = existantes.filter((c) => c.statut === 'a_payer' && !attendues.has(c.cle)).map((c) => c.id);
    if (orphelines.length) await this.prisma.commissionApporteur.deleteMany({ where: { id: { in: orphelines } } });

    if (nouvelles.length) {
      const cfo = await this.notifications.titulairesRole(societeId, ROLE_DAF);
      for (const n of nouvelles) {
        await this.notifications.envoyer({
          societeId,
          type: 'commission_a_payer',
          titre: `Commission à payer · ${apporteurDe(n.dossier)} · ${n.dossier.code} · ${formatAmount(n.montant)} (${n.taux} % de ${formatAmount(n.baseHt)} HT, exigible le ${formatDayMonth(n.exigibleLe)})`,
          destinataireIds: cfo,
          dossierCrmId: n.dossier.id,
        });
      }
    }
  }

  async liste(a: Acteur) {
    if (!this.voit(a))
      throw new ForbiddenException('Les commissions des apporteurs sont réservées au COO, au CFO et au CEO.');
    await this.synchroniser(a.societeId);
    const lignes = await this.prisma.commissionApporteur.findMany({
      where: { societeId: a.societeId },
      orderBy: [{ statut: 'asc' }, { exigibleLe: 'asc' }],
      include: {
        dossier: {
          select: {
            id: true,
            code: true,
            client: { select: { nom: true } },
            apporteurType: true,
            apporteurNom: true,
            apporteurStructure: true,
            apporteurUtilisateur: { select: { prenom: true, nom: true } },
          },
        },
      },
    });
    const coordonnees = this.voitCoordonnees(a)
      ? await this.coordonneesActuelles([...new Set(lignes.map((l) => l.dossierCrmId))])
      : new Map<string, Coordonnees>();
    const payeurs = await this.prisma.utilisateur.findMany({
      where: { id: { in: lignes.map((l) => l.payeeParId).filter((x): x is string => !!x) } },
      select: { id: true, prenom: true, nom: true },
    });
    const nomPayeur = new Map(payeurs.map((u) => [u.id, `${u.prenom} ${u.nom}`]));
    return {
      peutPayer: a.role === ROLE_DAF || a.role === 'societe_admin',
      lignes: lignes.map((l) => ({
        id: l.id,
        dossierId: l.dossierCrmId,
        code: l.dossier.code,
        client: l.dossier.client.nom,
        apporteur: apporteurDe(l.dossier),
        structure: l.dossier.apporteurStructure,
        source: l.paiementId ? ('encaissement' as const) : ('signature' as const),
        baseHt: l.baseHt.toNumber(),
        taux: l.taux.toNumber(),
        montant: l.montant.toNumber(),
        exigibleLe: l.exigibleLe,
        statut: l.statut,
        payeeLe: l.payeeLe,
        payeePar: l.payeeParId ? (nomPayeur.get(l.payeeParId) ?? null) : null,
        modePaiement: l.modePaiement,
        reference: l.reference,
        // null = pas le droit de les voir ; objet vide de valeurs = non renseignées.
        coordonnees: this.voitCoordonnees(a) ? (coordonnees.get(l.dossierCrmId) ?? null) : null,
      })),
    };
  }

  // Le CFO règle une commission : date, mode, référence. Le COO est prévenu.
  async payer(a: Acteur, id: string, dto: { date: string; mode: ModePaiement; reference?: string }) {
    if (a.role !== ROLE_DAF && a.role !== 'societe_admin')
      throw new ForbiddenException('Seul le CFO paie les commissions des apporteurs.');
    const c = await this.prisma.commissionApporteur.findFirst({
      where: { id, societeId: a.societeId },
      include: {
        dossier: {
          select: {
            code: true,
            apporteurType: true,
            apporteurNom: true,
            apporteurUtilisateur: { select: { prenom: true, nom: true } },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Commission introuvable.');
    if (c.statut === 'payee') throw new ConflictException('Commission déjà payée.');
    if (dto.date > todayIso()) throw new BadRequestException('La date de paiement ne peut pas être dans le futur.');
    const { count } = await this.prisma.commissionApporteur.updateMany({
      where: { id, statut: 'a_payer' },
      data: {
        statut: 'payee',
        payeeLe: dto.date,
        payeeParId: a.userId,
        modePaiement: dto.mode,
        reference: dto.reference?.trim() ?? '',
      },
    });
    if (!count) throw new ConflictException('Commission déjà payée.');
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'commission_payee',
      titre: `Commission payée · ${apporteurDe(c.dossier)} · ${c.dossier.code} · ${formatAmount(c.montant.toNumber())} le ${formatDayMonth(dto.date)}`,
      destinataireIds: await this.notifications.titulairesRole(a.societeId, ROLE_COO),
      parId: a.userId,
      dossierCrmId: c.dossierCrmId,
    });
    return this.liste(a);
  }

  // Coordonnées de paiement de l'apporteur d'un dossier : le COO les saisit
  // (il tient la fiche apporteur) ; identité confirmée à chaque changement,
  // CFO et CEO prévenus sans les numéros — comme celles de la société.
  async lireCoordonnees(a: Acteur, dossierId: string) {
    if (!this.voitCoordonnees(a)) throw new ForbiddenException('Coordonnées de paiement réservées au COO et au CFO.');
    await this.exigerDossier(a.societeId, dossierId);
    return {
      coordonnees: (await this.coordonneesActuelles([dossierId])).get(dossierId) ?? {
        banque: '',
        rib: '',
        wave: '',
        orangeMoney: '',
      },
      confirmation: await this.confirmation.mode(a.userId),
      peutModifier: a.role === ROLE_COO,
    };
  }

  async modifierCoordonnees(a: Acteur, dossierId: string, dto: Partial<Coordonnees> & { confirmation?: string }) {
    if (a.role !== ROLE_COO)
      throw new ForbiddenException('Seul le COO saisit les coordonnées de paiement d’un apporteur.');
    const d = await this.exigerDossier(a.societeId, dossierId);
    const avant = (await this.coordonneesActuelles([dossierId])).get(dossierId) ?? {
      banque: '',
      rib: '',
      wave: '',
      orangeMoney: '',
    };
    const valeurs = Object.fromEntries(CHAMPS_COORDONNEES.map((c) => [c, (dto[c] ?? '').trim()])) as Coordonnees;
    const changes = CHAMPS_COORDONNEES.filter((c) => avant[c] !== valeurs[c]);
    if (!changes.length) return this.lireCoordonnees(a, dossierId);
    const confirmePar = await this.confirmation.verifier(a.userId, dto.confirmation);
    await this.prisma.coordonneesApporteur.create({
      data: { dossierCrmId: dossierId, ...valeurs, confirmation: confirmePar, parId: a.userId },
    });
    const destinataires = [
      ...(await this.notifications.titulairesRole(a.societeId, ROLE_DAF)),
      ...(await this.notifications.titulairesRole(a.societeId, ROLE_CEO)),
    ];
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'coordonnees_apporteur_modifiees',
      titre: `Coordonnées de paiement de l’apporteur modifiées · ${apporteurDe(d)} · ${d.code} : ${changes.map((c) => LIBELLE_COORDONNEE[c]).join(', ')} · confirmé par ${
        confirmePar === 'code' ? 'code de double authentification' : 'mot de passe'
      }`,
      destinataireIds: destinataires,
      parId: a.userId,
      dossierCrmId: dossierId,
    });
    return this.lireCoordonnees(a, dossierId);
  }

  private async exigerDossier(societeId: string, id: string) {
    const d = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: {
        id: true,
        code: true,
        apporteurType: true,
        apporteurNom: true,
        apporteurUtilisateur: { select: { prenom: true, nom: true } },
      },
    });
    if (!d) throw new NotFoundException('Dossier introuvable.');
    if (!d.apporteurType) throw new BadRequestException('Affaire directe : pas d’apporteur à payer.');
    return d;
  }

  private async coordonneesActuelles(dossierIds: string[]): Promise<Map<string, Coordonnees>> {
    if (!dossierIds.length) return new Map();
    const versions = await this.prisma.coordonneesApporteur.findMany({
      where: { dossierCrmId: { in: dossierIds } },
      orderBy: { createdAt: 'desc' },
    });
    const res = new Map<string, Coordonnees>();
    for (const v of versions) {
      if (!res.has(v.dossierCrmId))
        res.set(v.dossierCrmId, { banque: v.banque, rib: v.rib, wave: v.wave, orangeMoney: v.orangeMoney });
    }
    return res;
  }
}
