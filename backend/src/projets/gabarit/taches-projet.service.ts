import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { motifNonAssignable, tachesAssignees } from './assignation';

type Acteur = { userId: string };
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
