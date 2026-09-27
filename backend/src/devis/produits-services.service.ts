import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreerProduitServiceDto, PatchProduitServiceDto } from './produits-services.dto';

function formater(p: {
  id: string;
  code: string | null;
  famille: string | null;
  unite: string | null;
  modeCalcul: string;
  prixModifiable: boolean;
  coAssocie: string | null;
  designation: string;
  prixUnitaire: { toNumber(): number } | null;
  tauxTva: { toNumber(): number };
  description: string;
}) {
  return {
    id: p.id,
    code: p.code,
    famille: p.famille,
    unite: p.unite,
    modeCalcul: p.modeCalcul,
    prixModifiable: p.prixModifiable,
    coAssocie: p.coAssocie,
    designation: p.designation,
    prixUnitaire: p.prixUnitaire?.toNumber() ?? null,
    tauxTva: p.tauxTva.toNumber(),
    description: p.description,
  };
}

// Catalogue produits/services — admin-only, comme les cellules et les
// checklists (cf. cadrage « Devis »). Soft-delete (cohérent avec Fichiers/
// Images) : un item retiré du catalogue ne casse pas les lignes de devis qui
// le référencent déjà (LigneDevis.produitServiceId reste lisible via l'id,
// seul le picker de sélection le masque).
@Injectable()
export class ProduitsServicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(societeId: string) {
    const produits = await this.prisma.produitService.findMany({
      where: { societeId, supprime: false },
      // Catalogue réel d'abord, par famille puis code ; ajouts manuels ensuite.
      orderBy: [{ famille: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }, { designation: 'asc' }],
    });
    return produits.map(formater);
  }

  async creer(societeId: string, dto: CreerProduitServiceDto) {
    const p = await this.prisma.produitService.create({
      data: {
        societeId,
        designation: dto.designation.trim(),
        prixUnitaire: dto.prixUnitaire ?? null,
        tauxTva: dto.tauxTva ?? 18,
        description: dto.description?.trim() ?? '',
      },
    });
    return formater(p);
  }

  async patch(societeId: string, id: string, dto: PatchProduitServiceDto) {
    await this.charger(societeId, id);
    const p = await this.prisma.produitService.update({
      where: { id },
      data: {
        designation: dto.designation?.trim(),
        prixUnitaire: dto.prixUnitaire,
        tauxTva: dto.tauxTva,
        description: dto.description?.trim(),
      },
    });
    return formater(p);
  }

  async supprimer(societeId: string, id: string) {
    await this.charger(societeId, id);
    await this.prisma.produitService.update({
      where: { id },
      data: { supprime: true, supprimeLe: new Date() },
    });
  }

  private async charger(societeId: string, id: string) {
    const p = await this.prisma.produitService.findFirst({ where: { id, societeId } });
    if (!p) throw new NotFoundException('Produit / service introuvable');
    return p;
  }
}
