import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Temps } from '../../reglages/gabarit';
import { motifNonAssignable, tachesAssignees } from './assignation';
import { collaborateurDuCompte, peutDecider, ROLE_DPLG } from './validation';

type Acteur = { userId: string };
type ActeurRole = Acteur & { role: string };

// Libellé d'un élément ajouté en TS, selon l'unité de la carte (gabarit).
export const UNITE_TS: Record<'pièce' | 'vue', string> = { pièce: 'Pièce intérieure', vue: 'Vue de détail' };
const nom = (p: { prenom: string; nom: string } | null) => (p ? `${p.prenom} ${p.nom}` : null);

// Écritures sur les tâches d'un projet ouvert (maquette « Projets ») :
// assignation à la tâche ou à la carte, tracée dans l'historique de chaque
// tâche touchée.
@Injectable()
export class TachesProjetService {
  constructor(private prisma: PrismaService) {}

  // Collaborateurs proposés dans « Assigner » (« Moussa Diop · GC-ARC-02 »).
  async assignables(societeId: string) {
    const collaborateurs = await this.prisma.collaborateur.findMany({
      where: { societeId },
      select: { id: true, prenom: true, nom: true, cellule: { select: { nom: true } } },
      orderBy: [{ cellule: { nom: 'asc' } }, { prenom: 'asc' }, { nom: 'asc' }],
    });
    return collaborateurs.map((c) => ({ id: c.id, nom: nom(c)!, cellule: c.cellule?.nom ?? null }));
  }

  async assigner(
    societeId: string,
    acteur: Acteur,
    projetId: string,
    tacheId: string,
    collaborateurId: string | null,
    aLaCarte: boolean,
  ) {
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        statut: true,
        carte: { select: { desactivation: true, taches: { select: { id: true, statut: true } } } },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    const collaborateur = collaborateurId
      ? await this.prisma.collaborateur.findFirst({ where: { id: collaborateurId, societeId }, select: { prenom: true, nom: true } })
      : null;
    if (collaborateurId && !collaborateur) throw new NotFoundException('Collaborateur introuvable');

    const desactivee = !!tache.carte.desactivation;
    const choisie = { id: tache.id, statut: tache.statut, carteDesactivee: desactivee };
    const motif = motifNonAssignable(choisie);
    if (motif && !aLaCarte) throw new ConflictException(motif);
    const ids = tachesAssignees(
      choisie,
      tache.carte.taches.map((t) => ({ ...t, carteDesactivee: desactivee })),
      aLaCarte,
    );
    if (!ids.length) throw new ConflictException('Aucune tâche ouverte à assigner dans cette carte.');

    const detail = collaborateur ? `Assignée à ${nom(collaborateur)}` : 'Assignation retirée';
    // Garde en base : une tâche validée entre-temps n'est pas réassignée.
    const modifiees = await this.prisma.$transaction(async (tx) => {
      const cibles = await tx.tacheProjet.findMany({
        where: { id: { in: ids }, statut: { notIn: ['validee', 'non_necessaire'] } },
        select: { id: true },
      });
      const cibleIds = cibles.map((c) => c.id);
      await tx.tacheProjet.updateMany({ where: { id: { in: cibleIds } }, data: { assigneId: collaborateurId } });
      await tx.evenementTacheProjet.createMany({
        data: cibleIds.map((id) => ({ tacheId: id, type: 'assignation' as const, parId: acteur.userId, detail })),
      });
      return cibleIds.length;
    });
    return { modifiees };
  }

