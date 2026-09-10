import { ConflictException, Injectable } from '@nestjs/common';
import { Etudes, LigneEtude, Prisma, TypeEtude } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ETUDES_PAR_DEFAUT } from '../domaine/config';
import { etudesCompletes } from '../domaine/gardes';
import { chargerProjet } from '../projet-acces';
import { PatchLigneEtudeDto } from './dto';

@Injectable()
export class EtudesService {
  constructor(private prisma: PrismaService) {}

  async get(societeId: string, projetId: string) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    return this.formater(await this.coquille(projetId));
  }

  async patchLigne(
    societeId: string,
    projetId: string,
    type: TypeEtude,
    dto: PatchLigneEtudeDto,
  ) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.coquille(projetId);

    const data: Prisma.LigneEtudeUpdateInput = {};
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.bet !== undefined) data.bet = dto.bet;
    if (dto.dateRemisePrevue !== undefined) data.dateRemisePrevue = dto.dateRemisePrevue;
    if (dto.dateRemiseReelle !== undefined) data.dateRemiseReelle = dto.dateRemiseReelle;
    if (dto.note !== undefined) data.note = dto.note;

    await this.prisma.ligneEtude.update({
      where: { etudesId_type: { etudesId: projetId, type } },
      data,
    });
    return this.formater(await this.charger(projetId));
  }

  async constituerDce(societeId: string, projetId: string) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    const etudes = await this.coquille(projetId);

    // GARDE MIROIR de frontend/lib/types.ts::etudesCompletes : toutes les lignes
    // « validée » ou « non requise » — « remise » ne suffit pas.
    if (!etudesCompletes(etudes.lignes)) {
      throw new ConflictException(
        'Chaque étude doit être validée ou marquée non requise.',
      );
    }
    await this.prisma.etudes.update({
      where: { projetId },
      data: { dceConstitue: true, dceLe: new Date() },
    });
    return this.formater(await this.charger(projetId));
  }

  async annulerDce(societeId: string, projetId: string) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.coquille(projetId);
    await this.prisma.etudes.update({
      where: { projetId },
      data: { dceConstitue: false, dceLe: null },
    });
    return this.formater(await this.charger(projetId));
  }

  // -- Internes ------------------------------------------------------------

  // En-tête 1:1 + les 6 lignes par défaut (créées une fois, idempotent).
  private async coquille(projetId: string) {
    await this.prisma.etudes.upsert({
      where: { projetId },
      update: {},
      create: { projetId },
    });
    await this.prisma.ligneEtude.createMany({
      data: ETUDES_PAR_DEFAUT.map((type) => ({ etudesId: projetId, type })),
      skipDuplicates: true,
    });
    return this.charger(projetId);
  }

  private charger(projetId: string) {
    return this.prisma.etudes.findUniqueOrThrow({
      where: { projetId },
      include: { lignes: true },
    });
  }

  private formater(e: Etudes & { lignes: LigneEtude[] }) {
    const rang = (t: TypeEtude) => ETUDES_PAR_DEFAUT.indexOf(t);
    return {
      projetId: e.projetId,
      lignes: [...e.lignes]
        .sort((a, b) => rang(a.type) - rang(b.type))
        .map((l) => ({
          type: l.type,
          statut: l.statut,
          bet: l.bet,
          dateRemisePrevue: l.dateRemisePrevue,
          dateRemiseReelle: l.dateRemiseReelle,
          note: l.note,
        })),
      dceConstitue: e.dceConstitue,
      dceLe: e.dceLe,
    };
  }
}
