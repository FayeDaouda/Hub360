import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ProjectStatesService } from './project-states.service';
import { ProjectsBoardService } from './projects-board.service';

// « À décider » (revue Dir. GC, 21/10/2026) : remises et prolongations que la
// personne connectée peut trancher, sur tous les projets — mêmes règles que
// les boutons (le DPLG partout sauf ses propres tâches, le chef de team sur
// son équipe).

const tache = (id: string, statut: string, assigneId: string | null, prolongations: object[] = []) => ({
  id,
  libelle: `Tâche ${id}`,
  statut,
  assigneId,
  version: 1,
  finLe: '2026-10-30',
  assigne: assigneId ? { prenom: 'Awa', nom: assigneId } : null,
  prolongations,
});
const PROJET = {
  id: 'P1',
  code: 'FS_POI.26',
  client: { nom: 'Fatou Sarr' },
  cellules: [{ cellule: { dispatcherId: 'CHEF' } }],
  cartes: [
    {
      libelle: 'Plans d’exécution',
      taches: [
        tache('T1', 'a_valider', 'MEMBRE'),
        tache('T2', 'a_valider', 'CHEF'),
        tache('T3', 'a_valider', 'DPLG'),
        tache('T4', 'a_faire', 'MEMBRE', [
          { decision: null, jusquau: '2026-11-06', motif: 'Attente géomètre', demandeLe: new Date('2026-10-20') },
        ]),
        tache('T5', 'a_faire', 'MEMBRE', [
          { decision: 'accordee', jusquau: '2026-11-01', motif: 'x', demandeLe: new Date('2026-10-01') },
        ]),
      ],
    },
  ],
};

function svc(collaborateurId: string, projet: object = PROJET) {
  const prisma = {
    collaborateur: {
      findFirst: jest.fn().mockResolvedValue({ id: collaborateurId }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    projet: { findMany: jest.fn().mockResolvedValue([projet]) },
    evenementTacheProjet: {
      findMany: jest.fn().mockResolvedValue([{ tacheId: 'T1', creeLe: new Date('2026-10-21T09:00:00Z') }]),
    },
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([]) },
    demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    demandeTs: { findMany: jest.fn().mockResolvedValue([]) },
    utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const reglages = { joursFeries: jest.fn().mockResolvedValue(new Map()) } as unknown as ReglagesService;
  const db = prisma as unknown as PrismaService;
  return new ProjectsBoardService(db, reglages, new ProjectStatesService(db, reglages));
}

describe('ProjectsBoardService.toDecide', () => {
  it('Dir. GC (DPLG) : toutes les remises sauf la sienne, les prolongations en attente', async () => {
    const r = await svc('DPLG').toDecide('S1', { userId: 'U', role: 'Dir. GC' });
    expect(r.remises.map((x) => x.tacheId)).toEqual(['T1', 'T2']);
    expect(r.remises[0]).toMatchObject({
      code: 'FS_POI.26',
      client: 'Fatou Sarr',
      carte: 'Plans d’exécution',
      remiseLe: new Date('2026-10-21T09:00:00Z'),
    });
    expect(r.prolongations).toEqual([
      expect.objectContaining({
        tacheId: 'T4',
        jusquau: '2026-11-06',
        motif: 'Attente géomètre',
        finPrevue: '2026-10-30',
        repousseLivraison: null,
      }),
    ]);
  });

  it('chef de team : son équipe, jamais sa propre remise', async () => {
    const r = await svc('CHEF').toDecide('S1', { userId: 'U', role: 'Salarié' });
    expect(r.remises.map((x) => x.tacheId)).toEqual(['T1', 'T3']);
  });

  it('CEO (hors circuit) : rien à décider', async () => {
    const r = await svc('AUTRE').toDecide('S1', { userId: 'U', role: 'CEO (transverse)' });
    expect(r).toEqual({ remises: [], prolongations: [], visas: [], ts: [] });
  });

  it('prolongation qui repousse la livraison : au CTO, plus au Dir. GC', async () => {
    // Ouvert le 01/10, 80 h de budget = 10 jours ouvrés → livraison le 14/10.
    const projet = { ...PROJET, ouvertLe: '2026-10-01', budgetHeures: 80 };
    expect((await svc('DPLG', projet).toDecide('S1', { userId: 'U', role: 'Dir. GC' })).prolongations).toEqual([]);
    const cto = await svc('AUTRE', projet).toDecide('S1', { userId: 'U', role: 'CTO (transverse)' });
    expect(cto.prolongations).toEqual([expect.objectContaining({ tacheId: 'T4', repousseLivraison: '2026-10-14' })]);
    expect(cto.remises).toEqual([]); // le travail des équipes reste au Dir. GC
  });
});
