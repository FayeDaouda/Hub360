import { PrismaService } from '../prisma/prisma.service';
import { estAutoriseAAssigner } from './dispatch-acces';

// Deux voies pour un collaborateur non-admin d'assigner une tâche : (1) se
// désigner lui-même sur une tâche encore libre, (2) en tant que dispatcher,
// assigner n'importe quel membre de SA cellule. Les cas centraux à couvrir :
// le hors-périmètre du dispatcher (cellule A vise cellule B), et l'auto-
// assignation qui ne doit JAMAIS écraser un responsable déjà désigné par
// quelqu'un d'autre.

function prisma(opts: {
  acteur?: { id: string; celluleId: string | null } | null;
  cellule?: { dispatcherId: string | null } | null;
  cible?: { celluleId: string | null } | null;
}) {
  return {
    collaborateur: {
      findFirst: jest.fn().mockResolvedValue(opts.acteur ?? null),
      findUnique: jest.fn().mockResolvedValue(opts.cible ?? null),
    },
    cellule: {
      findUnique: jest.fn().mockResolvedValue(opts.cellule ?? null),
    },
  } as unknown as PrismaService;
}

describe('estAutoriseAAssigner — auto-assignation sur une tâche libre', () => {
  it('vrai : n’importe quel collaborateur peut se désigner lui-même sur une tâche encore libre', async () => {
    // Ni cellule ni dispatcher — l'auto-assignation ne dépend d'aucun des
    // deux, seulement de « la tâche est libre » + « je me désigne moi-même ».
    const svc = prisma({ acteur: { id: 'C1', celluleId: null } });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C1', null)).resolves.toBe(true);
  });

  it('faux : ne peut pas désigner QUELQU’UN D’AUTRE via la voie auto-assignation', async () => {
    const svc = prisma({ acteur: { id: 'C1', celluleId: null } });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C2', null)).resolves.toBe(false);
  });

  it('faux : ne peut pas s’auto-assigner un bloc déjà tenu par quelqu’un d’autre (jamais d’écrasement silencieux)', async () => {
    const svc = prisma({ acteur: { id: 'C1', celluleId: null } });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C1', 'AUTRE')).resolves.toBe(false);
  });

  it('faux si le collaborateur n’a pas de fiche pour cette société', async () => {
    const svc = prisma({ acteur: null });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C1', null)).resolves.toBe(false);
  });
});

describe('estAutoriseAAssigner — voie dispatcher', () => {
  it('faux si le collaborateur n’a aucune cellule', async () => {
    const svc = prisma({ acteur: { id: 'C1', celluleId: null } });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C2', 'ANCIEN')).resolves.toBe(false);
  });

  it('faux si le collaborateur a une cellule mais n’en est pas le dispatcher', async () => {
    const svc = prisma({
      acteur: { id: 'C1', celluleId: 'CEL1' },
      cellule: { dispatcherId: 'AUTRE' },
    });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C2', 'ANCIEN')).resolves.toBe(false);
  });

  it('vrai pour une désassignation (cible=null) dès qu’il est dispatcher de sa cellule', async () => {
    const svc = prisma({
      acteur: { id: 'C1', celluleId: 'CEL1' },
      cellule: { dispatcherId: 'C1' },
    });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', null, 'ANCIEN')).resolves.toBe(true);
  });

  it('vrai s’il assigne un membre de SA PROPRE cellule', async () => {
    const svc = prisma({
      acteur: { id: 'C1', celluleId: 'CEL1' },
      cellule: { dispatcherId: 'C1' },
      cible: { celluleId: 'CEL1' },
    });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C2', 'ANCIEN')).resolves.toBe(true);
  });

  it('HORS PÉRIMÈTRE : dispatcher de la cellule A refusé sur un membre de la cellule B', async () => {
    const svc = prisma({
      acteur: { id: 'C1', celluleId: 'CEL_A' },
      cellule: { dispatcherId: 'C1' },
      cible: { celluleId: 'CEL_B' },
    });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C2', 'ANCIEN')).resolves.toBe(false);
  });

  it('faux si la cible n’existe pas', async () => {
    const svc = prisma({
      acteur: { id: 'C1', celluleId: 'CEL1' },
      cellule: { dispatcherId: 'C1' },
      cible: null,
    });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C2', 'ANCIEN')).resolves.toBe(false);
  });

  it('un dispatcher peut aussi se désigner lui-même sur une tâche libre de sa cellule (les deux voies coexistent)', async () => {
    const svc = prisma({
      acteur: { id: 'C1', celluleId: 'CEL1' },
      cellule: { dispatcherId: 'C1' },
    });
    await expect(estAutoriseAAssigner(svc, 'S1', 'U1', 'C1', null)).resolves.toBe(true);
  });
});
