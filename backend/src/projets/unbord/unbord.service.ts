import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GroupeUnbord, LigneUnbord, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { GROUPES_UNBORD } from '../domaine/config';
import { agitEnDirection, chargerProjet } from '../projet-acces';
import { estAutoriseAAssigner, verifierResponsableOuAdmin } from '../dispatch-acces';
import {
  JoindreFichiersLigneUnbordDto,
  JoindreImagesLigneUnbordDto,
  PatchBlocUnbordDto,
  PatchLigneUnbordDto,
} from './dto';

type FichierLigne = { id: string; nom: string; url: string; estImage: boolean; ajouteLe: Date };
type LigneAvecOrdre = LigneUnbord & { gabarit: { ordre: number } };
type BlocAvecResponsable = {
  groupe: GroupeUnbord;
  responsableId: string | null;
  responsable: { id: string; prenom: string; nom: string } | null;
};

function typeMimeDepuisDataUri(url: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(url);
  return m ? m[1] : '';
}

function libelleGroupe(groupe: GroupeUnbord): string {
  return GROUPES_UNBORD.find((g) => g.groupe === groupe)?.libelle ?? groupe;
}

// Items : gabarit de la société (LigneUnbordGabarit, societe_admin ou CIO —
// cf. UnbordGabaritService). Accès aux items : PAR BLOC (2026-09-25, décision
// boss) — bloc libre = toute l'équipe du projet peut cocher/uploader (règle
// de septembre, préservée en repli, cf. verifierAccesBloc) ; bloc assigné =
// seul le responsable désigné (+ societe_admin). Qui peut ASSIGNER (et se
// désigner soi-même sur un bloc libre) : admin OU dispatcher de la cellule OU
// auto-désignation — même règle exacte que Permis, pas de nouveau modèle
// (estAutoriseAAssigner, dispatch-acces.ts).
@Injectable()
export class UnbordService {
  private readonly log = new Logger('Unbord');
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async get(societeId: string, projetId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const [lignes, blocs] = await Promise.all([
      this.assurerLignes(societeId, projetId),
      this.assurerBlocs(projetId),
    ]);
    return this.formater(projetId, lignes, blocs, await this.fichiersParLigne(projetId));
  }

  // PATCH …/unbord/blocs/:groupe — admin OU dispatcher de la cellule du
  // responsable ciblé OU auto-désignation sur un bloc libre.
  async patchBloc(
    societeId: string,
    projetId: string,
    groupe: GroupeUnbord,
    dto: PatchBlocUnbordDto,
    utilisateurId: string,
    role: string,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const blocs = await this.assurerBlocs(projetId);
    const avant = blocs.find((b) => b.groupe === groupe);
    if (!avant) throw new NotFoundException('Bloc introuvable');

    if (!agitEnDirection(role)) {
      const cibleId = dto.responsableId !== undefined ? dto.responsableId : avant.responsableId;
      const autorise = await estAutoriseAAssigner(
        this.prisma,
        societeId,
        utilisateurId,
        cibleId ?? null,
        avant.responsableId,
      );
      if (!autorise) {
        throw new ForbiddenException(
          'Tu ne peux te désigner que sur un bloc libre, ou assigner les membres de ta cellule.',
        );
      }
    }

    const data: Prisma.BlocUnbordUpdateInput = {};
    if (dto.responsableId !== undefined) {
      data.responsable = dto.responsableId
        ? { connect: { id: dto.responsableId } }
        : { disconnect: true };
    }

    await this.prisma.blocUnbord.update({
      where: { projetId_groupe: { projetId, groupe } },
      data,
    });

    const nouveauResponsable =
      dto.responsableId != null && dto.responsableId !== avant.responsableId;
    if (nouveauResponsable) {
      const collab = await this.prisma.collaborateur.findUnique({
        where: { id: dto.responsableId as string },
        select: { utilisateurId: true },
      });
      const destinataireId = collab?.utilisateurId;
      if (destinataireId) {
        await this.notifier(() =>
          this.notifications.pousser({
            societeId,
            projet: {
              id: projet.id,
              code: projet.code,
              celluleIds: projet.cellules.map((c) => c.celluleId),
            },
            type: 'checklist_assignee',
            titre: `${libelleGroupe(groupe)} · responsable désigné sur ${projet.programme}`,
            parId: utilisateurId,
            destinataireIds: [destinataireId],
          }),
        );
      }
    }

    return this.get(societeId, projetId);
  }

