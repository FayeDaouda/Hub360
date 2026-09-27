import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { chargerProjet } from '../projet-acces';
import {
  GROUPES_CHECKLIST_AVP,
  GROUPES_CHECKLIST_EXECUTION,
  GROUPES_CHECKLIST_PERMIS,
  GROUPES_UNBORD,
} from '../domaine/config';
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

// Provenance d'une image jointe depuis le bouton d'une checklist plutôt que
// de cette page (Permis/Exécution/Foncier/Avant-projet) — sept. 2026. Texte
// pré-rendu côté serveur (même convention que les notifications/jalons) :
// « <module> → <groupe> », `route` sert au front à construire le lien
// retour (`/…/projets/:id/<route>`).
type Provenance = { route: string; libelle: string };

const MODULE_PROVENANCE = {
  permis: { route: 'permis', libelle: 'Autorisation' },
  execution: { route: 'execution', libelle: 'Dossier Exécutions' },
  foncier: { route: 'foncier', libelle: 'Foncier' },
  avantProjet: { route: 'avant-projet', libelle: 'Avant-projet' },
} as const;

async function resolverProvenances(
  prisma: PrismaService,
  images: ImageAvecAuteurs[],
): Promise<Map<string, Provenance>> {
  const map = new Map<string, Provenance>();

  const parPermis = images.filter((i) => i.ligneChecklistPermisId);
  const parExecution = images.filter((i) => i.ligneChecklistExecutionId);
  const parUnbord = images.filter((i) => i.ligneUnbordId);
  const parAvp = images.filter((i) => i.ligneChecklistAvpId);

  const [lignesPermis, lignesExecution, lignesUnbord, lignesAvp] = await Promise.all([
    parPermis.length
      ? prisma.ligneChecklistPermis.findMany({
          where: { id: { in: parPermis.map((i) => i.ligneChecklistPermisId!) } },
          select: { id: true, groupe: true },
        })
      : [],
    parExecution.length
      ? prisma.ligneChecklistExecution.findMany({
          where: { id: { in: parExecution.map((i) => i.ligneChecklistExecutionId!) } },
          select: { id: true, groupe: true },
        })
      : [],
    parUnbord.length
      ? prisma.ligneUnbord.findMany({
          where: { id: { in: parUnbord.map((i) => i.ligneUnbordId!) } },
          select: { id: true, groupe: true },
        })
      : [],
    parAvp.length
      ? prisma.ligneChecklistAvp.findMany({
          where: { id: { in: parAvp.map((i) => i.ligneChecklistAvpId!) } },
          select: { id: true, groupe: true },
        })
      : [],
  ]);

  const groupePermis = new Map(lignesPermis.map((l) => [l.id, l.groupe]));
  const groupeExecution = new Map(lignesExecution.map((l) => [l.id, l.groupe]));
  const groupeUnbord = new Map(lignesUnbord.map((l) => [l.id, l.groupe]));
  const groupeAvp = new Map(lignesAvp.map((l) => [l.id, l.groupe]));

  const libellePermis = new Map(GROUPES_CHECKLIST_PERMIS.map((g) => [g.groupe, g.libelle]));
  const libelleExecution = new Map(GROUPES_CHECKLIST_EXECUTION.map((g) => [g.groupe, g.libelle]));
  const libelleUnbord = new Map(GROUPES_UNBORD.map((g) => [g.groupe, g.libelle]));
  const libelleAvp = new Map(GROUPES_CHECKLIST_AVP.map((g) => [g.groupe, g.libelle]));

  for (const i of parPermis) {
    const groupe = groupePermis.get(i.ligneChecklistPermisId!);
    if (!groupe) continue;
    const m = MODULE_PROVENANCE.permis;
    map.set(i.id, { route: m.route, libelle: `${m.libelle} → ${libellePermis.get(groupe) ?? groupe}` });
  }
  for (const i of parExecution) {
    const groupe = groupeExecution.get(i.ligneChecklistExecutionId!);
    if (!groupe) continue;
    const m = MODULE_PROVENANCE.execution;
    map.set(i.id, { route: m.route, libelle: `${m.libelle} → ${libelleExecution.get(groupe) ?? groupe}` });
  }
  for (const i of parUnbord) {
    const groupe = groupeUnbord.get(i.ligneUnbordId!);
    if (!groupe) continue;
    const m = MODULE_PROVENANCE.foncier;
    map.set(i.id, { route: m.route, libelle: `${m.libelle} → ${libelleUnbord.get(groupe) ?? groupe}` });
  }
  for (const i of parAvp) {
    const groupe = groupeAvp.get(i.ligneChecklistAvpId!);
    if (!groupe) continue;
    const m = MODULE_PROVENANCE.avantProjet;
    map.set(i.id, { route: m.route, libelle: `${m.libelle} → ${libelleAvp.get(groupe) ?? groupe}` });
  }

  return map;
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
    const provenances = await resolverProvenances(this.prisma, images);
    return images.map((img) => formater(img, provenances.get(img.id) ?? null));
  }

  // Uploadées depuis cette page directement — jamais de provenance (les 4 FK
  // ne sont posées que par les boutons « joindre » des autres checklists).
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
            typePhoto: dto.typePhoto,
            ajouteParId,
          },
          include: AVEC_AUTEURS,
        }),
      );
    }
    return crees.map((img) => formater(img, null));
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
    if (patch.typePhoto !== undefined) data.typePhoto = patch.typePhoto;
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
    const provenances = await resolverProvenances(this.prisma, [maj]);
    return formater(maj, provenances.get(maj.id) ?? null);
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

function formater(img: ImageAvecAuteurs, provenance: Provenance | null) {
  return {
    id: img.id,
    projetId: img.projetId,
    // `cle` porte le data URI en transition ; deviendra une URL signée S3.
    url: img.cle,
    nom: img.nom,
    usage: img.usage,
    phase: img.phase,
    typePhoto: img.typePhoto,
    // Résolu par resolverProvenances() ci-dessus — null si l'image vient de
    // cette page directement (pas d'un bouton « joindre » d'une checklist).
    provenance,
    legende: img.legende,
    ordre: img.ordre,
    ajoutePar: nomComplet(img.ajoutePar),
    ajouteLe: img.ajouteLe,
    supprimee: img.supprimee,
    supprimeLe: img.supprimeLe,
    supprimePar: img.supprimee ? nomComplet(img.supprimePar) : null,
  };
}
