import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ProjectFileService } from './project-file.service';
import { ProjectStatesService } from './project-states.service';

// Bouton « Déposer » (peutRemettre) du dossier d'un projet : même règle que
// le dépôt lui-même (deposit-rules.ts, décision du 09/11/2026) — l'assigné,
// l'Écriture de « Projets et cartes » (Dir. GC), ou le chef d'une équipe du
// projet pour un membre de son équipe ou une tâche sans assigné ; et
// seulement sur une tâche à faire ou en reprise d'une carte ouverte.

const DG = { projets: 'LE', 'projets.assignation': 'E', 'projets.validation': 'V' };
const SAL = { projets: 'L', 'projets.fils': 'E' };

const chef = (id: string) => ({
  id,
  prenom: 'Chef',
  nom: id,
  utilisateur: { actif: true },
  dossierPersonnel: null,
});

const tache = (id: string, assigne: { id: string; celluleId: string } | null, statut = 'a_faire') => ({
  id,
  cle: id.toLowerCase(),
  libelle: `Tâche ${id}`,
  ajouteeAuProjet: false,
  descriptif: null,
  sourceNative: null,
  fichierObligatoire: false,
  debutJ: null,
  finJ: null,
  debutLe: null,
  finLe: null,
  temps: { type: 'fixe' },
  heures: null,
  statut,
  motif: null,
  version: 0,
  pieces: [],
  devisTs: null,
  valideeLe: null,
  valideePar: null,
  visaRequis: false,
  visaLe: null,
  visaParId: null,
  visaNonTrace: false,
  assigneId: assigne?.id ?? null,
  assigne: assigne
    ? { id: assigne.id, prenom: 'Awa', nom: assigne.id, celluleId: assigne.celluleId, cellule: { nom: 'Équipe' } }
    : null,
  prolongations: [],
});

const carte = (id: string, taches: object[], desactivation: string | null = null) => ({
  id,
  etapeNumero: 2,
  etapeLibelle: 'Avant-projet',
  etapeCle: 'avant_projet',
  cle: id.toLowerCase(),
  libelle: `Carte ${id}`,
  note: null,
  descriptif: null,
  etiquette: null,
  debutJ: null,
  finJ: null,
  debutLe: null,
  finLe: null,
  temps: null,
  client: false,
  fichiers: false,
  desactivation,
  ouvreApres: [],
  taches,
});

// Équipe EQ1 (chef C-CHEF, membre C1) et équipe EQ2 (chef C-CHEF2, membre C2).
const PROJET = {
  id: 'P1',
  code: 'GC-01',
  client: { nom: 'Fatou Sarr', type: 'physique' },
  cellules: [
    { celluleId: 'EQ1', cellule: { nom: 'Équipe 1', dispatcher: chef('C-CHEF') } },
    { celluleId: 'EQ2', cellule: { nom: 'Équipe 2', dispatcher: chef('C-CHEF2') } },
  ],
  cartes: [
    carte('K1', [
      tache('T-MEMBRE', { id: 'C1', celluleId: 'EQ1' }),
      tache('T-LIBRE', null),
      tache('T-AUTRE', { id: 'C2', celluleId: 'EQ2' }),
      tache('T-REMISE', { id: 'C1', celluleId: 'EQ1' }, 'a_valider'),
    ]),
    carte('K2', [tache('T-OFF', { id: 'C1', celluleId: 'EQ1' })], 'Hors mission'),
  ],
  gabaritVersion: null,
  ouvertLe: '2026-11-02',
  budgetHeures: null,
  dateVisiteSite: null,
  phase: null,
  factures: [],
  devis: [],
  societe: { contratSignataireNom: null },
};

function svc(me: string | null) {
  const prisma = {
    collaborateur: {
      findFirst: jest.fn().mockResolvedValue(me ? { id: me } : null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Contexte du jour (suppléance) : aucun Dir. GC en base, aucune absence.
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([]) },
    demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    projet: { findFirst: jest.fn().mockResolvedValue(PROJET) },
    commentaireProjet: { groupBy: jest.fn().mockResolvedValue([]) },
    utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    modificationProjet: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const reglages = {
    joursFeries: jest.fn().mockResolvedValue(new Map()),
    regle: jest.fn().mockResolvedValue(null),
  } as unknown as ReglagesService;
  const db = prisma as unknown as PrismaService;
  return new ProjectFileService(db, reglages, new ProjectStatesService(db, reglages));
}

// Tâches où le bouton « Déposer » apparaît, pour ce compte.
async function deposables(me: string | null, role: string, permissions: Record<string, string>) {
  const dossier = await svc(me).file('S1', 'P1', { userId: 'U', role, permissions });
  return dossier.cartes.flatMap((c) => c.taches.filter((t) => t.peutRemettre).map((t) => t.id));
}

describe('ProjectFileService.file — bouton « Déposer » (peutRemettre)', () => {
  it('le Dir. GC peut déposer toute tâche à faire d’une carte ouverte, assignée à un autre ou non', async () => {
    await expect(deposables('C9', 'Dir. GC', DG)).resolves.toEqual(['T-MEMBRE', 'T-LIBRE', 'T-AUTRE']);
  });

  it('le Dir. GC sans fiche d’équipe garde le bouton grâce à son droit d’écriture', async () => {
    await expect(deposables(null, 'Dir. GC', DG)).resolves.toEqual(['T-MEMBRE', 'T-LIBRE', 'T-AUTRE']);
  });

  it('l’assigné ne voit le bouton que sur sa propre tâche à faire', async () => {
    await expect(deposables('C1', 'Salarié', SAL)).resolves.toEqual(['T-MEMBRE']);
  });

  it('un simple membre ne voit aucun bouton sur les tâches des autres', async () => {
    await expect(deposables('C3', 'Salarié', SAL)).resolves.toEqual([]);
  });

  it('un compte sans fiche d’équipe ni droit d’écriture ne voit aucun bouton', async () => {
    await expect(deposables(null, 'Salarié', SAL)).resolves.toEqual([]);
  });

  it('le chef d’équipe voit le bouton sur la tâche de son membre et sur la tâche sans assigné', async () => {
    await expect(deposables('C-CHEF', 'Salarié', SAL)).resolves.toEqual(['T-MEMBRE', 'T-LIBRE']);
  });

  it('le chef de l’équipe 2 : la tâche de son membre et la tâche sans assigné, pas celle de l’équipe 1', async () => {
    await expect(deposables('C-CHEF2', 'Salarié', SAL)).resolves.toEqual(['T-LIBRE', 'T-AUTRE']);
  });

  it('pas de bouton sur une tâche déjà remise ni sur une carte désactivée, même pour le Dir. GC', async () => {
    const dossier = await svc('C9').file('S1', 'P1', { userId: 'U', role: 'Dir. GC', permissions: DG });
    const taches = dossier.cartes.flatMap((c) => c.taches);
    expect(taches.find((t) => t.id === 'T-REMISE')!.peutRemettre).toBe(false);
    expect(taches.find((t) => t.id === 'T-OFF')!.peutRemettre).toBe(false);
  });
});