  async patchLigne(
    societeId: string,
    projetId: string,
    ligneId: string,
    dto: PatchLigneUnbordDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const ligne = await this.trouverLigne(societeId, projetId, ligneId);
    await this.verifierAccesBloc(societeId, projetId, ligne.groupe, utilisateurId, role);

    const data: Prisma.LigneUnbordUpdateInput = {};
    if (dto.fait !== undefined) data.fait = dto.fait;
    if (dto.nonRequise !== undefined) {
      data.nonRequise = dto.nonRequise;
      // Mutuellement exclusif avec « fait » — même règle que Permis.
      if (dto.nonRequise) data.fait = false;
    }

    await this.prisma.ligneUnbord.update({ where: { id: ligneId }, data });
    return this.get(societeId, projetId);
  }

  async joindreImages(
    societeId: string,
    projetId: string,
    ligneId: string,
    dto: JoindreImagesLigneUnbordDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const ligne = await this.trouverLigne(societeId, projetId, ligneId);
    await this.verifierAccesBloc(societeId, projetId, ligne.groupe, utilisateurId, role);

    await this.prisma.$transaction([
      this.prisma.imageProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          typePhoto: 'existant' as const,
          ligneUnbordId: ligne.id,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFait(ligne.id),
    ]);
    return this.get(societeId, projetId);
  }

  async joindreFichiers(
    societeId: string,
    projetId: string,
    ligneId: string,
    dto: JoindreFichiersLigneUnbordDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const ligne = await this.trouverLigne(societeId, projetId, ligneId);
    await this.verifierAccesBloc(societeId, projetId, ligne.groupe, utilisateurId, role);

    await this.prisma.$transaction([
      this.prisma.fichierProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          taille: f.taille ?? 0,
          ligneUnbordId: ligne.id,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFait(ligne.id),
    ]);
    return this.get(societeId, projetId);
  }

  // -- Internes ------------------------------------------------------------

  // Coche automatiquement l'item dès qu'un fichier lui est rattaché — même
  // règle que Permis (cf. mémoire, sept. 2026).
  private marquerFait(ligneId: string) {
    return this.prisma.ligneUnbord.update({
      where: { id: ligneId },
      data: { fait: true, nonRequise: false },
    });
  }

