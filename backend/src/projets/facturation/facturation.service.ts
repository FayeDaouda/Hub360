import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { chargerProjet } from '../projet-acces';
import {
  JALONS_FACTURE,
  refFacture,
  TAUX_TVA_DEFAUT,
  typeFactureDepuisNature,
} from '../domaine/config';
import {
  joursRetardFacture,
  statutFactureEffectif,
  ventilationTva,
} from '../domaine/gardes';
import {
  AjouterPaiementDto,
  CreerEcheancierDto,
  CreerFactureDto,
  PatchFactureDto,
} from './dto';

const jourCourant = () => new Date().toISOString().slice(0, 10);

// Facturation client — module admin-only (le contrôleur ne marque aucun
// endpoint @EcritureCollaborateur, donc AccesProjetGuard rejette toute écriture
// d'un collaborateur ; la lecture suit la règle projet habituelle, comme le
// pré-bilan). Cf. cadrage « Facturation client ».
@Injectable()
export class FacturationService {
  constructor(private prisma: PrismaService) {}

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

    const data: Prisma.FactureUpdateInput = {};
    if (dto.montantHt !== undefined) data.montantHt = dto.montantHt;
    if (dto.tauxTva !== undefined) data.tauxTva = dto.tauxTva;
    if (dto.echeanceLe !== undefined) data.echeanceLe = dto.echeanceLe;
    if (dto.libelle !== undefined) data.libelle = dto.libelle.trim();

    await this.prisma.facture.update({ where: { id: facture.id }, data });
    return this.formater(projetId);
  }

  async emettre(societeId: string, projetId: string, factureId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.brouillon(projetId, factureId);
    if (facture.montantHt.lte(0)) {
      throw new UnprocessableEntityException(
        "Renseignez un montant HT avant d'émettre la facture.",
      );
    }
    // Transition conditionnée sur `statut` dans la transaction : deux émissions
    // concurrentes du même brouillon ne peuvent pas consommer deux numéros.
    await this.avecSequence(societeId, async (tx, numero) => {
      const r = await tx.facture.updateMany({
        where: { id: facture.id, statut: 'brouillon' },
        data: { numero, statut: 'emise', emiseLe: new Date() },
      });
      if (r.count === 0) throw new ConflictException('Facture déjà émise.');
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
  async creerAvoir(societeId: string, projetId: string, factureId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
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

    await this.avecSequence(societeId, async (tx, numero) => {
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
          numero,
          statut: 'emise',
          estAvoir: true,
          emiseLe: new Date(),
          type: facture.type,
          jalon: facture.jalon,
          montantHt: facture.montantHt.negated(),
          tauxTva: facture.tauxTva,
          factureOrigineId: facture.id,
          libelle: `Avoir sur ${refFacture(facture.numero, facture.emiseLe, false)}`,
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
      },
    });
    return this.formater(projetId);
  }

  async supprimerPaiement(
    societeId: string,
    projetId: string,
    factureId: string,
    paiementId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
      select: { id: true },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    await this.prisma.paiement.deleteMany({
      where: { id: paiementId, factureId: facture.id },
    });
    return this.formater(projetId);
  }

  // -- Internes --------------------------------------------------------------

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
  private async avecSequence(
    societeId: string,
    action: (tx: Prisma.TransactionClient, numero: number) => Promise<unknown>,
  ) {
    for (let essai = 0; ; essai++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const max = await tx.facture.aggregate({
            where: { societeId, numero: { not: null } },
            _max: { numero: true },
          });
          await action(tx, (max._max.numero ?? 0) + 1);
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
    const [factures, versions] = await Promise.all([
      this.prisma.facture.findMany({
        where: { projetId },
        include: { paiements: true },
      }),
      this.prisma.versionPreBilan.findMany({ where: { projetId } }),
    ]);
    const aujourdhui = jourCourant();

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
        reference: refFacture(f.numero, f.emiseLe, f.estAvoir),
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
    const figees = versions
      .filter((v) => v.figeeLe && v.prixVenteEstime != null)
      .sort((a, b) => a.figeeLe!.getTime() - b.figeeLe!.getTime());
    const suggestionVenteHt =
      figees.length > 0
        ? figees[figees.length - 1].prixVenteEstime!.toNumber()
        : null;

    return {
      projetId,
      factures: rendues,
      resume: {
        totalFactureTtc,
        totalEncaisse,
        totalDu: totalFactureTtc - totalEncaisse,
        nbEnRetard: rendues.filter((f) => f.statutEffectif === 'en_retard').length,
        suggestionVenteHt,
      },
    };
  }
}