  // Valider une remise, ou la renvoyer en reprise (motif) — chef de team,
  // Architecte DPLG (tâches du chef, suppléance) ; jamais sa propre tâche.
  async decider(societeId: string, acteur: ActeurRole, projetId: string, tacheId: string, decision: 'valider' | 'renvoyer', motif?: string) {
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        statut: true,
        version: true,
        assigneId: true,
        projet: { select: { cellules: { take: 1, select: { cellule: { select: { dispatcherId: true } } } } } },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    if (tache.statut !== 'a_valider') throw new ConflictException('Aucune remise en attente sur cette tâche.');
    const collaborateurId = await collaborateurDuCompte(this.prisma, societeId, acteur.userId);
    const chefId = tache.projet.cellules[0]?.cellule.dispatcherId ?? null;
    if (!peutDecider({ role: acteur.role, collaborateurId }, tache, chefId)) {
      throw new ForbiddenException(
        collaborateurId && collaborateurId === tache.assigneId
          ? 'On ne valide jamais sa propre tâche.'
          : 'La remise se valide par le chef de team ou l’Architecte DPLG.',
      );
    }
    const vNN = `v${String(tache.version).padStart(2, '0')}`;
    await this.prisma.$transaction(async (tx) => {
      // Garde en base : la remise n'a pas été tranchée entre-temps.
      const { count } = await tx.tacheProjet.updateMany({
        where: { id: tache.id, statut: 'a_valider' },
        data:
          decision === 'valider'
            ? { statut: 'validee', valideeLe: new Date(), valideeParId: acteur.userId }
            : { statut: 'reprise' },
      });
      if (!count) throw new ConflictException('La remise a déjà été tranchée.');
      await tx.evenementTacheProjet.create({
        data:
          decision === 'valider'
            ? { tacheId: tache.id, type: 'validation', parId: acteur.userId, detail: `Remise ${vNN} validée` }
            : { tacheId: tache.id, type: 'reprise', parId: acteur.userId, detail: `Remise ${vNN} renvoyée en reprise : ${motif!.trim()}` },
      });
    });
    return { statut: decision === 'valider' ? 'validee' : 'reprise' };
  }

  // « Ajouter en TS » (Architecte DPLG) : un élément demandé par le client
  // devient une tâche de la carte « par unité » (pièce, vue), avec le temps
  // de la carte, ajouté au budget atelier du projet.
  async ajouterTs(societeId: string, acteur: ActeurRole, projetId: string, carteId: string, element: string) {
    if (acteur.role !== ROLE_DPLG && acteur.role !== 'societe_admin') {
      throw new ForbiddenException('Ajouter en TS est réservé à l’Architecte DPLG.');
    }
    const carte = await this.prisma.carteProjet.findFirst({
      where: { id: carteId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: { id: true, debutJ: true, finJ: true, debutLe: true, finLe: true, temps: true, desactivation: true, taches: { select: { ordre: true } } },
    });
    if (!carte) throw new NotFoundException('Carte introuvable');
    const temps = carte.temps as Temps | null;
    if (carte.desactivation || temps?.type !== 'par_unite') throw new ConflictException('Cette carte ne reçoit pas d’élément en TS.');

    return this.prisma.$transaction(async (tx) => {
      const rang = (await tx.tacheProjet.count({ where: { projetId, cle: { startsWith: 'ts_' } } })) + 1;
      const tache = await tx.tacheProjet.create({
        data: {
          projetId,
          carteId: carte.id,
          cle: `ts_${rang}`,
          libelle: `TS${rang} · ${UNITE_TS[temps.unite]} · ${element.trim()}`,
          ordre: Math.max(-1, ...carte.taches.map((t) => t.ordre)) + 1,
          debutJ: carte.debutJ,
          finJ: carte.finJ,
          debutLe: carte.debutLe,
          finLe: carte.finLe,
          temps: { type: 'heures', heures: temps.heures } satisfies Temps as Prisma.InputJsonValue,
          heures: temps.heures,
        },
        select: { id: true, libelle: true },
      });
      await tx.projet.update({ where: { id: projetId }, data: { budgetHeures: { increment: temps.heures } } });
      return tache;
    });
  }

  async historique(societeId: string, projetId: string, tacheId: string) {
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId } },
      select: {
        evenements: {
          orderBy: { creeLe: 'asc' },
          select: { id: true, type: true, detail: true, creeLe: true, par: { select: { prenom: true, nom: true } } },
        },
      },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    return tache.evenements.map((e) => ({ id: e.id, type: e.type, detail: e.detail, par: nom(e.par), le: e.creeLe }));
  }
}
