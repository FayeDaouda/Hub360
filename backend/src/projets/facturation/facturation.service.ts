import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FactureStatut, FactureType, JalonFacture, NatureDossier, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { chargerProjet } from '../projet-acces';
import {
  JALONS_FACTURE,
  type PartsFactures,
  refFacture,
  TAUX_TVA_DEFAUT,
  typeFactureDepuisNature,
} from '../domaine/config';
import {
  joursRetardFacture,
  statutFactureEffectif,
  ventilationTva,
} from '../domaine/gardes';
import { FAMILLES_MENSUELLES, lignesOffreDepuisDevis, planFacturationOffre } from '../domaine/facturation-offre';
import { montantRefacture, statutReglementBureau } from '../domaine/refacturation-etudes';
import {
  AjouterPaiementDto,
  CreerFactureDirecteDto,
  CreerEcheancierDto,
  CreerFactureDto,
  PatchFactureDto,
} from './dto';
import { EmailService } from '../../email/email.service';
import { OuvertureProjetService } from '../gabarit/ouverture.service';
import { echeanceDirecte, ErreurFactureDirecte, lignesFactureDirecte } from './facture-directe';
import { NotificationsService } from '../../notifications/notifications.service';
import { SeuilCeoService } from '../../finances/seuil-ceo.service';

const jourCourant = () => new Date().toISOString().slice(0, 10);

// Facturation client — module admin-only (le contrôleur ne marque aucun
// endpoint @EcritureCollaborateur, donc AccesProjetGuard rejette toute écriture
// d'un collaborateur ; la lecture suit la règle projet habituelle, comme le
// pré-bilan). Cf. cadrage « Facturation client ».
// Étape du gabarit dont chaque carte est une étude confiée à un bureau.
const ETAPE_ETUDES = 'etudes';

