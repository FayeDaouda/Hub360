import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { completude, DossiersPersonnelService, PIECES_DOSSIER } from './dossiers.service';

const VIDE = {
  poste: '', prenom: '', nom: '', lieuNaissance: '', nationalite: 'Sénégalaise', numeroPiece: '',
  telephone: '', emailPro: '', contactUrgence: '', coordonneesPaiement: '', numeroIpm: '',
  dateEntree: null, dateNaissance: null, salaireBase: null, dateFin: null, typeContrat: 'cdi', pieces: [],
};

describe('completude', () => {
  it('dossier vierge (nationalité par défaut seule) : ~4 %', () => {
    expect(completude(VIDE as never).pourcentage).toBe(4);
  });

  it('tout rempli + 9 pièces : 100 %', () => {
    const plein = {
      ...VIDE, poste: 'x', prenom: 'x', nom: 'x', lieuNaissance: 'x', numeroPiece: 'x', telephone: 'x',
      emailPro: 'x', contactUrgence: 'x', coordonneesPaiement: 'x', numeroIpm: 'x',
      dateEntree: '2026-01-01', dateNaissance: '1990-01-01', salaireBase: 1,
      pieces: PIECES_DOSSIER.map((type) => ({ type })),
    };
    expect(completude(plein as never)).toEqual({ pourcentage: 100, manquants: 0 });
  });

  it('la date de fin ne compte que hors CDI', () => {
    expect(completude({ ...VIDE, typeContrat: 'cdd' } as never).manquants).toBe(completude(VIDE as never).manquants + 1);
  });
});

describe('DossiersPersonnelService', () => {
  function svc(o: { dernier?: unknown; collab?: unknown } = {}) {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...VIDE, ...data, societe: {}, collaborateur: null, pieces: [], bulletins: [] }));
    const prisma = {
      dossierPersonnel: { findFirst: jest.fn().mockResolvedValue(o.dernier ?? null), create },
      societe: { findFirst: jest.fn().mockResolvedValue({ id: 'S1' }) },
      collaborateur: { findUnique: jest.fn().mockResolvedValue(o.collab ?? null) },
    } as unknown as PrismaService;
    return { s: new DossiersPersonnelService(prisma), create };
  }

  it('matricule suivant dans la séquence groupe', async () => {
    const { s, create } = svc({ dernier: { matricule: 'GH-0012' } });
    await s.creer({ societeId: 'S1' }, 'U1');
    expect(create.mock.calls[0][0].data.matricule).toBe('GH-0013');
  });

  it('premier dossier : GH-0001', async () => {
    const { s, create } = svc();
    await s.creer({ societeId: 'S1' }, 'U1');
    expect(create.mock.calls[0][0].data.matricule).toBe('GH-0001');
  });

  it('société obligatoire à la création', async () => {
    await expect(svc().s.creer({}, 'U1')).rejects.toThrow(BadRequestException);
  });

  it("refuse une fiche d'équipe d'une autre société", async () => {
    const { s } = svc({ collab: { societeId: 'S2', dossierPersonnel: null } });
    await expect(s.creer({ societeId: 'S1', collaborateurId: 'C1' }, 'U1')).rejects.toThrow(BadRequestException);
  });

  it("refuse une fiche d'équipe déjà liée à un autre dossier", async () => {
    const { s } = svc({ collab: { societeId: 'S1', dossierPersonnel: { id: 'AUTRE' } } });
    await expect(s.creer({ societeId: 'S1', collaborateurId: 'C1' }, 'U1')).rejects.toThrow(ConflictException);
  });
});

describe('DossiersPersonnelService.archiver — le départ coupe l’accès', () => {
  function svc(o: { dossier: unknown; actif?: boolean; dernierEvenement?: unknown }) {
    const majCompte = jest.fn((a: unknown) => a);
    const evenement = jest.fn((a: unknown) => a);
    const majDossier = jest.fn(() => ({ ...VIDE, societe: {}, collaborateur: null, pieces: [], bulletins: [] }));
    const prisma = {
      dossierPersonnel: { findUnique: jest.fn().mockResolvedValue(o.dossier), update: majDossier },
      utilisateur: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ actif: o.actif ?? true }),
        update: majCompte,
      },
      evenementCompte: { create: evenement, findFirst: jest.fn().mockResolvedValue(o.dernierEvenement ?? null) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    return { s: new DossiersPersonnelService(prisma), majCompte, evenement };
  }
  const direct = { id: 'D1', utilisateurId: 'U9', collaborateur: null };
  const parFiche = { id: 'D1', utilisateurId: null, collaborateur: { utilisateur: { id: 'U9' } } };

  it.each([['compte direct', direct], ['compte de la fiche d’équipe', parFiche]])(
    'archiver désactive le compte (%s) et révoque ses sessions',
    async (_l, dossier) => {
      const { s, majCompte, evenement } = svc({ dossier });
      await s.archiver('D1', true, 'RH1');
      expect(majCompte).toHaveBeenCalledWith({
        where: { id: 'U9' },
        data: expect.objectContaining({ actif: false, desactiveParId: 'RH1', sessionsValidesDepuis: expect.any(Date) }),
      });
      expect(evenement).toHaveBeenCalledWith({ data: expect.objectContaining({ utilisateurId: 'U9', type: 'compte_desactive' }) });
    },
  );

  it('dossier sans compte : archive sans toucher aux comptes', async () => {
    const { s, majCompte } = svc({ dossier: { id: 'D1', utilisateurId: null, collaborateur: null } });
    await s.archiver('D1', true, 'RH1');
    expect(majCompte).not.toHaveBeenCalled();
  });

  it('refuse d’archiver son propre dossier', async () => {
    await expect(svc({ dossier: direct }).s.archiver('D1', true, 'U9')).rejects.toThrow(BadRequestException);
  });

  it('désarchiver réactive si l’archivage avait coupé le compte', async () => {
    const { s, majCompte } = svc({
      dossier: direct,
      actif: false,
      dernierEvenement: { type: 'compte_desactive', detail: 'Dossier RH archivé (départ)' },
    });
    await s.archiver('D1', false, 'RH1');
    expect(majCompte).toHaveBeenCalledWith({ where: { id: 'U9' }, data: expect.objectContaining({ actif: true }) });
  });

  it('désarchiver ne réactive pas un compte coupé pour une autre raison', async () => {
    const { s, majCompte } = svc({
      dossier: direct,
      actif: false,
      dernierEvenement: { type: 'compte_desactive', detail: '' },
    });
    await s.archiver('D1', false, 'RH1');
    expect(majCompte).not.toHaveBeenCalled();
  });
});

describe('verifierMoisBulletin', () => {
  const { verifierMoisBulletin } = jest.requireActual('./dossiers.service');
  it('mois AAAA-MM déjà commencé, pas avant l’entrée', () => {
    expect(() => verifierMoisBulletin('2026-09', '2024-01-03', '2026-09-29')).not.toThrow();
    expect(() => verifierMoisBulletin('2026-9', null, '2026-09-29')).toThrow('Mois invalide');
    expect(() => verifierMoisBulletin('2026-10', null, '2026-09-29')).toThrow('à venir');
    expect(() => verifierMoisBulletin('2023-12', '2024-01-03', '2026-09-29')).toThrow('entrée');
  });
});
