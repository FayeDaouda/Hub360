import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TempsService } from './temps.service';

const PROJET = { id: 'P1', code: 'PN_S.26', programme: 'Villa', societeId: 'S1' };
const BLOC = { groupe: 'dossier_permis', debut: '2026-09-14', echeance: '2026-09-18', responsableId: 'C1', permis: { projet: PROJET } };
const DOSSIER = {
  id: 'D1', matricule: 'GH-0001', prenom: 'Awa', nom: 'Ndiaye', poste: 'CAD L1', dateEntree: '2024-01-03', archiveLe: null,
  societe: { nom: 'Grey Concrete' }, collaborateur: { id: 'C1', cellule: { nom: 'Archi 2' } }, absences: [],
  controlesTemps: [] as object[],
};
const SANS_FICHE = { ...DOSSIER, id: 'D2', matricule: 'GH-0002', collaborateur: null };

function svc(o: { dossier?: object; blocs?: object[]; collab?: object | null } = {}) {
  const d = { ...DOSSIER, ...o.dossier };
  const prisma = {
    dossierPersonnel: {
      findMany: jest.fn().mockResolvedValue([d, SANS_FICHE]),
      findUnique: jest.fn().mockResolvedValue(d),
      findFirst: jest.fn().mockResolvedValue(o.collab === null ? null : d),
    },
    blocChecklistAvp: { findMany: jest.fn().mockResolvedValue([]) },
    blocPermis: { findMany: jest.fn().mockResolvedValue(o.blocs ?? [BLOC]) },
    blocExecution: { findMany: jest.fn().mockResolvedValue([]) },
    dureeStandardTache: {
      findMany: jest.fn().mockResolvedValue([{ societeId: 'S1', section: 'permis', groupe: 'dossier_permis', heures: 16 }]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    controleFeuilleTemps: { create: jest.fn() },
    collaborateur: { findFirst: jest.fn().mockResolvedValue(o.collab === undefined ? { id: 'C1', dateArrivee: null } : o.collab) },
  } as unknown as PrismaService;
  return { s: new TempsService(prisma), prisma };
}

describe('TempsService', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-05T10:00:00Z')));
  afterAll(() => jest.useRealTimers());

  it('feuilles : dernier mois clos par défaut, heures calculées et compteur à contrôler', async () => {
    const r = await svc().s.feuilles();
    expect(r.mois).toBe('2026-09');
    expect(r.periodes).toEqual([
      { mois: '2026-09', clos: true, aControler: 1 },
      { mois: '2026-10', clos: false, aControler: 0 },
    ]);
    const [awa, sansFiche] = r.feuilles;
    expect(awa).toMatchObject({ statut: 'a_controler', heuresImputees: 16, heuresDisponibles: 176, occupation: 9, cellule: 'Archi 2' });
    expect(awa.lignes).toEqual([expect.objectContaining({ libelle: expect.any(String), dureeStandard: 16, heures: 16, manque: null })]);
    expect(sansFiche).toMatchObject({ statut: 'sans_heures', heuresImputees: 0 });
    expect((await svc().s.feuilles('2026-10')).feuilles[0].statut).toBe('en_cours');
  });

  it('mois hors période refusé', async () => {
    for (const m of ['2026-08', '2026-11', '2026-13']) await expect(svc().s.feuilles(m)).rejects.toThrow(BadRequestException);
  });

  it('un bloc sans durée standard ou sans début ne produit aucune heure', async () => {
    const r = await svc({ blocs: [{ ...BLOC, groupe: 'procedure' }, { ...BLOC, debut: null }] }).s.feuilles('2026-09');
    expect(r.feuilles[0]).toMatchObject({ heuresImputees: 0, statut: 'sans_heures', blocsNonPlanifies: 1 });
    expect(r.feuilles[0].lignes).toEqual([expect.objectContaining({ manque: 'duree' })]);
  });

  it('contrôle : mois clos seulement, une seule fois, chiffres figés', async () => {
    await expect(svc().s.controler('U', 'D1', '2026-10')).rejects.toThrow(ConflictException);
    const deja = svc({ dossier: { controlesTemps: [{ mois: '2026-09' }] } });
    await expect(deja.s.controler('U', 'D1', '2026-09')).rejects.toThrow(ConflictException);
    const { s, prisma } = svc();
    await s.controler('U', 'D1', '2026-09');
    expect(prisma.controleFeuilleTemps.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mois: '2026-09', heuresImputees: 16, heuresDisponibles: 176, joursAbsence: 0, controleParId: 'U' }),
    });
  });

  it('une feuille contrôlée affiche les chiffres figés, pas le recalcul', async () => {
    const controle = {
      mois: '2026-09', heuresImputees: 40, heuresDisponibles: 160, joursAbsence: 2,
      detail: { lignes: [] }, controleLe: new Date('2026-10-02T09:00:00Z'),
    };
    const r = await svc({ dossier: { controlesTemps: [controle] } }).s.feuilles('2026-09');
    expect(r.feuilles[0]).toMatchObject({ statut: 'controlee', heuresImputees: 40, occupation: 25, lignes: [] });
    expect(r.periodes[0].aControler).toBe(0);
  });

  it('mon temps : feuille du mois du salarié, dossier ou fiche requis', async () => {
    const r = await svc().s.monTemps({ userId: 'U', societeId: 'S1' });
    expect(r.mois).toBe('2026-10');
    expect(r.feuille).toMatchObject({ statut: 'en_cours', heuresImputees: 0, lignes: [] });
    expect((await svc().s.monTemps({ userId: 'U', societeId: 'S1' }, '2026-09')).feuille.heuresImputees).toBe(16);
    await expect(svc({ collab: null }).s.monTemps({ userId: 'U', societeId: 'S1' })).rejects.toThrow(NotFoundException);
  });

  it('référentiel : bloc inconnu refusé, null retire la durée', async () => {
    const { s, prisma } = svc();
    await expect(s.definirDuree('S1', 'U', 'permis', 'inconnu', 8)).rejects.toThrow(NotFoundException);
    await s.definirDuree('S1', 'U', 'permis', 'dossier_permis', null);
    expect(prisma.dureeStandardTache.deleteMany).toHaveBeenCalled();
    await s.definirDuree('S1', 'U', 'permis', 'dossier_permis', 12.5);
    expect(prisma.dureeStandardTache.upsert).toHaveBeenCalled();
  });
});