  // Bloc libre = toute l'équipe agit (déjà vérifiée membre du projet par
  // AccesProjetGuard, pas revérifiée ici) — la préservation explicite de la
  // règle de septembre. Bloc assigné = seul le responsable (+ admin),
  // délégué à verifierResponsableOuAdmin (dispatch-acces.ts, partagé avec
  // Permis/Exécution — CE fallback « libre → tout le monde » est spécifique
  // à Unbord, jamais mis dans la fonction partagée).
  private async verifierAccesBloc(
    societeId: string,
    projetId: string,
    groupe: GroupeUnbord,
    utilisateurId: string,
    role: string,
  ): Promise<void> {
    const bloc = await this.prisma.blocUnbord.findUnique({
      where: { projetId_groupe: { projetId, groupe } },
    });
    if (!bloc?.responsableId) return;
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc.responsableId);
  }

  private async trouverLigne(
    societeId: string,
    projetId: string,
    ligneId: string,
  ): Promise<LigneUnbord> {
    const lignes = await this.assurerLignes(societeId, projetId);
    const ligne = lignes.find((l) => l.id === ligneId);
    if (!ligne) throw new NotFoundException('Item introuvable');
    return ligne;
  }

  // Amorce les lignes du projet depuis le gabarit ACTIF de la société — un
  // item retiré du gabarit après coup n'est simplement plus proposé aux
  // nouveaux projets, aucune ligne à effacer ici (cf. LigneUnbordGabarit).
  // Idempotent grâce à @@unique([projetId, gabaritId]), même motif que
  // PermisService.assurerBlocs.
  private async assurerLignes(societeId: string, projetId: string): Promise<LigneAvecOrdre[]> {
    const gabarit = await this.prisma.ligneUnbordGabarit.findMany({
      where: { societeId, supprimeLe: null },
    });
    if (gabarit.length > 0) {
      await this.prisma.ligneUnbord.createMany({
        data: gabarit.map((g) => ({
          projetId,
          gabaritId: g.id,
          groupe: g.groupe,
          libelle: g.libelle,
        })),
        skipDuplicates: true,
      });
    }
    return this.prisma.ligneUnbord.findMany({
      where: { projetId },
      include: { gabarit: { select: { ordre: true } } },
      orderBy: { gabarit: { ordre: 'asc' } },
    });
  }

  // Amorce les 2 blocs fixes (documents / releve_existant) une fois —
  // idempotent, même motif que PermisService.assurerBlocs.
  private async assurerBlocs(projetId: string): Promise<BlocAvecResponsable[]> {
    await this.prisma.blocUnbord.createMany({
      data: GROUPES_UNBORD.map((g) => ({ projetId, groupe: g.groupe })),
      skipDuplicates: true,
    });
    return this.prisma.blocUnbord.findMany({
      where: { projetId },
      include: { responsable: { select: { id: true, prenom: true, nom: true } } },
    });
  }

  private async fichiersParLigne(projetId: string): Promise<Map<string, FichierLigne[]>> {
    const [images, fichiers] = await Promise.all([
      this.prisma.imageProjet.findMany({
        where: { projetId, ligneUnbordId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneUnbordId: true, ajouteLe: true },
      }),
      this.prisma.fichierProjet.findMany({
        where: { projetId, ligneUnbordId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneUnbordId: true, ajouteLe: true },
      }),
    ]);
    const parLigne = new Map<string, FichierLigne[]>();
    for (const img of images) {
      const arr = parLigne.get(img.ligneUnbordId!) ?? [];
      arr.push({ id: img.id, nom: img.nom, url: img.cle, estImage: true, ajouteLe: img.ajouteLe });
      parLigne.set(img.ligneUnbordId!, arr);
    }
    for (const f of fichiers) {
      const arr = parLigne.get(f.ligneUnbordId!) ?? [];
      arr.push({ id: f.id, nom: f.nom, url: f.cle, estImage: false, ajouteLe: f.ajouteLe });
      parLigne.set(f.ligneUnbordId!, arr);
    }
    for (const liste of parLigne.values()) {
      liste.sort((a, b) => +a.ajouteLe - +b.ajouteLe);
    }
    return parLigne;
  }

  private formater(
    projetId: string,
    lignes: LigneAvecOrdre[],
    blocs: BlocAvecResponsable[],
    fichiersParLigne: Map<string, FichierLigne[]>,
  ) {
    return {
      projetId,
      groupes: GROUPES_UNBORD.map((g) => {
        const bloc = blocs.find((b) => b.groupe === g.groupe);
        return {
          groupe: g.groupe,
          libelle: g.libelle,
          description: g.description,
          responsable: bloc?.responsable ?? null,
          items: lignes
            .filter((l) => l.groupe === g.groupe)
            .map((ligne) => {
              const fichiers = fichiersParLigne.get(ligne.id) ?? [];
              const statut: 'fait' | 'en_attente' | 'non_necessaire' = ligne.nonRequise
                ? 'non_necessaire'
                : ligne.fait
                  ? 'fait'
                  : 'en_attente';
              return {
                id: ligne.id,
                libelle: ligne.libelle,
                statut,
                fichiers,
              };
            }),
        };
      }),
    };
  }

  private async notifier(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.log.warn(`Notification non poussée : ${e instanceof Error ? e.message : e}`);
    }
  }
}
