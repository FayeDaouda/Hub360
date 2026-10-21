import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { ProjetsOuvertsService } from './projets-ouverts.service';

// « À décider » (revue Dir. GC, 21/10/2026) : remises et prolongations que la
// personne connectée peut trancher, sur tous les projets — mêmes règles que
// les boutons (le DPLG partout sauf ses propres tâches, le chef de team sur
// son équipe).

const tache = (id: string, statut: string, assigneId: string | null, prolongations: object[] = []) => ({
  id, libelle: `Tâche ${id}`, statut, assigneId, version: 1, finLe: '2026-10-30',
  assigne: assigneId ? { prenom: 'Awa', nom: assigneId } : null, prolongations,
});
const PROJET = {
  id: 'P1', code: 'FS_POI.26', client: { nom: 'Fatou Sarr' },
  cellules: [{ cellule: { dispatcherId: 'CHEF' } }],
  cartes: [{
    libelle: 'Plans d’exécution',
    taches: [
      tache('T1', 'a_valider', 'MEMBRE'),
      tache('T2', 'a_valider', 'CHEF'),
      tache('T3', 'a_valider', 'DPLG'),
      tache('T4', 'a_faire', 'MEMBRE', [{ decision: null, jusquau: '2026-11-06', motif: 'Attente géomètre', demandeLe: new Date('2026-10-20') }]),
      tache('T5', 'a_faire', 'MEMBRE', [{ decision: 'accordee', jusquau: '2026-11-01', motif: 'x', demandeLe: new Date('2026-10-01') }]),
    ],
  }],
};

function svc(collaborateurId: string) {
  const prisma = {
    collaborateur: { findFirst: jest.fn().mockResolvedValue({ id: collaborateurId }) },
    projet: { findMany: jest.fn().mockResolvedValue([PROJET]) },
    evenementTacheProjet: { findMany: jest.fn().mockResolvedValue([{ tacheId: 'T1', creeLe: new Date('2026-10-21T09:00:00Z') }]) },
  };
  return new ProjetsOuvertsService(prisma as unknown as PrismaService, {} as ReglagesService);
}

describe('ProjetsOuvertsService.aDecider', () => {
  it('Dir. GC (DPLG) : toutes les remises sauf la sienne, les prolongations en attente', async () => {
    const r = await svc('DPLG').aDecider('S1', { userId: 'U', role: 'Dir. GC' });
    expect(r.remises.map((x) => x.tacheId)).toEqual(['T1', 'T2']);
    expect(r.remises[0]).toMatchObject({ code: 'FS_POI.26', client: 'Fatou Sarr', carte: 'Plans d’exécution', remiseLe: new Date('2026-10-21T09:00:00Z') });
    expect(r.prolongations).toEqual([expect.objectContaining({ tacheId: 'T4', jusquau: '2026-11-06', motif: 'Attente géomètre', finPrevue: '2026-10-30' })]);
  });

  it('chef de team : son équipe, jamais sa propre remise', async () => {
    const r = await svc('CHEF').aDecider('S1', { userId: 'U', role: 'Salarié' });
    expect(r.remises.map((x) => x.tacheId)).toEqual(['T1', 'T3']);
  });

  it('CEO (hors circuit) : rien à décider', async () => {
    const r = await svc('AUTRE').aDecider('S1', { userId: 'U', role: 'CEO (transverse)' });
    expect(r).toEqual({ remises: [], prolongations: [] });
  });
});
