import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReglagesService } from '../reglages/reglages.service';
import { TempsService } from './temps.service';

// Tâche du gabarit assignée (TacheProjet), telle que lue par chargerTachesAssignees.
const TACHE = {
  id: 'T1', assigneId: 'C1', libelle: 'Dossier de permis', debutLe: '2026-09-14', finLe: '2026-09-18', heures: 16,
  statut: 'a_faire', version: 0, valideeLe: null, evenements: [],
  carte: { libelle: 'Permis de construire', etapeNumero: 4, etapeLibelle: 'Autorisations' },
  projet: { id: 'P1', code: 'PN_S.26', programme: 'Villa', client: { nom: 'Pape Ndiaye' } },
};
const DOSSIER = {
  id: 'D1', matricule: 'GH-0001', prenom: 'Awa', nom: 'Ndiaye', poste: 'CAD L1', dateEntree: '2024-01-03', archiveLe: null,
  societe: { nom: 'Grey Concrete' }, collaborateur: { id: 'C1', cellule: { nom: 'Archi 2' } }, absences: [],
  controlesTemps: [] as object[],
  ecartsTemps: [] as object[],
  societeId: 'S1',
};
const SANS_FICHE = { ...DOSSIER, id: 'D2', matricule: 'GH-0002', collaborateur: null };

function svc(o: { dossier?: object; taches?: object[]; collab?: object | null } = {}) {
  const d = { ...DOSSIER, ...o.dossier };
  const prisma = {
    dossierPersonnel: {
      findMany: jest.fn().mockResolvedValue([d, SANS_FICHE]),
      findUnique: jest.fn().mockResolvedValue(d),
      findFirst: jest.fn().mockResolvedValue(o.collab === null ? null : d),
    },
    tacheProjet: { findMany: jest.fn().mockResolvedValue(o.taches ?? [TACHE]) },
    dureeStandardTache: {
      findMany: jest.fn().mockResolvedValue([{ societeId: 'S1', section: 'permis', groupe: 'dossier_permis', heures: 16 }]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    controleFeuilleTemps: { create: jest.fn() },
    ecartFeuilleTemps: { create: jest.fn() },
    collaborateur: { findFirst: jest.fn().mockResolvedValue(o.collab === undefined ? { id: 'C1', dateArrivee: null } : o.collab) },
  } as unknown as PrismaService;
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['URH']) };
  const reglages = { joursFeries: jest.fn().mockImplementation((ids: string[]) => Promise.resolve(new Map(ids.map((i) => [i, new Set<string>()])))) };
  return {
    s: new TempsService(prisma, reglages as unknown as ReglagesService, notifications as unknown as NotificationsService),
    prisma,
    notifications,
  };
}

describe('TempsService', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-05T10:00:00Z')));
  afterAll(() => jest.useRealTimers());

  it('feuilles : dernier mois clos par défaut, heures calculées et compteur à contrôler', async () => {
    const r = await svc().s.feuilles();
    expect(r.mois).toBe('2026-09');
    expect(r.periodes).toEqual([
      { mois: '2026-09', clos: true, ecarts: 0, aControler: 1 },
      { mois: '2026-10', clos: false, ecarts: 0, aControler: 0 },
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

  it('une tâche sans temps atelier ou sans début ne produit aucune heure', async () => {
    const r = await svc({ taches: [{ ...TACHE, heures: null }, { ...TACHE, id: 'T2', debutLe: null }] }).s.feuilles('2026-09');
    expect(r.feuilles[0]).toMatchObject({ heuresImputees: 0, statut: 'sans_heures', blocsNonPlanifies: 1 });
    expect(r.feuilles[0].lignes).toEqual([expect.objectContaining({ manque: 'duree', etape: '04 · Autorisations' })]);
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


  // Revue Salarié 19/10/2026 : pas de confirmation ; un écart signalé bloque le contrôle.
  it('écart : signalé tant que le mois n’est pas contrôlé, RH prévenue', async () => {
    const { s, prisma, notifications } = svc();
    await s.signalerEcart({ userId: 'U1', societeId: 'S1' }, '2026-09', ' Absence du 12 non prise en compte ');
    expect((prisma.ecartFeuilleTemps.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ dossierId: 'D1', mois: '2026-09', commentaire: 'Absence du 12 non prise en compte' });
    expect(notifications.envoyer.mock.calls[0][0]).toMatchObject({ type: 'ecart_temps_signale', destinataireIds: ['URH'] });
  });

  it('écart : refusé sur une feuille déjà contrôlée, ou déjà ouvert', async () => {
    const controlee = svc({ dossier: { controlesTemps: [{ mois: '2026-09' }] } });
    await expect(controlee.s.signalerEcart({ userId: 'U1', societeId: 'S1' }, '2026-09', 'Écart à revoir')).rejects.toThrow(ConflictException);
    const ouvert = svc({ dossier: { ecartsTemps: [{ mois: '2026-09', traiteLe: null }] } });
    await expect(ouvert.s.signalerEcart({ userId: 'U1', societeId: 'S1' }, '2026-09', 'Écart à revoir')).rejects.toThrow(ConflictException);
  });

  it('contrôle refusé tant qu’un écart du mois est ouvert', async () => {
    const { s } = svc({ dossier: { ecartsTemps: [{ mois: '2026-09', traiteLe: null }] } });
    await expect(s.controler('URH', 'D1', '2026-09')).rejects.toThrow(/écart/);
  });
});