@Injectable()
export class FacturationService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private reglages: ReglagesService,
    private ouverture: OuvertureProjetService,
    private notifications: NotificationsService,
    private seuilCeo: SeuilCeoService,
  ) {}

  // Soumission du dossier à la DAF (cycle CRM, dans sa transaction) : l'offre
  // en brouillon fige les parts F1 / F2 / F3 du réglage en service. Une offre
  // déjà soumise (parts déjà figées) garde les siennes.
  async figerPartsOffres(tx: Prisma.TransactionClient, societeId: string, dossierCrmId: string) {
    const parts = await this.reglages.partsFactures(societeId);
    await tx.devis.updateMany({
      where: { dossierCrmId, statut: 'brouillon', partsFactures: { equals: Prisma.DbNull } },
      data: { partsFactures: parts },
    });
  }

  async get(societeId: string, projetId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    return this.formater(projetId);
  }

  async creer(societeId: string, projetId: string, dto: CreerFactureDto) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    await this.prisma.facture.create({
      data: {
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature),
        montantHt: dto.montantHt ?? 0,
        tauxTva: dto.tauxTva ?? TAUX_TVA_DEFAUT,
        echeanceLe: dto.echeanceLe ?? null,
        libelle: dto.libelle?.trim() ?? '',
      },
    });
    return this.formater(projetId);
  }

  async creerEcheancier(
    societeId: string,
    projetId: string,
    dto: CreerEcheancierDto,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    if (projet.nature !== 'mandat_client') {
      throw new UnprocessableEntityException(
        "L'échéancier par jalon ne concerne que les mandats client.",
      );
    }
    const dejaUnEcheancier = await this.prisma.facture.count({
      where: { projetId, jalon: { not: null } },
    });
    if (dejaUnEcheancier > 0) {
      throw new ConflictException('Un échéancier existe déjà pour ce projet.');
    }

    const tauxTva = dto.tauxTva ?? TAUX_TVA_DEFAUT;
    await this.prisma.facture.createMany({
      data: JALONS_FACTURE.map((j) => ({
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature), // = honoraires (mandat client)
        jalon: j.cle,
        montantHt: dto.montants[j.cle],
        tauxTva,
        echeanceLe: dto.echeances?.[j.cle] ?? null,
        libelle: j.libelle,
      })),
    });
    return this.formater(projetId);
  }

  async patch(
    societeId: string,
    projetId: string,
    factureId: string,
    dto: PatchFactureDto,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.brouillon(projetId, factureId);
    // Facture à lignes (refacturation d'études) : son montant EST la somme de
    // ses lignes — on ne le saisit pas (supprimer le brouillon pour refaire).
    if (dto.montantHt !== undefined && (await this.prisma.ligneFacture.count({ where: { factureId } }))) {
      throw new UnprocessableEntityException(
        'Le montant d’une facture à lignes est la somme de ses lignes — il ne se saisit pas.',
      );
    }

    const data: Prisma.FactureUpdateInput = {};
    if (dto.montantHt !== undefined) data.montantHt = dto.montantHt;
    if (dto.tauxTva !== undefined) data.tauxTva = dto.tauxTva;
    if (dto.echeanceLe !== undefined) data.echeanceLe = dto.echeanceLe;
    if (dto.libelle !== undefined) data.libelle = dto.libelle.trim();

    await this.prisma.facture.update({ where: { id: facture.id }, data });
    return this.formater(projetId);
  }

  async emettre(societeId: string, projetId: string, factureId: string, acteurId: string) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.brouillon(projetId, factureId);
    if (facture.montantHt.lte(0)) {
      throw new UnprocessableEntityException(
        "Renseignez un montant HT avant d'émettre la facture.",
      );
    }
    // F1 (acompte à la signature) ouvre le projet selon son gabarit
    // (Réglages · « Ouverture du projet ») : J1 = jour d'émission.
    const ouverture =
      facture.jalon === 'signature' && !facture.estAvoir
        ? await this.ouverture.preparer(projetId, new Date().toISOString().slice(0, 10))
        : null;
    // Transition conditionnée sur `statut` dans la transaction : deux émissions
    // concurrentes du même brouillon ne peuvent pas consommer deux numéros.
    // Code du projet = code de son dossier (recopié à l'Onboard).
    await this.avecSequence(societeId, projet.code, async (tx, seq) => {
      const r = await tx.facture.updateMany({
        where: { id: facture.id, statut: 'brouillon' },
        data: { ...seq, statut: 'emise', emiseLe: new Date(), emiseParId: acteurId, echeanceLe: echeanceALEmission(facture) },
      });
      if (r.count === 0) throw new ConflictException('Facture déjà émise.');
      if (ouverture) await this.ouverture.enregistrer(tx, ouverture);
    });
    return this.formater(projetId);
  }

  async supprimer(societeId: string, projetId: string, factureId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.brouillon(projetId, factureId);
    await this.prisma.facture.delete({ where: { id: facture.id } });
    return this.formater(projetId);
  }

  // Correction d'une facture émise (cadrage §5) : on n'édite pas, on émet un
  // avoir qui la porte en négatif et bascule l'originale en « annulée ».
  async creerAvoir(societeId: string, projetId: string, factureId: string, acteurId: string) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    if (facture.estAvoir) {
      throw new ConflictException("Un avoir ne s'annule pas par un autre avoir.");
    }
    if (facture.statut !== 'emise') {
      throw new ConflictException(
        'Seule une facture émise peut être annulée par un avoir.',
      );
    }

    await this.avecSequence(societeId, projet.code, async (tx, seq) => {
      // Annulation conditionnée sur `statut` : deux avoirs concurrents sur la
      // même facture sont exclus (le 2ᵉ voit statut ≠ emise).
      const r = await tx.facture.updateMany({
        where: { id: facture.id, statut: 'emise', estAvoir: false },
        data: { statut: 'annulee', annuleeLe: new Date() },
      });
      if (r.count === 0) throw new ConflictException('Facture déjà annulée.');
      await tx.facture.create({
        data: {
          societeId,
          projetId,
          ...seq,
          statut: 'emise',
          estAvoir: true,
          emiseLe: new Date(),
          emiseParId: acteurId,
          type: facture.type,
          jalon: facture.jalon,
          montantHt: facture.montantHt.negated(),
          tauxTva: facture.tauxTva,
          factureOrigineId: facture.id,
          libelle: `Avoir sur ${refFacture(facture)}`,
        },
      });
    });
    return this.formater(projetId);
  }

  async ajouterPaiement(
    societeId: string,
    projetId: string,
    factureId: string,
    dto: AjouterPaiementDto,
    acteurId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
      select: { id: true, statut: true, estAvoir: true },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    if (facture.estAvoir) {
      throw new ConflictException('Un avoir ne reçoit pas de paiement.');
    }
    if (facture.statut !== 'emise') {
      throw new ConflictException('Seule une facture émise reçoit des paiements.');
    }

    await this.prisma.paiement.create({
      data: {
        factureId: facture.id,
        date: dto.date,
        montant: dto.montant,
        mode: dto.mode ?? null,
        reference: dto.reference?.trim() ?? '',
        creeParId: acteurId,
      },
    });
    return this.formater(projetId);
  }

  async supprimerPaiement(
    societeId: string,
    projetId: string,
    factureId: string,
    paiementId: string,
    acteurId: string,
    motif: string,
  ) {
    if (motif.trim().length < 3) {
      throw new BadRequestException('Indiquez le motif de la suppression (3 caractères au moins).');
    }
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
      select: { id: true },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    const p = await this.prisma.paiement.findFirst({ where: { id: paiementId, factureId: facture.id } });
    if (p) {
      // Correction tracée : la ligne disparaît des cumuls mais sa copie reste
      // (cf. PaiementSupprime).
      await this.prisma.$transaction([
        this.prisma.paiementSupprime.create({
          data: {
            paiementId: p.id,
            factureId: p.factureId,
            societeId,
            date: p.date,
            montant: p.montant,
            mode: p.mode,
            reference: p.reference,
            creeLe: p.creeLe,
            creeParId: p.creeParId,
            supprimeParId: acteurId,
            motif: motif.trim(),
          },
        }),
        this.prisma.paiement.delete({ where: { id: p.id } }),
      ]);
    }
    return this.formater(projetId);
  }

  // Liste À PLAT, toutes sociétés confondues... non : toute LA société, tous
  // projets confondus — pour la page centrale Facturation (cf. cadrage
  // « Devis » §page centrale). N'existait pas avant le module Devis : les
  // requêtes historiques sont toutes scopées à un projetId (cf. formater() ci-
  // dessous, inchangé). Le client d'une facture SANS projet (convertie depuis
  // un devis « libre ») se résout via devisOrigine.client — Facture n'a pas de
  // clientId propre, jamais dupliqué depuis projet.clientId.
  async findAllPourSociete(
    societeId: string,
    filtres: { statut?: FactureStatut; projetId?: string; clientId?: string; id?: string },
  ) {
    const factures = await this.prisma.facture.findMany({
      where: {
        societeId,
        id: filtres.id,
        statut: filtres.statut,
        projetId: filtres.projetId,
        ...(filtres.clientId
          ? {
              OR: [
                { projet: { clientId: filtres.clientId } },
                { devisOrigine: { clientId: filtres.clientId } },
                { dossierCrm: { clientId: filtres.clientId } },
              ],
            }
          : {}),
      },
      include: {
        paiements: true,
        projet: { select: { id: true, code: true, programme: true, client: true } },
        devisOrigine: { select: { numero: true, client: true } },
        dossierCrm: { select: { id: true, code: true, client: true } },
        lignes: { orderBy: { ordre: 'asc' } },
      },
      orderBy: [{ creeLe: 'desc' }],
    });
    const aujourdhui = jourCourant();
    const [rangs, tranches, affaires] = await Promise.all([
      this.rangsParDossier(societeId),
      this.tranchesEcheancier(societeId, [...new Set(factures.map((f) => f.projetId).filter((x): x is string => !!x))]),
      this.seuilCeo.montantsAffaire(factures),
    ]);

    return factures.map((f) => {
      const montantHt = f.montantHt.toNumber();
      const tauxTva = f.tauxTva.toNumber();
      const { montantTva, montantTtc } = ventilationTva(montantHt, tauxTva);
      const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      const statutEffectif = statutFactureEffectif(
        { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
        aujourdhui,
      );
      const client = f.projet?.client ?? f.devisOrigine?.client ?? f.dossierCrm?.client ?? null;
      return {
        id: f.id,
        numero: f.numero,
        reference: refFacture(f),
        type: f.type,
        jalon: f.jalon,
        libelle: f.libelle,
        statut: f.statut,
        statutEffectif,
        montantHt,
        tauxTva,
        montantTva,
        montantTtc,
        echeanceLe: f.echeanceLe,
        estAvoir: f.estAvoir,
        factureOrigineId: f.factureOrigineId,
        devisOrigineId: f.devisOrigineId,
        // Offre d'origine (tranche) ou ligne d'offre (mensualité) : répartition par prestation.
        devisEcheancierId: f.devisEcheancierId,
        ligneDevisId: f.ligneDevisId,
        creeLe: f.creeLe,
        emiseLe: f.emiseLe,
        annuleeLe: f.annuleeLe,
        montantPaye,
        resteAPayer: montantTtc - montantPaye,
        joursRetard:
          statutEffectif === 'en_retard' ? joursRetardFacture(f.echeanceLe, aujourdhui) : 0,
        projetId: f.projetId,
        projet: f.projet ? { id: f.projet.id, code: f.projet.code, programme: f.projet.programme } : null,
        client: client ? { id: client.id, nom: client.nom } : null,
        // Brouillon : la référence qu'il prendra à l'émission (rang suivant du
        // dossier) — indicative, attribuée seulement par la validation.
        referencePrevue: prochaineReference(f.statut === 'brouillon' ? (f.dossierCrm?.code ?? f.projet?.code ?? null) : null, rangs),
        // Tranche d'échéancier « k/N » (maquette Finances) ; null hors échéancier.
        tranche: tranches.get(f.id) ?? null,
        // Facture directe d'un lead (sans offre) ; null sinon.
        dossierCrm: f.dossierCrm ? { id: f.dossierCrm.id, code: f.dossierCrm.code } : null,
        // Montant de l'affaire (TTC) : le CEO valide au-delà du seuil de contresignature.
        affaireTtc: affaires.get(f.id)!,
        paiements: f.paiements
          .map((p) => ({ id: p.id, date: p.date, montant: p.montant.toNumber(), mode: p.mode, reference: p.reference }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        lignes: f.lignes.map(versLigneFacture),
      };
    });
  }

  // --- Facture directe d'un lead (sans offre) — maquette Finances, oct. 2026 ---
  // Leads facturables : dossiers CRM non archivés de la société.
  async leadsFacturables(societeId: string) {
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: { societeId, archiveLe: null },
      select: { id: true, code: true, statut: true, localisation: true, localite: { select: { nom: true } }, client: { select: { nom: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const rangs = await this.rangsParDossier(societeId);
    return dossiers.map((d) => ({
      id: d.id,
      code: d.code,
      client: d.client.nom,
      localisation: d.localite?.nom ?? d.localisation,
      statut: d.statut,
      // « Nouvelle facture D_ALM.26-1 » : la référence que prendra la prochaine
      // facture émise sur ce lead.
      prochaineReference: prochaineReference(d.code, rangs)!,
    }));
  }

  // Dernier rang de facture émis par code de dossier.
  private async rangsParDossier(societeId: string): Promise<Map<string, number>> {
    const g = await this.prisma.facture.groupBy({
      by: ['codeDossier'],
      where: { societeId, codeDossier: { not: null } },
      _max: { rangDossier: true },
    });
    return new Map(g.map((x) => [x.codeDossier!, x._max.rangDossier ?? 0]));
  }

  // Position « k/N » des factures d'échéancier (jalons) de chaque projet, dans
  // l'ordre des jalons ; les avoirs n'en font pas partie.
  private async tranchesEcheancier(societeId: string, projetIds: string[]) {
    const tranches = new Map<string, { rang: number; total: number }>();
    if (!projetIds.length) return tranches;
    const fs = await this.prisma.facture.findMany({
      where: { societeId, projetId: { in: projetIds }, jalon: { not: null }, estAvoir: false },
      select: { id: true, projetId: true, jalon: true, creeLe: true },
    });
    const ordre = (j: JalonFacture | null) => JALONS_FACTURE.findIndex((x) => x.cle === j);
    for (const projetId of projetIds) {
      const duProjet = fs
        .filter((f) => f.projetId === projetId)
        .sort((a, b) => ordre(a.jalon) - ordre(b.jalon) || a.creeLe.getTime() - b.creeLe.getTime());
      duProjet.forEach((f, i) => tranches.set(f.id, { rang: i + 1, total: duProjet.length }));
    }
    return tranches;
  }

  // Préparée « à valider par le CFO avant émission » : brouillon, sans numéro,
  // ni envoyée ni comptée tant que le CFO ne l'a pas émise. Rattachée au
  // projet du lead s'il existe déjà (Onboard).
  async creerFactureDirecte(societeId: string, dto: CreerFactureDirecteDto) {
    let lignes: ReturnType<typeof lignesFactureDirecte>;
    try {
      lignes = lignesFactureDirecte(dto.lignes);
    } catch (e) {
      if (e instanceof ErreurFactureDirecte) throw new BadRequestException(e.message);
      throw e;
    }
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id: dto.dossierCrmId, societeId },
      select: { id: true, code: true, nature: true, archiveLe: true, projet: { select: { id: true } }, client: { select: { nom: true } } },
    });
    if (!dossier) throw new NotFoundException('Lead introuvable');
    if (dossier.archiveLe) throw new ConflictException('Lead archivé : aucune facture ne s’y prépare.');
    const f = await this.prisma.facture.create({
      data: {
        societeId,
        dossierCrmId: dossier.id,
        projetId: dossier.projet?.id ?? null,
        type: typeFactureDepuisNature(dossier.nature),
        tauxTva: TAUX_TVA_DEFAUT,
        libelle: lignes[0].designation,
        montantHt: lignes.reduce((t, l) => t + l.montantHt, 0),
        lignes: { create: lignes.map((l, ordre) => ({ ...l, ordre })) },
      },
      select: { id: true, montantHt: true, tauxTva: true },
    });
    const { montantTtc } = ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber());
    await this.notifications.notifierFactureAValider({
      societeId,
      factureId: f.id,
      dossierCrmId: dossier.id,
      titre: `Facture directe à valider · ${dossier.code} · ${dossier.client.nom} · ${montantTtc.toLocaleString('fr-FR')} FCFA TTC`,
    });
    return this.factureCentrale(societeId, f.id);
  }

  async factureCentrale(societeId: string, factureId: string) {
    const [f] = await this.findAllPourSociete(societeId, { id: factureId });
    if (!f) throw new NotFoundException('Facture introuvable');
    return f;
  }

  // Actions depuis Finances, par l'id de la facture : celle d'un projet suit
  // les règles du projet (F1 ouvre le projet, etc.) ; une facture directe sans
  // projet, les mêmes règles de numérotation et de statut.
  async emettreParId(societeId: string, factureId: string, acteurId: string) {
    const f = await this.facturePourAction(societeId, factureId);
    if (f.projetId) {
      await this.emettre(societeId, f.projetId, factureId, acteurId);
      return this.factureCentrale(societeId, factureId);
    }
    if (f.statut !== 'brouillon') throw new ConflictException('Facture déjà émise.');
    if (f.montantHt.lte(0)) throw new UnprocessableEntityException("Renseignez un montant HT avant d'émettre la facture.");
    const dossier = f.dossierCrmId
      ? await this.prisma.dossierCrm.findUnique({ where: { id: f.dossierCrmId }, select: { code: true } })
      : null;
    await this.avecSequence(societeId, dossier?.code ?? null, async (tx, seq) => {
      const r = await tx.facture.updateMany({
        where: { id: f.id, statut: 'brouillon' },
        data: { ...seq, statut: 'emise', emiseLe: new Date(), emiseParId: acteurId, echeanceLe: echeanceALEmission(f) },
      });
      if (r.count === 0) throw new ConflictException('Facture déjà émise.');
    });
    return this.factureCentrale(societeId, factureId);
  }

  async supprimerParId(societeId: string, factureId: string) {
    const f = await this.facturePourAction(societeId, factureId);
    if (f.projetId) {
      await this.supprimer(societeId, f.projetId, factureId);
      return { ok: true };
    }
    const { count } = await this.prisma.facture.deleteMany({ where: { id: f.id, statut: 'brouillon' } });
    if (count === 0) throw new ConflictException('Facture émise — non modifiable. Créez un avoir pour la corriger.');
    return { ok: true };
  }

  async ajouterPaiementParId(societeId: string, factureId: string, dto: AjouterPaiementDto, acteurId: string) {
    const f = await this.facturePourAction(societeId, factureId);
    if (f.projetId) {
      await this.ajouterPaiement(societeId, f.projetId, factureId, dto, acteurId);
      return this.factureCentrale(societeId, factureId);
    }
    if (f.estAvoir) throw new ConflictException('Un avoir ne reçoit pas de paiement.');
    if (f.statut !== 'emise') throw new ConflictException('Seule une facture émise reçoit des paiements.');
    await this.prisma.paiement.create({
      data: { factureId: f.id, date: dto.date, montant: dto.montant, mode: dto.mode ?? null, reference: dto.reference?.trim() ?? '', creeParId: acteurId },
    });
    return this.factureCentrale(societeId, factureId);
  }

  private async facturePourAction(societeId: string, factureId: string) {
    const f = await this.prisma.facture.findFirst({ where: { id: factureId, societeId } });
    if (!f) throw new NotFoundException('Facture introuvable');
    return f;
  }

  // Relance MANUELLE d'une facture en retard — cf. cadrage « Devis »
  // §Zervant : pas de scheduler dans ce backend (statuts dérivés à la
  // lecture, jamais un job planifié), donc pas de relance automatique non
  // plus. L'admin déclenche lui-même, au moment qu'il juge utile — zéro
  // nouvelle infra, zéro champ stocké (pas d'historique de relance en v1).
  async relancer(societeId: string, factureId: string): Promise<{ envoye: boolean }> {
    const f = await this.prisma.facture.findFirst({
      where: { id: factureId, societeId },
      include: {
        paiements: true,
        projet: { select: { client: true } },
        devisOrigine: { select: { numero: true, client: true } },
        societe: { select: { nom: true } },
      },
    });
    if (!f) throw new NotFoundException('Facture introuvable');

    const montantHt = f.montantHt.toNumber();
    const tauxTva = f.tauxTva.toNumber();
    const { montantTtc } = ventilationTva(montantHt, tauxTva);
    const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
    const aujourdhui = jourCourant();
    const statutEffectif = statutFactureEffectif(
      { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
      aujourdhui,
    );
    if (statutEffectif !== 'en_retard') {
      throw new ConflictException('Seule une facture en retard peut être relancée.');
    }

    const client = f.projet?.client ?? f.devisOrigine?.client ?? null;
    if (!client?.email) {
      throw new UnprocessableEntityException("Ce client n'a pas d'adresse email enregistrée.");
    }

    const { envoye } = await this.email.envoyerRelanceFacture({
      email: client.email,
      clientNom: client.nom,
      societeNom: f.societe.nom,
      reference: refFacture(f),
      resteAPayer: montantTtc - montantPaye,
      echeanceLe: f.echeanceLe,
      joursRetard: joursRetardFacture(f.echeanceLe, aujourdhui),
    });
    return { envoye };
  }

  // Émission directe depuis un devis accepté (cf. DevisService.convertir,
  // module src/devis) : le client a déjà accepté, il n'y a pas de brouillon à
  // faire valider — la facture naît émise. `devisOrigineId` porte la
  // traçabilité vers le détail ligne par ligne du devis (Facture reste à
  // montant unique, cf. cadrage « Devis » — jamais de refonte de ce système
  // déjà livré et testé pour lui ajouter des lignes).
  async creerDepuisDevis(
    societeId: string,
    data: {
      projetId: string | null;
      type: FactureType;
      libelle: string;
      montantHt: number;
      tauxTva: number;
      devisOrigineId: string;
    },
    acteurId: string,
  ): Promise<string> {
    let factureId = '';
    const projet = data.projetId
      ? await this.prisma.projet.findUnique({ where: { id: data.projetId }, select: { code: true } })
      : null;
    await this.avecSequence(societeId, projet?.code ?? null, async (tx, seq) => {
      const f = await tx.facture.create({
        data: {
          societeId,
          projetId: data.projetId,
          ...seq,
          type: data.type,
          statut: 'emise',
          libelle: data.libelle,
          montantHt: data.montantHt,
          tauxTva: data.tauxTva,
          emiseLe: new Date(),
          emiseParId: acteurId,
          devisOrigineId: data.devisOrigineId,
        },
      });
      factureId = f.id;
    });
    return factureId;
  }

  // Étape H2 — au passage du dossier à « onboard » (appelé DANS la transaction
  // pivot de CrmService) : l'offre acceptée devient des factures BROUILLON sur
  // le nouveau projet, selon les CGV (cf. domaine/facturation-offre.ts). Rien
  // n'est émis : chaque facture part quand l'admin juge l'étape atteinte
  // (décision : pas d'accrochage automatique aux jalons, tant que l'étape D
  // n'a pas posé les données qui les marqueraient).
  async preparerDepuisOffre(
    tx: Prisma.TransactionClient,
    societeId: string,
    projet: { id: string; nature: NatureDossier },
    devisId: string,
  ): Promise<number> {
    const lignes = await tx.ligneDevis.findMany({
      where: { devisId },
      include: { produitService: { select: { code: true, famille: true } } },
      orderBy: { ordre: 'asc' },
    });
    // Parts figées sur l'offre (soumission à la DAF) ; à défaut, réglage en service.
    const offre = await tx.devis.findUnique({ where: { id: devisId }, select: { partsFactures: true } });
    const parts = (offre?.partsFactures as PartsFactures | null) ?? (await this.reglages.partsFactures(societeId));
    const plan = planFacturationOffre(lignesOffreDepuisDevis(lignes), parts);
    await tx.facture.createMany({
      data: plan.map((f) => ({
        societeId,
        projetId: projet.id,
        type: typeFactureDepuisNature(projet.nature),
        jalon: f.jalon,
        libelle: f.libelle,
        montantHt: f.montantHt,
        tauxTva: f.tauxTva,
        devisEcheancierId: devisId,
        cleEcheance: f.cle,
      })),
    });
    return plan.length;
  }

  // Facture (brouillon) de la mensualité en cours d'une ligne SU / EX de
  // l'offre — facturation mensuelle MANUELLE (pas de scheduler) : le rappel
  // « à facturer ce mois » est dérivé à la lecture (cf. formater).
  async creerMensualite(societeId: string, projetId: string, ligneDevisId: string) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const [ligne] = await this.lignesMensuelles(projetId, ligneDevisId);
    if (!ligne) throw new NotFoundException('Ligne mensuelle introuvable pour ce projet');
    const m = this.etatMensualite(ligne, projet.phase);
    if (m.moisFactures >= m.moisPrevus) {
      throw new ConflictException('Toutes les mensualités prévues à l’offre sont déjà facturées.');
    }
    if (m.factureCeMois) {
      throw new ConflictException('La mensualité de ce mois est déjà facturée.');
    }
    const mois = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    await this.prisma.facture.create({
      data: {
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature),
        libelle: `${m.nom} — mensualité ${m.moisFactures + 1}/${m.moisPrevus} (${mois})`,
        montantHt: Math.round(ligne.prixUnitaire.toNumber()),
        tauxTva: ligne.tauxTva.toNumber(),
        ligneDevisId,
      },
    });
    return this.formater(projetId);
  }

  // Étape H3 — refacturation des études techniques (option B : UNE facture,
  // une ligne par étude, CGV art. 5). Chaque étude doit avoir son bureau et le
  // montant HT de sa facture (saisis dans Études), et aucune refacturation
  // active. La facture naît brouillon, taux de TVA unique (défaut 18 %).
  async refacturerEtudes(societeId: string, projetId: string, blocIds: string[]) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const blocs = await this.prisma.blocEtude.findMany({
      where: { id: { in: blocIds }, projetId, supprimee: false },
      include: { lignesFacture: { include: { facture: { select: { statut: true, estAvoir: true } } } } },
    });
    if (blocs.length !== new Set(blocIds).size) {
      throw new NotFoundException('Étude introuvable pour ce projet.');
    }
    for (const b of blocs) {
      if (!b.interlocuteur.trim() || !b.factureMontant || b.factureMontant.toNumber() <= 0) {
        throw new UnprocessableEntityException(
          `« ${b.libelle} » : renseigne le bureau d’études et le montant HT de sa facture.`,
        );
      }
      if (b.lignesFacture.some((l) => l.facture.statut !== 'annulee' && !l.facture.estAvoir)) {
        throw new ConflictException(`« ${b.libelle} » est déjà refacturée.`);
      }
    }
    const ordonnes = blocIds.map((id) => blocs.find((b) => b.id === id)!);
    const lignes = ordonnes.map((b, ordre) => {
      const base = Math.round(b.factureMontant!.toNumber());
      return {
        designation: `${b.libelle} — ${b.interlocuteur.trim()}`,
        montantBase: base,
        montantHt: montantRefacture(base),
        blocEtudeId: b.id,
        ordre,
      };
    });
    await this.prisma.facture.create({
      data: {
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature),
        libelle: 'Refacturation des études techniques',
        montantHt: lignes.reduce((s, l) => s + l.montantHt, 0),
        tauxTva: TAUX_TVA_DEFAUT,
        lignes: { create: lignes },
      },
    });
    return this.formater(projetId);
  }

  // Facture du bureau d'études pour une étude de l'étape 05 du gabarit (phase
  // 1, 14/10/2026 — avant, dans la section Études du projet). Une étude déjà
  // refacturée ne se modifie plus : on corrige par un avoir.
  async saisirFactureBureau(
    societeId: string,
    projetId: string,
    carteId: string,
    dto: { bureau: string; montantHt: number; fichier?: { nom: string; url: string } | null },
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const carte = await this.prisma.carteProjet.findFirst({
      where: { id: carteId, projetId, etapeCle: ETAPE_ETUDES },
      select: { id: true, libelle: true },
    });
    if (!carte) throw new NotFoundException('Étude introuvable pour ce projet.');
    const existant = await this.prisma.blocEtude.findUnique({
      where: { projetId_carteProjetId: { projetId, carteProjetId: carteId } },
      include: { lignesFacture: { include: { facture: { select: { statut: true, estAvoir: true } } } } },
    });
    if (existant?.lignesFacture.some((l) => l.facture.statut !== 'annulee' && !l.facture.estAvoir)) {
      throw new ConflictException(`« ${carte.libelle} » est déjà refacturée : corrigez par un avoir.`);
    }
    const data = {
      interlocuteur: dto.bureau.trim(),
      factureMontant: dto.montantHt,
      ...(dto.fichier !== undefined && {
        factureFichierNom: dto.fichier?.nom ?? null,
        factureFichierCle: dto.fichier?.url ?? null,
      }),
    };
    await this.prisma.$transaction([
      this.prisma.etudes.upsert({ where: { projetId }, update: {}, create: { projetId } }),
      this.prisma.blocEtude.upsert({
        where: { projetId_carteProjetId: { projetId, carteProjetId: carteId } },
        update: data,
        create: { projetId, carteProjetId: carteId, libelle: carte.libelle, ...data },
      }),
    ]);
    return this.formater(projetId);
  }

  // Le bureau a été réglé par Grey Concrete — possible seulement une fois le
  // client encaissé (« à régler »). Acte de charge : CFO (finances_charges,
  // cf. contrôleur).
  async marquerBureauRegle(societeId: string, projetId: string, blocId: string, userId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const bloc = await this.prisma.blocEtude.findFirst({
      where: { id: blocId, projetId, supprimee: false },
      select: { id: true, bureauRegleLe: true },
    });
    if (!bloc) throw new NotFoundException('Étude introuvable pour ce projet.');
    const etat = (await this.formater(projetId)).etudes.find((e) => e.blocId === blocId);
    if (etat?.statutReglement !== 'a_regler') {
      throw new ConflictException(
        'Le bureau ne se règle qu’après l’encaissement complet de la facture client (CGV art. 5).',
      );
    }
    await this.prisma.blocEtude.update({
      where: { id: blocId },
      data: { bureauRegleLe: new Date(), bureauRegleParId: userId },
    });
    return this.formater(projetId);
  }

  // Bureaux d'études à régler, toute la société (page Facturation centrale) :
  // facture de refacturation soldée, règlement pas encore saisi.
  async bureauxARegler(societeId: string) {
    const blocs = await this.prisma.blocEtude.findMany({
      where: {
        supprimee: false,
        bureauRegleLe: null,
        etudes: { projet: { societeId } },
        lignesFacture: { some: { facture: { statut: 'emise', estAvoir: false } } },
      },
      include: {
        etudes: { select: { projet: { select: { id: true, code: true, programme: true } } } },
        lignesFacture: {
          where: { facture: { statut: 'emise', estAvoir: false } },
          include: { facture: { include: { paiements: true } } },
        },
      },
    });
    const aujourdhui = jourCourant();
    return blocs.flatMap((b) => {
      const ligne = b.lignesFacture[0];
      const f = ligne.facture;
      const { montantTtc } = ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber());
      const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      const statut = statutFactureEffectif(
        { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
        aujourdhui,
      );
      if (statut !== 'payee') return [];
      return [
        {
          blocId: b.id,
          libelle: b.libelle,
          bureau: b.interlocuteur,
          montantBureauHt: ligne.montantBase?.toNumber() ?? null,
          factureReference: refFacture({ ...f, estAvoir: false }),
          projet: b.etudes.projet,
        },
      ];
    });
  }

  // Référence courte des projets de la société, pour la section Facturation
  // (filtre, choix du projet d'un devis) — ses propres données, sans ouvrir
  // les routes Projets aux rôles de direction.
  async projetsPourFacturation(societeId: string) {
    const projets = await this.prisma.projet.findMany({
      where: { societeId },
      select: {
        id: true,
        code: true,
        programme: true,
        client: { select: { id: true, nom: true } },
        dossierCrm: { select: { categorieConception: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Catégorie CO (fixée à l'envoi de l'offre) : tarif des reprises majeures
    // et suivi de chantier d'un devis complémentaire (étape H4).
    return projets.map(({ dossierCrm, ...p }) => ({
      ...p,
      categorieConception: dossierCrm?.categorieConception ?? null,
    }));
  }

  // -- Internes --------------------------------------------------------------

  // Lignes SU / EX d'une offre acceptée rattachée au projet, avec leurs
  // mensualités déjà facturées.
  private lignesMensuelles(projetId: string, ligneDevisId?: string) {
    return this.prisma.ligneDevis.findMany({
      where: {
        id: ligneDevisId,
        devis: { projetId, statut: { in: ['accepte', 'transforme'] } },
        produitService: { famille: { in: FAMILLES_MENSUELLES } },
      },
      include: {
        produitService: { select: { code: true } },
        mensualites: { select: { statut: true, estAvoir: true, creeLe: true } },
      },
      orderBy: { ordre: 'asc' },
    });
  }

  // Une mensualité annulée par avoir ne compte plus (le mois peut se
  // refacturer). « À facturer ce mois » : projet en chantier (SU = suivi de
  // chantier, EX = extras de chantier), mois restants, rien ce mois-ci.
  private etatMensualite(
    l: Awaited<ReturnType<FacturationService['lignesMensuelles']>>[number],
    phase: string,
  ) {
    const valides = l.mensualites.filter((f) => f.statut !== 'annulee' && !f.estAvoir);
    const moisCourant = jourCourant().slice(0, 7);
    const moisPrevus = Math.round(l.quantite.toNumber());
    const moisFactures = valides.length;
    const factureCeMois = valides.some((f) => f.creeLe.toISOString().slice(0, 7) === moisCourant);
    return {
      nom: l.produitService?.code ? `${l.produitService.code} — ${l.designation.replace(/^\S+ — /, '')}` : l.designation,
      moisPrevus,
      moisFactures,
      factureCeMois,
      aFacturerCeMois: phase === 'chantier' && moisFactures < moisPrevus && !factureCeMois,
    };
  }

  private async brouillon(projetId: string, factureId: string) {
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    if (facture.statut !== 'brouillon') {
      throw new ConflictException(
        'Facture émise — non modifiable. Créez un avoir pour la corriger.',
      );
    }
    return facture;
  }

  // Attribue le prochain numéro séquentiel de la société (cadrage §5) et exécute
  // `action` dans la même transaction. Retry sur collision de séquence (P2002
  // sur @@unique([societeId, numero])) : la contention est quasi nulle (studio
  // de 4 personnes), mais la garantie « sans trou » repose sur cette unicité,
  // pas sur l'absence de course. Le numéro n'est attribué qu'ici — un brouillon
  // reste sans numéro, donc sa suppression ne laisse pas de trou.
  // Avec `codeDossier` (code du dossier de la facture), attribue aussi son rang
  // dans le dossier — la référence affichée « CODE-n » (maquette Finances),
  // sans trou par dossier : seule une émission consomme un rang.
  private async avecSequence(
    societeId: string,
    codeDossier: string | null,
    action: (tx: Prisma.TransactionClient, seq: Sequence) => Promise<unknown>,
  ) {
    for (let essai = 0; ; essai++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const max = await tx.facture.aggregate({
            where: { societeId, numero: { not: null } },
            _max: { numero: true },
          });
          const rang = codeDossier
            ? await tx.facture.aggregate({ where: { societeId, codeDossier }, _max: { rangDossier: true } })
            : null;
          await action(tx, {
            numero: (max._max.numero ?? 0) + 1,
            codeDossier,
            rangDossier: rang ? (rang._max.rangDossier ?? 0) + 1 : null,
          });
        });
        return;
      } catch (e) {
        const collision =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (collision && essai < 4) continue;
        throw e;
      }
    }
  }

  private async formater(projetId: string) {
    const [factures, projet, lignesMensuelles] = await Promise.all([
      this.prisma.facture.findMany({
        where: { projetId },
        include: { paiements: true, lignes: { orderBy: { ordre: 'asc' } } },
      }),
      // En-tête du projet pour la page Facturation (qui n'appelle pas les
      // routes Projets, fermées aux rôles de direction) + phase (mensualités).
      this.prisma.projet.findUniqueOrThrow({
        where: { id: projetId },
        select: {
          id: true,
          code: true,
          programme: true,
          nature: true,
          categorie: true,
          localisation: true,
          type: true,
          phase: true,
          client: { select: { id: true, nom: true } },
        },
      }),
      this.lignesMensuelles(projetId),
    ]);
    // Études du projet (H3) : une ligne par carte de l'étape 05 du gabarit
    // (facture du bureau saisie ici depuis la phase 1), plus les anciennes
    // études déjà chiffrées ou refacturées — état de règlement du bureau.
    const [cartesEtudes, blocsProjet] = await Promise.all([
      this.prisma.carteProjet.findMany({
        where: { projetId, etapeCle: ETAPE_ETUDES, desactivation: null },
        select: { id: true, libelle: true },
        orderBy: { ordre: 'asc' },
      }),
      this.prisma.blocEtude.findMany({
        where: { projetId, supprimee: false },
        include: { lignesFacture: { select: { factureId: true, montantHt: true } } },
        orderBy: { libelle: 'asc' },
      }),
    ]);
    const blocsEtude = [
      ...cartesEtudes.map((c) => ({ carteId: c.id, libelleCarte: c.libelle, bloc: blocsProjet.find((b) => b.carteProjetId === c.id) ?? null })),
      ...blocsProjet
        .filter((b) => !b.carteProjetId && (b.factureMontant != null || b.lignesFacture.length > 0))
        .map((b) => ({ carteId: null, libelleCarte: b.libelle, bloc: b })),
    ];
    const aujourdhui = jourCourant();
    const affaires = await this.seuilCeo.montantsAffaire(factures);

    const ordre = [...factures].sort((a, b) => {
      const na = a.numero ?? Number.MAX_SAFE_INTEGER;
      const nb = b.numero ?? Number.MAX_SAFE_INTEGER;
      if (na !== nb) return na - nb;
      return a.creeLe.getTime() - b.creeLe.getTime();
    });

    const rendues = ordre.map((f) => {
      const montantHt = f.montantHt.toNumber();
      const tauxTva = f.tauxTva.toNumber();
      const { montantTva, montantTtc } = ventilationTva(montantHt, tauxTva);
      const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      const statutEffectif = statutFactureEffectif(
        { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
        aujourdhui,
      );
      return {
        id: f.id,
        numero: f.numero,
        reference: refFacture(f),
        type: f.type,
        jalon: f.jalon,
        libelle: f.libelle,
        statut: f.statut,
        statutEffectif,
        montantHt,
        tauxTva,
        montantTva,
        montantTtc,
        echeanceLe: f.echeanceLe,
        estAvoir: f.estAvoir,
        factureOrigineId: f.factureOrigineId,
        creeLe: f.creeLe,
        emiseLe: f.emiseLe,
        annuleeLe: f.annuleeLe,
        montantPaye,
        resteAPayer: montantTtc - montantPaye,
        joursRetard:
          statutEffectif === 'en_retard'
            ? joursRetardFacture(f.echeanceLe, aujourdhui)
            : 0,
        // Montant de l'affaire (TTC) : le CEO valide au-delà du seuil de contresignature.
        affaireTtc: affaires.get(f.id)!,
        lignes: f.lignes.map(versLigneFacture),
        paiements: [...f.paiements]
          .sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime())
          .map((p) => ({
            id: p.id,
            date: p.date,
            montant: p.montant.toNumber(),
            mode: p.mode,
            reference: p.reference,
          })),
      };
    });

    // Net facturé = somme des TTC hors brouillons (une facture annulée garde son
    // TTC positif, son avoir le porte en négatif → les deux s'annulent).
    const nonBrouillon = rendues.filter((f) => f.statut !== 'brouillon');
    const totalFactureTtc = nonBrouillon.reduce((s, f) => s + f.montantTtc, 0);
    const totalEncaisse = rendues.reduce((s, f) => s + f.montantPaye, 0);

    // Suggestion de montant pour une facture de vente (cadrage §9) : le prix de
    // vente de la dernière version de pré-bilan figée. L'admin ajuste librement.
    // Refacturation des études : ligne ACTIVE = sur une facture ni annulée ni
    // avoir ; « à régler » dès que cette facture est soldée.
    const parId = new Map(rendues.map((f) => [f.id, f]));
    const etudes = blocsEtude.map(({ carteId, libelleCarte, bloc }) => {
      const b = bloc ?? { id: null, libelle: libelleCarte, interlocuteur: '', factureMontant: null, bureauRegleLe: null, lignesFacture: [] as { factureId: string; montantHt: Prisma.Decimal }[] };
      const active = b.lignesFacture
        .map((l) => ({ l, f: parId.get(l.factureId) }))
        .find(({ f }) => f && f.statut !== 'annulee' && !f.estAvoir);
      const statutReglement = statutReglementBureau({
        bureauRegleLe: b.bureauRegleLe,
        factureActive: active?.f?.statutEffectif ?? null,
      });
      const montantBureauHt = b.factureMontant?.toNumber() ?? null;
      return {
        blocId: b.id,
        carteId,
        libelle: b.libelle,
        bureau: b.interlocuteur,
        montantBureauHt,
        montantRefactureHt: active
          ? active.l.montantHt.toNumber()
          : montantBureauHt != null
            ? montantRefacture(montantBureauHt)
            : null,
        statutReglement,
        facture: active?.f ? { id: active.f.id, reference: active.f.reference } : null,
        bureauRegleLe: b.bureauRegleLe,
        refacturable:
          statutReglement === 'non_refacture' && !!b.interlocuteur.trim() && (montantBureauHt ?? 0) > 0,
      };
    });

    // Facturation mensuelle (SU / EX de l'offre acceptée) — état et rappel.
    const mensualites = lignesMensuelles.map((l) => {
      const m = this.etatMensualite(l, projet.phase);
      return {
        ligneDevisId: l.id,
        libelle: m.nom,
        prixMensuelHt: Math.round(l.prixUnitaire.toNumber()),
        tauxTva: l.tauxTva.toNumber(),
        moisPrevus: m.moisPrevus,
        moisFactures: m.moisFactures,
        aFacturerCeMois: m.aFacturerCeMois,
      };
    });

    return {
      projetId,
      projet,
      factures: rendues,
      mensualites,
      etudes,
      resume: {
        totalFactureTtc,
        totalEncaisse,
        totalDu: totalFactureTtc - totalEncaisse,
        nbEnRetard: rendues.filter((f) => f.statutEffectif === 'en_retard').length,
      },
    };
  }
}

// Ligne de facture exposée (frontend/lib/types.ts::LigneFacture).
function versLigneFacture(l: {
  id: string;
  designation: string;
  montantHt: Prisma.Decimal;
  montantBase: Prisma.Decimal | null;
  blocEtudeId: string | null;
}) {
  return {
    id: l.id,
    designation: l.designation,
    montantHt: l.montantHt.toNumber(),
    montantBase: l.montantBase?.toNumber() ?? null,
    blocEtudeId: l.blocEtudeId,
  };
}

// Échéance posée à l'émission : celle déjà fixée, sinon pour une facture
// directe d'un lead, payable à 15 jours (maquette Finances).
function echeanceALEmission(f: { echeanceLe: string | null; dossierCrmId: string | null }): string | null {
  if (f.echeanceLe) return f.echeanceLe;
  return f.dossierCrmId ? echeanceDirecte(new Date().toISOString().slice(0, 10)) : null;
}

// Numéros attribués à l'émission : séquence de la société, et code + rang du
// dossier pour la référence affichée (null sans dossier).
type Sequence = { numero: number; codeDossier: string | null; rangDossier: number | null };

function prochaineReference(code: string | null, rangs: Map<string, number>): string | null {
  return code ? `${code}-${(rangs.get(code) ?? 0) + 1}` : null;
}
