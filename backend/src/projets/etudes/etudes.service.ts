import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BlocEtude, Etudes, ItemEtude, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { etudesCompletes } from '../domaine/gardes';
import { chargerProjet } from '../projet-acces';
import { ROLE_CIO } from '../../commun/societe-admin-ou-cio.guard';
import {
  JoindreFichiersItemEtudeDto,
  JoindreImagesItemEtudeDto,
  PatchBlocEtudeDto,
  PatchItemEtudeDto,
} from './dto';

type FichierLigne = { id: string; nom: string; url: string; estImage: boolean; ajouteLe: Date };
type BlocAvecGabaritEtItems = BlocEtude & {
  blocEtudeGabarit: { ordre: number } | null;
  items: (ItemEtude & { ligneEtudeGabarit: { ordre: number } | null })[];
};

function typeMimeDepuisDataUri(url: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(url);
  return m ? m[1] : '';
}

function estAdminOuCio(role: string): boolean {
  return role === 'societe_admin' || role === ROLE_CIO;
}

// Études techniques restructurées en blocs configurables (sept. 2026) —
// chaque bloc (géotechnique, structure…) vient du gabarit société
// (EtudesGabaritService) et porte son propre interlocuteur/facture/statut,
// avec ses propres livrables en checklist à fichiers (ItemEtude, même modèle
// que Foncier : statut dérivé + case à cocher manuelle). Pas d'assignation
// par bloc ici (contrairement à Permis/Foncier/Exécution) — toute l'équipe
// du projet agit, comme avant la restructuration.
@Injectable()
export class EtudesService {
  constructor(private prisma: PrismaService) {}

