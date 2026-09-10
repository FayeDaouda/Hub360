import { Injectable, NotFoundException } from '@nestjs/common';
import { Categorie, Prisma, TypeLot } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LOTS_PAR_CATEGORIE } from '../domaine/config';
import { chargerProjet } from '../projet-acces';
import {
  AjouterCrDto,
  AjouterOffreDto,
  AjouterReserveDto,
  AjouterSituationDto,
  AttribuerLotDto,
  PatchLotDto,
  PatchReceptionDto,
  PatchReserveDto,
} from './dto';

const jourCourant = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ExecutionService {
  constructor(private prisma: PrismaService) {}

  async get(societeId: string, projetId: string) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);
    return this.formater(projetId, categorie);
  }

  async patchLot(
    societeId: string,
    projetId: string,
    type: TypeLot,
    dto: PatchLotDto,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);

    const data: Prisma.LotUpdateInput = {};
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.avancement !== undefined) data.avancement = dto.avancement;
    if (dto.dateDebut !== undefined) data.dateDebut = dto.dateDebut;
    if (dto.dateFinPrevue !== undefined) data.dateFinPrevue = dto.dateFinPrevue;
    if (dto.entrepriseRetenue !== undefined) data.entrepriseRetenue = dto.entrepriseRetenue;
    if (dto.montantMarche !== undefined) data.montantMarche = dto.montantMarche;
    if (dto.entreprisesConsultees !== undefined) {
      data.entreprisesConsultees = dto.entreprisesConsultees;
    }

    await this.lot(projetId, type).then((l) =>
      this.prisma.lot.update({ where: { id: l.id }, data }),
    );
    return this.formater(projetId, categorie);
  }

  async ajouterOffre(
    societeId: string,
    projetId: string,
    type: TypeLot,
    dto: AjouterOffreDto,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);
    const lot = await this.lot(projetId, type);

    await this.prisma.$transaction(async (tx) => {
      await tx.offreEntreprise.create({
        data: {
          lotId: lot.id,
          entreprise: dto.entreprise,
          montant: dto.montant,
          delaiJours: dto.delaiJours ?? null,
        },
      });
      const consultees = lot.entreprisesConsultees.includes(dto.entreprise)
        ? lot.entreprisesConsultees
        : [...lot.entreprisesConsultees, dto.entreprise];
      await tx.lot.update({
        where: { id: lot.id },
        data: {
          entreprisesConsultees: consultees,
          statut: lot.statut === 'a_consulter' ? 'consulte' : lot.statut,
        },
      });
    });
    return this.formater(projetId, categorie);
  }

  async supprimerOffre(
    societeId: string,
    projetId: string,
    type: TypeLot,
    offreId: string,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    const lot = await this.lot(projetId, type);
    await this.prisma.offreEntreprise.deleteMany({ where: { id: offreId, lotId: lot.id } });
    return this.formater(projetId, categorie);
  }

  async attribuer(
    societeId: string,
    projetId: string,
    type: TypeLot,
    dto: AttribuerLotDto,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);
    const lot = await this.lot(projetId, type);
    await this.prisma.lot.update({
      where: { id: lot.id },
      data: {
        entrepriseRetenue: dto.entreprise,
        montantMarche: dto.montant,
        dateAttribution: jourCourant(),
        statut: 'attribue',
      },
    });
    return this.formater(projetId, categorie);
  }

  async ajouterSituation(
    societeId: string,
    projetId: string,
    type: TypeLot,
    dto: AjouterSituationDto,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);
    const lot = await this.lot(projetId, type);
    const numero = (await this.prisma.situationPaiement.count({ where: { lotId: lot.id } })) + 1;

    await this.prisma.$transaction([
      this.prisma.situationPaiement.create({
        data: {
          lotId: lot.id,
          numero,
          date: dto.date,
          avancementCumule: dto.avancementCumule,
          montantSituation: dto.montantSituation,
          retenueGarantie: dto.retenueGarantie,
          montantVerse: dto.montantVerse,
        },
      }),
      ...(lot.statut === 'attribue'
        ? [this.prisma.lot.update({ where: { id: lot.id }, data: { statut: 'en_cours' } })]
        : []),
    ]);
    return this.formater(projetId, categorie);
  }

  async supprimerSituation(
    societeId: string,
    projetId: string,
    type: TypeLot,
    situationId: string,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    const lot = await this.lot(projetId, type);
    await this.prisma.$transaction(async (tx) => {
      await tx.situationPaiement.deleteMany({ where: { id: situationId, lotId: lot.id } });
      const restantes = await tx.situationPaiement.findMany({
        where: { lotId: lot.id },
        orderBy: { numero: 'asc' },
      });
      // Renumérotation contiguë (1..n) après suppression.
      for (let i = 0; i < restantes.length; i++) {
        if (restantes[i].numero !== i + 1) {
          await tx.situationPaiement.update({
            where: { id: restantes[i].id },
            data: { numero: i + 1 },
          });
        }
      }
    });
    return this.formater(projetId, categorie);
  }

  async ajouterCr(
    societeId: string,
    projetId: string,
    dto: AjouterCrDto,
    auteurId: string,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);
    await this.prisma.entreeJournal.create({
      data: { projetId, contexte: 'chantier', texte: dto.texte.trim(), auteurId },
    });
    return this.formater(projetId, categorie);
  }

  async patchReception(societeId: string, projetId: string, dto: PatchReceptionDto) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);
    const data: Prisma.ExecutionUpdateInput = {};
    if (dto.receptionProvisoire !== undefined) data.receptionProvisoire = dto.receptionProvisoire;
    if (dto.leveeReserves !== undefined) data.leveeReserves = dto.leveeReserves;
    if (dto.receptionDefinitive !== undefined) data.receptionDefinitive = dto.receptionDefinitive;
    if (dto.validationClient !== undefined) data.validationClient = dto.validationClient;
    if (dto.dateValidationClient !== undefined) {
      data.dateValidationClient = dto.dateValidationClient;
    }
    await this.prisma.execution.update({ where: { projetId }, data });
    return this.formater(projetId, categorie);
  }

  async ajouterReserve(societeId: string, projetId: string, dto: AjouterReserveDto) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    await this.coquille(projetId, categorie);
    await this.prisma.reserve.create({
      data: { executionId: projetId, description: dto.description.trim() },
    });
    return this.formater(projetId, categorie);
  }

  async patchReserve(
    societeId: string,
    projetId: string,
    reserveId: string,
    dto: PatchReserveDto,
  ) {
    const { categorie } = await chargerProjet(this.prisma, societeId, projetId);
    const reserve = await this.prisma.reserve.findFirst({
      where: { id: reserveId, executionId: projetId },
    });
    if (!reserve) throw new NotFoundException('Réserve introuvable');

    const data: Prisma.ReserveUpdateInput = {};
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.dateLevee !== undefined) data.dateLevee = dto.dateLevee;
    await this.prisma.reserve.update({ where: { id: reserveId }, data });
    return this.formater(projetId, categorie);
  }

  // -- Internes ----------------------------------------------------------

  // En-tête 1:1 + les lots du catalogue de la catégorie (idempotent).
  private async coquille(projetId: string, categorie: Categorie) {
    await this.prisma.execution.upsert({
      where: { projetId },
      update: {},
      create: { projetId },
    });
    await this.prisma.lot.createMany({
      data: LOTS_PAR_CATEGORIE[categorie].map((type) => ({ executionId: projetId, type })),
      skipDuplicates: true,
    });
  }

  private async lot(projetId: string, type: TypeLot) {
    const lot = await this.prisma.lot.findUnique({
      where: { executionId_type: { executionId: projetId, type } },
    });
    if (!lot) throw new NotFoundException('Lot introuvable');
    return lot;
  }

  private async formater(projetId: string, categorie: Categorie) {
    const [execution, journal] = await Promise.all([
      this.prisma.execution.findUniqueOrThrow({
        where: { projetId },
        include: {
          lots: { include: { offres: true, situations: true } },
          reserves: true,
        },
      }),
      this.prisma.entreeJournal.findMany({
        where: { projetId, contexte: 'chantier' },
        orderBy: { date: 'desc' },
        include: { auteur: { select: { prenom: true, nom: true } } },
      }),
    ]);

    const rang = (t: TypeLot) => LOTS_PAR_CATEGORIE[categorie].indexOf(t);

    return {
      projetId,
      lots: [...execution.lots]
        .sort((a, b) => rang(a.type) - rang(b.type))
        .map((l) => ({
          type: l.type,
          statut: l.statut,
          entreprisesConsultees: l.entreprisesConsultees,
          offres: [...l.offres]
            .sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime())
            .map((o) => ({
              id: o.id,
              entreprise: o.entreprise,
              montant: o.montant,
              delaiJours: o.delaiJours,
            })),
          entrepriseRetenue: l.entrepriseRetenue,
          montantMarche: l.montantMarche,
          dateAttribution: l.dateAttribution,
          avancement: l.avancement,
          dateDebut: l.dateDebut,
          dateFinPrevue: l.dateFinPrevue,
          situations: [...l.situations]
            .sort((a, b) => a.numero - b.numero)
            .map((s) => ({
              id: s.id,
              numero: s.numero,
              date: s.date,
              avancementCumule: s.avancementCumule,
              montantSituation: s.montantSituation,
              retenueGarantie: s.retenueGarantie,
              montantVerse: s.montantVerse,
            })),
        })),
      crChantier: journal.map((e) => ({
        id: e.id,
        date: e.date,
        texte: e.texte,
        auteur: e.auteur ? `${e.auteur.prenom} ${e.auteur.nom}`.trim() : '',
      })),
      reception: {
        receptionProvisoire: execution.receptionProvisoire,
        reserves: [...execution.reserves]
          .sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime())
          .map((r) => ({
            id: r.id,
            description: r.description,
            statut: r.statut,
            dateLevee: r.dateLevee,
          })),
        leveeReserves: execution.leveeReserves,
        receptionDefinitive: execution.receptionDefinitive,
        validationClient: execution.validationClient,
        dateValidationClient: execution.dateValidationClient,
      },
    };
  }
}
