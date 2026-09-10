import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { chargerProjet } from '../projet-acces';
import {
  AjouterImagesDto,
  PatchImageDto,
  PatchImagesEnLotDto,
  ReordonnerImagesDto,
} from './dto';

const AVEC_AUTEURS = {
  ajoutePar: { select: { prenom: true, nom: true } },
  supprimePar: { select: { prenom: true, nom: true } },
} as const;

type ImageAvecAuteurs = Prisma.ImageProjetGetPayload<{ include: typeof AVEC_AUTEURS }>;

function typeMimeDepuisDataUri(url: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(url);
  return m ? m[1] : '';
}

function nomComplet(u: { prenom: string; nom: string } | null): string {
  return u ? `${u.prenom} ${u.nom}`.trim() : '';
}

@Injectable()
export class ImagesService {
  constructor(private prisma: PrismaService) {}

  async liste(societeId: string, projetId: string, supprimees = false) {
    await chargerProjet(this.prisma, societeId, projetId);
    const images = await this.prisma.imageProjet.findMany({
      where: { projetId, supprimee: supprimees },
      include: AVEC_AUTEURS,
      orderBy: supprimees ? { supprimeLe: 'desc' } : { ajouteLe: 'desc' },
    });
    return images.map(formater);
  }

  async ajouter(
    societeId: string,
    projetId: string,
    dto: AjouterImagesDto,
    ajouteParId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const crees: ImageAvecAuteurs[] = [];
    for (const f of dto.fichiers) {
      crees.push(
        await this.prisma.imageProjet.create({
          data: {
            projetId,
            cle: f.url,
            nom: f.nom,
            typeMime: typeMimeDepuisDataUri(f.url),
            ajouteParId,
          },
          include: AVEC_AUTEURS,
        }),
      );
    }
    return crees.map(formater);
  }

  async majUne(
    societeId: string,
    projetId: string,
    imageId: string,
    patch: PatchImageDto,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const image = await this.prisma.imageProjet.findFirst({
      where: { id: imageId, projetId },
    });
    if (!image) throw new NotFoundException('Image introuvable');

    const data: Prisma.ImageProjetUpdateInput = {};
    if (patch.legende !== undefined) data.legende = patch.legende;
    if (patch.phase !== undefined) data.phase = patch.phase;
    if (patch.usage !== undefined) {
      // Bascule vers le portfolio : placée en fin de portfolio (comme le mock).
      if (patch.usage === 'portfolio' && image.usage !== 'portfolio') {
        const max = await this.prisma.imageProjet.aggregate({
          where: { projetId, usage: 'portfolio', supprimee: false },
          _max: { ordre: true },
        });
        data.ordre = (max._max.ordre ?? -1) + 1;
      }
      data.usage = patch.usage;
    }

    const maj = await this.prisma.imageProjet.update({
      where: { id: imageId },
      data,
      include: AVEC_AUTEURS,
    });
    return formater(maj);
  }

  async majEnLot(societeId: string, projetId: string, dto: PatchImagesEnLotDto) {
    for (const id of dto.ids) {
      await this.majUne(societeId, projetId, id, dto.patch);
    }
    return this.liste(societeId, projetId, false);
  }

  async reordonner(societeId: string, projetId: string, dto: ReordonnerImagesDto) {
    await chargerProjet(this.prisma, societeId, projetId);
    await this.prisma.$transaction(
      dto.ids.map((id, rang) =>
        this.prisma.imageProjet.updateMany({
          where: { id, projetId },
          data: { ordre: rang },
        }),
      ),
    );
    return this.liste(societeId, projetId, false);
  }

  async supprimer(
    societeId: string,
    projetId: string,
    ids: string[],
    supprimeParId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    // Soft-delete : l'image reste (Corbeille admin), avec qui / quand.
    await this.prisma.imageProjet.updateMany({
      where: { id: { in: ids }, projetId, supprimee: false },
      data: { supprimee: true, supprimeLe: new Date(), supprimeParId },
    });
  }

  async restaurer(societeId: string, projetId: string, imageId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    await this.prisma.imageProjet.updateMany({
      where: { id: imageId, projetId, supprimee: true },
      data: { supprimee: false, supprimeLe: null, supprimeParId: null },
    });
  }
}

function formater(img: ImageAvecAuteurs) {
  return {
    id: img.id,
    projetId: img.projetId,
    // `cle` porte le data URI en transition ; deviendra une URL signée S3.
    url: img.cle,
    nom: img.nom,
    usage: img.usage,
    phase: img.phase,
    legende: img.legende,
    ordre: img.ordre,
    ajoutePar: nomComplet(img.ajoutePar),
    ajouteLe: img.ajouteLe,
    supprimee: img.supprimee,
    supprimeLe: img.supprimeLe,
    supprimePar: img.supprimee ? nomComplet(img.supprimePar) : null,
  };
}
