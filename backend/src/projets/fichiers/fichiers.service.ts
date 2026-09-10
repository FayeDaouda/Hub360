import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { chargerProjet } from '../projet-acces';
import { AjouterFichiersDto, PatchFichierDto } from './dto';

const AVEC_AUTEURS = {
  ajoutePar: { select: { prenom: true, nom: true } },
  supprimePar: { select: { prenom: true, nom: true } },
} as const;

type FichierAvecAuteurs = Prisma.FichierProjetGetPayload<{
  include: typeof AVEC_AUTEURS;
}>;

function typeMimeDepuisDataUri(url: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(url);
  return m ? m[1] : '';
}

function nomComplet(u: { prenom: string; nom: string } | null): string {
  return u ? `${u.prenom} ${u.nom}`.trim() : '';
}

@Injectable()
export class FichiersService {
  constructor(private prisma: PrismaService) {}

  async liste(societeId: string, projetId: string, supprimes = false) {
    await chargerProjet(this.prisma, societeId, projetId);
    const fichiers = await this.prisma.fichierProjet.findMany({
      where: { projetId, supprimee: supprimes },
      include: AVEC_AUTEURS,
      orderBy: supprimes ? { supprimeLe: 'desc' } : { ajouteLe: 'desc' },
    });
    return fichiers.map(formater);
  }

  async ajouter(
    societeId: string,
    projetId: string,
    dto: AjouterFichiersDto,
    ajouteParId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const crees: FichierAvecAuteurs[] = [];
    for (const f of dto.fichiers) {
      crees.push(
        await this.prisma.fichierProjet.create({
          data: {
            projetId,
            cle: f.url,
            nom: f.nom,
            typeMime: typeMimeDepuisDataUri(f.url),
            taille: f.taille ?? 0,
            type: f.type ?? 'autre',
            phase: f.phase ?? null,
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
    fichierId: string,
    patch: PatchFichierDto,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const fichier = await this.prisma.fichierProjet.findFirst({
      where: { id: fichierId, projetId },
    });
    if (!fichier) throw new NotFoundException('Fichier introuvable');

    const data: Prisma.FichierProjetUpdateInput = {};
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.phase !== undefined) data.phase = patch.phase;
    if (patch.note !== undefined) data.note = patch.note;

    const maj = await this.prisma.fichierProjet.update({
      where: { id: fichierId },
      data,
      include: AVEC_AUTEURS,
    });
    return formater(maj);
  }

  async supprimer(
    societeId: string,
    projetId: string,
    ids: string[],
    supprimeParId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    await this.prisma.fichierProjet.updateMany({
      where: { id: { in: ids }, projetId, supprimee: false },
      data: { supprimee: true, supprimeLe: new Date(), supprimeParId },
    });
  }

  async restaurer(societeId: string, projetId: string, fichierId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    await this.prisma.fichierProjet.updateMany({
      where: { id: fichierId, projetId, supprimee: true },
      data: { supprimee: false, supprimeLe: null, supprimeParId: null },
    });
  }
}

function formater(f: FichierAvecAuteurs) {
  return {
    id: f.id,
    projetId: f.projetId,
    // `cle` porte le data URI en transition ; deviendra une URL signée S3.
    url: f.cle,
    nom: f.nom,
    typeMime: f.typeMime,
    taille: f.taille,
    type: f.type,
    phase: f.phase,
    note: f.note,
    ajoutePar: nomComplet(f.ajoutePar),
    ajouteLe: f.ajouteLe,
    supprimee: f.supprimee,
    supprimeLe: f.supprimeLe,
    supprimePar: f.supprimee ? nomComplet(f.supprimePar) : null,
  };
}
