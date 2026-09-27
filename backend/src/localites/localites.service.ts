import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Localite, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreerLocaliteDto, MajLocaliteDto } from './dto';

// Libellés des onglets du fichier source — repris dans les messages d'erreur
// pour que la direction retrouve tout de suite la ligne en conflit.
const ZONES: Record<Localite['zone'], string> = {
  dakar: 'Dakar',
  senegal: 'Villes Sénégal',
  pays: 'Pays',
};

type LocaliteAvecUsage = Localite & { _count: { dossiers: number } };

// Référentiel des localités — partagé par toutes les sociétés du HUB, donc
// aucun filtre societeId ici. Écriture réservée à la direction
// (SocieteAdminOuCioGuard sur le contrôleur).
@Injectable()
export class LocalitesService {
  constructor(private prisma: PrismaService) {}

  async lister() {
    const localites = await this.prisma.localite.findMany({
      orderBy: [{ zone: 'asc' }, { ordre: 'asc' }],
      include: { _count: { select: { dossiers: true } } },
    });
    return localites.map(versLocalite);
  }

  async creer(dto: CreerLocaliteDto) {
    await this.verifierCodeLibre(dto.code);
    const { _max } = await this.prisma.localite.aggregate({
      where: { zone: dto.zone },
      _max: { ordre: true },
    });
    const creee = await this.ecrire(() =>
      this.prisma.localite.create({
        data: {
          code: dto.code,
          nom: dto.nom.trim(),
          zone: dto.zone,
          region: dto.region.trim(),
          arrondissement: vide(dto.arrondissement),
          commune: vide(dto.commune),
          ordre: (_max.ordre ?? -1) + 1,
        },
        include: { _count: { select: { dossiers: true } } },
      }),
    );
    return versLocalite(creee);
  }

  async modifier(id: string, dto: MajLocaliteDto) {
    const actuelle = await this.prisma.localite.findUnique({
      where: { id },
      include: { _count: { select: { dossiers: true } } },
    });
    if (!actuelle) throw new NotFoundException('Localité introuvable');

    const nouveauCode = dto.code !== undefined && dto.code !== actuelle.code;
    if (nouveauCode) {
      // Règle 4 du référentiel : un code qui a servi à générer au moins un
      // code dossier est figé — on corrige le nom d'affichage, jamais le code.
      if (actuelle._count.dossiers > 0) {
        throw new ConflictException(
          `Le code ${actuelle.code} est déjà utilisé par ${actuelle._count.dossiers} dossier(s) : il ne peut plus changer. Seul le nom est modifiable.`,
        );
      }
      await this.verifierCodeLibre(dto.code!);
    }

    const maj = await this.ecrire(() =>
      this.prisma.localite.update({
        where: { id },
        data: {
          code: nouveauCode ? dto.code : undefined,
          nom: dto.nom?.trim(),
          region: dto.region?.trim(),
          arrondissement: dto.arrondissement === undefined ? undefined : vide(dto.arrondissement),
          commune: dto.commune === undefined ? undefined : vide(dto.commune),
        },
        include: { _count: { select: { dossiers: true } } },
      }),
    );
    return versLocalite(maj);
  }

  // Message explicite (quelle localité détient déjà le code) plutôt qu'un
  // 409 générique — jamais d'auto-résolution : la direction choisit.
  private async verifierCodeLibre(code: string) {
    const existante = await this.prisma.localite.findUnique({ where: { code } });
    if (existante) {
      throw new ConflictException(
        `Le code ${code} est déjà pris par « ${existante.nom} » (${ZONES[existante.zone]}).`,
      );
    }
  }

  // Filet pour la course entre verifierCodeLibre et l'écriture : l'index
  // unique tranche, on renvoie le même 409 lisible.
  private async ecrire<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ce code vient d’être pris par une autre localité.');
      }
      throw e;
    }
  }
}

function vide(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

// Forme exposée (frontend/lib/types.ts::Localite). `codeVerrouille` = le code
// a déjà servi à au moins un dossier.
export function versLocalite(l: LocaliteAvecUsage) {
  return {
    id: l.id,
    code: l.code,
    nom: l.nom,
    zone: l.zone,
    region: l.region,
    arrondissement: l.arrondissement,
    commune: l.commune,
    codeVerrouille: l._count.dossiers > 0,
  };
}