  async get(societeId: string, projetId: string, role: string) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    const etudes = await this.assurerBlocs(societeId, projetId);
    const fichiersParItem = await this.fichiersParItem(projetId);
    return this.formater(etudes, fichiersParItem, estAdminOuCio(role));
  }

  // PATCH …/etudes/blocs/:id — champs métier ouverts à toute l'équipe du
  // projet ; factureMontant/factureFichier* appliqués UNIQUEMENT si
  // l'appelant est admin/CIO (silencieusement ignorés sinon — le front
  // collab n'envoie jamais ces clés de toute façon, ceci est la défense en
  // profondeur côté serveur).
  async patchBloc(
    societeId: string,
    projetId: string,
    blocId: string,
    dto: PatchBlocEtudeDto,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.trouverBloc(projetId, blocId);

    const data: Prisma.BlocEtudeUpdateInput = {};
    if (dto.interlocuteur !== undefined) data.interlocuteur = dto.interlocuteur;
    if (dto.contactInterlocuteur !== undefined) data.contactInterlocuteur = dto.contactInterlocuteur;
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.dateRemisePrevue !== undefined) data.dateRemisePrevue = dto.dateRemisePrevue;
    if (dto.dateRemiseReelle !== undefined) data.dateRemiseReelle = dto.dateRemiseReelle;
    if (dto.note !== undefined) data.note = dto.note;
    if (estAdminOuCio(role)) {
      if (dto.factureMontant !== undefined) {
        data.factureMontant = dto.factureMontant === null ? null : dto.factureMontant;
      }
      if (dto.factureFichierNom !== undefined) data.factureFichierNom = dto.factureFichierNom;
      if (dto.factureFichierCle !== undefined) data.factureFichierCle = dto.factureFichierCle;
    }

    await this.prisma.blocEtude.update({ where: { id: blocId }, data });
    return this.get(societeId, projetId, role);
  }

  async patchItem(
    societeId: string,
    projetId: string,
    itemId: string,
    dto: PatchItemEtudeDto,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.trouverItem(projetId, itemId);

    const data: Prisma.ItemEtudeUpdateInput = {};
    if (dto.fait !== undefined) data.fait = dto.fait;
    if (dto.nonRequise !== undefined) {
      data.nonRequise = dto.nonRequise;
      // Mutuellement exclusif avec « fait » — même règle que Permis/Unbord.
      if (dto.nonRequise) data.fait = false;
    }

    await this.prisma.itemEtude.update({ where: { id: itemId }, data });
    return this.get(societeId, projetId, role);
  }

  async joindreImages(
    societeId: string,
    projetId: string,
    itemId: string,
    dto: JoindreImagesItemEtudeDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.trouverItem(projetId, itemId);

    await this.prisma.$transaction([
      this.prisma.imageProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          typePhoto: 'autre' as const,
          itemEtudeId: itemId,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFait(itemId),
    ]);
    return this.get(societeId, projetId, role);
  }

  async joindreFichiers(
    societeId: string,
    projetId: string,
    itemId: string,
    dto: JoindreFichiersItemEtudeDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.trouverItem(projetId, itemId);

    await this.prisma.$transaction([
      this.prisma.fichierProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          taille: f.taille ?? 0,
          itemEtudeId: itemId,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFait(itemId),
    ]);
    return this.get(societeId, projetId, role);
  }

  async constituerDce(societeId: string, projetId: string, role: string) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    const etudes = await this.assurerBlocs(societeId, projetId);

    // GARDE MIROIR de frontend/lib/types.ts::etudesCompletes : tous les blocs
    // « validée » ou « non requise » — « remise » ne suffit pas.
    if (!etudesCompletes(etudes.blocs)) {
      throw new ConflictException(
        'Chaque étude doit être validée ou marquée non requise.',
      );
    }
    await this.prisma.etudes.update({
      where: { projetId },
      data: { dceConstitue: true, dceLe: new Date() },
    });
    return this.get(societeId, projetId, role);
  }

  async annulerDce(societeId: string, projetId: string, role: string) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.prisma.etudes.update({
      where: { projetId },
      data: { dceConstitue: false, dceLe: null },
    });
    return this.get(societeId, projetId, role);
  }

  // -- Internes ------------------------------------------------------------

  // Coche automatiquement l'item dès qu'un fichier lui est rattaché — même
  // règle que Permis/Unbord/Avant-projet (cf. mémoire, sept. 2026).
  private marquerFait(itemId: string) {
    return this.prisma.itemEtude.update({
      where: { id: itemId },
      data: { fait: true, nonRequise: false },
    });
  }

  private async trouverBloc(projetId: string, blocId: string) {
    const bloc = await this.prisma.blocEtude.findFirst({
      where: { id: blocId, projetId, supprimee: false },
    });
    if (!bloc) throw new NotFoundException('Bloc d’études introuvable');
    return bloc;
  }

  private async trouverItem(projetId: string, itemId: string) {
    const item = await this.prisma.itemEtude.findFirst({
      where: { id: itemId, supprimee: false, blocEtude: { projetId, supprimee: false } },
    });
    if (!item) throw new NotFoundException('Item d’études introuvable');
    return item;
  }

  // En-tête 1:1 (coquille) + resynchronise les blocs/items depuis le gabarit
  // ACTIF de la société à chaque appel — un bloc/item ajouté au gabarit après
  // coup apparaît aussi sur les projets déjà en cours (même motif que
  // UnbordService.assurerLignes) ; libelle figé une fois créé, jamais réécrit.
  private async assurerBlocs(societeId: string, projetId: string) {
    await this.prisma.etudes.upsert({
      where: { projetId },
      update: {},
      create: { projetId },
    });

    const gabaritBlocs = await this.prisma.blocEtudeGabarit.findMany({
      where: { societeId, supprimeLe: null },
      include: { items: { where: { supprimeLe: null } } },
    });
    if (gabaritBlocs.length > 0) {
      await this.prisma.blocEtude.createMany({
        data: gabaritBlocs.map((b) => ({
          projetId,
          blocEtudeGabaritId: b.id,
          libelle: b.libelle,
        })),
        skipDuplicates: true,
      });
    }

    const blocsExistants = await this.prisma.blocEtude.findMany({
      where: { projetId, supprimee: false },
    });
    for (const bloc of blocsExistants) {
      const gabaritBloc = gabaritBlocs.find((g) => g.id === bloc.blocEtudeGabaritId);
      if (gabaritBloc && gabaritBloc.items.length > 0) {
        await this.prisma.itemEtude.createMany({
          data: gabaritBloc.items.map((it) => ({
            blocEtudeId: bloc.id,
            ligneEtudeGabaritId: it.id,
            libelle: it.libelle,
          })),
          skipDuplicates: true,
        });
      }
    }

    return this.charger(projetId);
  }

  private charger(projetId: string): Promise<Etudes & { blocs: BlocAvecGabaritEtItems[] }> {
    return this.prisma.etudes.findUniqueOrThrow({
      where: { projetId },
      include: {
        blocs: {
          where: { supprimee: false },
          include: {
            blocEtudeGabarit: { select: { ordre: true } },
            items: {
              where: { supprimee: false },
              include: { ligneEtudeGabarit: { select: { ordre: true } } },
            },
          },
        },
      },
    });
  }

  private async fichiersParItem(projetId: string): Promise<Map<string, FichierLigne[]>> {
    const [images, fichiers] = await Promise.all([
      this.prisma.imageProjet.findMany({
        where: { projetId, itemEtudeId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, itemEtudeId: true, ajouteLe: true },
      }),
      this.prisma.fichierProjet.findMany({
        where: { projetId, itemEtudeId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, itemEtudeId: true, ajouteLe: true },
      }),
    ]);
    const parItem = new Map<string, FichierLigne[]>();
    const ajouter = (itemId: string, item: FichierLigne) => {
      const liste = parItem.get(itemId) ?? [];
      liste.push(item);
      parItem.set(itemId, liste);
    };
    for (const img of images) {
      ajouter(img.itemEtudeId as string, {
        id: img.id,
        nom: img.nom,
        url: img.cle,
        estImage: true,
        ajouteLe: img.ajouteLe,
      });
    }
    for (const f of fichiers) {
      ajouter(f.itemEtudeId as string, {
        id: f.id,
        nom: f.nom,
        url: f.cle,
        estImage: false,
        ajouteLe: f.ajouteLe,
      });
    }
    for (const liste of parItem.values()) {
      liste.sort((a, b) => +a.ajouteLe - +b.ajouteLe);
    }
    return parItem;
  }

  private formater(
    e: Etudes & { blocs: BlocAvecGabaritEtItems[] },
    fichiersParItem: Map<string, FichierLigne[]>,
    estAdmin: boolean,
  ) {
    const rangBloc = (b: BlocAvecGabaritEtItems) => b.blocEtudeGabarit?.ordre ?? 0;
    const rangItem = (it: ItemEtude & { ligneEtudeGabarit: { ordre: number } | null }) =>
      it.ligneEtudeGabarit?.ordre ?? 0;

    return {
      projetId: e.projetId,
      blocs: [...e.blocs]
        .sort((a, b) => rangBloc(a) - rangBloc(b))
        .map((b) => ({
          id: b.id,
          libelle: b.libelle,
          interlocuteur: b.interlocuteur,
          contactInterlocuteur: b.contactInterlocuteur,
          statut: b.statut,
          dateRemisePrevue: b.dateRemisePrevue,
          dateRemiseReelle: b.dateRemiseReelle,
          note: b.note,
          // Redacted pour tout appelant non admin/CIO — jamais exposé à un
          // collaborateur, même en lecture seule (cf. cadrage).
          facture: estAdmin
            ? {
                montant: b.factureMontant ? b.factureMontant.toNumber() : null,
                fichierNom: b.factureFichierNom,
                fichierCle: b.factureFichierCle,
              }
            : null,
          items: [...b.items]
            .sort((a, b2) => rangItem(a) - rangItem(b2))
            .map((it) => {
              const fichiers = fichiersParItem.get(it.id) ?? [];
              const statut: 'fait' | 'en_attente' | 'non_necessaire' = it.nonRequise
                ? 'non_necessaire'
                : it.fait
                  ? 'fait'
                  : 'en_attente';
              return { id: it.id, libelle: it.libelle, statut, fichiers };
            }),
        })),
      dceConstitue: e.dceConstitue,
      dceLe: e.dceLe,
    };
  }
}
