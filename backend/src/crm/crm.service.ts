import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatutCrm } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PHASES_PAR_CATEGORIE } from '../projets/domaine/config';
import { versDossierCrm, versProjetExecution } from '../commun/format-contrat';
import { CreerDossierDto } from './dto';
import { codeAvecVariante, genererCodeDossier } from './nomenclature';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  async findAll(societeId: string, q?: string) {
    const terme = q?.trim().toLowerCase();
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: { societeId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    const filtres = !terme
      ? dossiers
      : dossiers.filter((d) =>
          [d.code, d.localisation, d.programme, d.client.nom, d.type]
            .join(' ')
            .toLowerCase()
            .includes(terme),
        );
    return filtres.map(versDossierCrm);
  }

  async creer(societeId: string, dto: CreerDossierDto) {
    if (!dto.client.id && !dto.client.nouveau) {
      throw new BadRequestException('client.id ou client.nouveau est requis');
    }

    return this.prisma.$transaction(async (tx) => {
      let clientId = dto.client.id;
      let clientInfo = dto.client.nouveau
        ? { nom: dto.client.nouveau.nom, type: dto.client.nouveau.type as string }
        : null;
      if (!clientId && dto.client.nouveau) {
        const c = await tx.client.create({
          data: { societeId, ...dto.client.nouveau },
        });
        clientId = c.id;
      }
      if (!clientInfo && clientId) {
        const c = await tx.client.findFirst({
          where: { id: clientId, societeId },
          select: { nom: true, type: true },
        });
        if (!c) throw new NotFoundException('Client introuvable');
        clientInfo = { nom: c.nom, type: c.type };
      }

      const dossier = await tx.dossierCrm.create({
        data: {
          societeId,
          code: await this.resoudreCode(tx, societeId, dto, clientInfo!),
          nature: dto.nature,
          categorie: dto.categorie,
          localisation: dto.localisation,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          type: dto.type,
          nbPlanches: dto.nbPlanches,
          surfaceTerrain: dto.surfaceTerrain,
          standing: dto.standing,
          gamme: dto.gamme,
          programme: dto.programme,
          statut: dto.statut,
          clientId: clientId!,
        },
        include: { client: true },
      });
      return versDossierCrm(dossier);
    });
  }

  // La transaction pivot : passer un dossier à « valide » crée le projet
  // d'exécution (idempotent — un seul par dossier) et sa coquille avant-projet.
  async changerStatut(societeId: string, id: string, statut: StatutCrm) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      include: { projet: { select: { id: true } } },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');

    if (statut !== 'valide' || dossier.projet) {
      const maj = await this.prisma.dossierCrm.update({
        where: { id },
        data: { statut },
        include: { client: true },
      });
      return { projet: versDossierCrm(maj), projetCree: null };
    }

    const { dossierMaj, projet } = await this.prisma.$transaction(async (tx) => {
      const d = await tx.dossierCrm.update({
        where: { id },
        data: { statut },
        include: { client: true },
      });
      const p = await tx.projet.create({
        data: {
          societeId,
          dossierCrmId: d.id,
          code: d.code,
          nature: d.nature,
          categorie: d.categorie,
          programme: d.programme,
          localisation: d.localisation,
          latitude: d.latitude,
          longitude: d.longitude,
          type: d.type,
          clientId: d.clientId,
          phase: PHASES_PAR_CATEGORIE[d.categorie][0],
          avantProjet: { create: {} },
        },
        include: { client: true },
      });
      return { dossierMaj: d, projet: p };
    });

    return {
      projet: versDossierCrm(dossierMaj),
      projetCree: versProjetExecution(projet),
    };
  }

  // Code du dossier : celui saisi par l'admin s'il y en a un (strictement
  // unique, 409 sinon), sinon généré selon la nomenclature Grey Concrete
  // (XX_YY.ZZ) avec suffixe V2/V3… en cas de doublon.
  private async resoudreCode(
    tx: Prisma.TransactionClient,
    societeId: string,
    dto: CreerDossierDto,
    client: { nom: string; type: string },
  ): Promise<string> {
    const pris = new Set(
      (
        await tx.dossierCrm.findMany({
          where: { societeId },
          select: { code: true },
        })
      ).map((d) => d.code),
    );

    const saisi = dto.code?.trim();
    if (saisi) {
      if (pris.has(saisi)) {
        throw new ConflictException(`Le code « ${saisi} » est déjà utilisé.`);
      }
      return saisi;
    }

    const base = genererCodeDossier(client, dto.localisation);
    return codeAvecVariante(base, pris);
  }
}
