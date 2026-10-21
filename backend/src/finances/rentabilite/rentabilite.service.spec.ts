import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { TempsService } from '../../rh/temps.service';
import { coutHoraire, parametreAu, salaireDuMois, statutMarge, tauxMarge } from './regles-rentabilite';
import { RentabiliteService } from './rentabilite.service';

const dec = (n: number) => new Prisma.Decimal(n);
const valide = (montant: number, dateEffet: string | null) => ({ montant, dateEffet, statut: 'valide' as const, decideLe: new Date('2026-01-01') });

describe('règles de rentabilité (lot 7, phase 1)', () => {
  it('paramètres : défaut 173,33 h, puis la valeur en vigueur à sa date d’effet', () => {
    const lignes = [{ cle: 'heures_annuelles', valeur: 1920, dateEffet: '2026-11-01', createdAt: new Date() }];
    expect(parametreAu(lignes, 'heures_annuelles', '2026-10-15')).toBe(2080);
    expect(parametreAu(lignes, 'heures_annuelles', '2026-11-01')).toBe(1920);
    expect(parametreAu([], 'coefficient_charges', '2026-10-01')).toBeNull();
    expect(parametreAu([], 'marge_cible', '2026-10-01')).toBeNull();
  });

  it('salaire du mois au prorata des jours ouvrés ; coût horaire avec ou sans charges', () => {
    // Octobre 2026 : 22 jours ouvrés ; 600 000 jusqu'au 15, 700 000 à partir du 16 (11 + 11 jours).
    const s = salaireDuMois([valide(600_000, null), valide(700_000, '2026-10-16')], '2026-10', new Set());
    expect(s).toBe(650_000);
    expect(salaireDuMois([], '2026-10', new Set())).toBeNull();
    // Base exacte : 520 000 FCFA ÷ (2 080 h ÷ 12) = 3 000 FCFA tout rond (simulation refaite à la main).
    expect(coutHoraire(520_000, 2080, null)).toBe(3000);
    expect(coutHoraire(520_000, 2080, null) * 66).toBe(198_000);
    expect(coutHoraire(520_000, 2080, 20)).toBe(3600);
  });

  it('taux non calculable sans facturé ; couleur par rapport à la cible, aucune sans cible', () => {
    expect(tauxMarge(0, -1_200_000)).toBeNull();
    expect(tauxMarge(10_000_000, 7_000_000)).toBe(70);
    expect(statutMarge(70, null)).toBeNull();
    expect(statutMarge(70, 60)).toBe('vert');
    expect(statutMarge(40, 60)).toBe('ambre');
    expect(statutMarge(-5, 60)).toBe('rouge');
    expect(statutMarge(null, 60)).toBeNull();
  });
});

describe('RentabiliteService', () => {
  const CFO = { userId: 'U-CFO', societeId: 'S1', role: 'CFO' };
  const CEO = { userId: 'U-CEO', societeId: 'S1', role: 'CEO (transverse)' };
  const CTO = { userId: 'U-CTO', societeId: 'S1', role: 'CTO (transverse)' };
  const CIO = { userId: 'U-CIO', societeId: 'S1', role: 'CIO (transverse)' };

  function svc(o: { parametres?: object[]; salaire?: number | null } = {}) {
    const projet = (id: string, taches: number) => ({ id, code: id, programme: 'Villa', statut: 'en_cours', phase: 'conception', ouvertLe: '2026-09-01', client: { nom: 'Client' }, _count: { taches } });
    const prisma = {
      projet: { findMany: jest.fn().mockResolvedValue([projet('P1', 3), projet('P2', 0)]) },
      facture: {
        findMany: jest.fn(({ where }: { where: { statut?: string } }) =>
          Promise.resolve(
            where.statut === 'brouillon'
              ? [{ projetId: 'P1', montantHt: dec(4_000_000) }]
              : [
                  { id: 'F1', projetId: 'P1', numero: 1, emiseLe: new Date('2026-09-10'), estAvoir: false, statut: 'emise', montantHt: dec(10_000_000), libelle: 'F1' },
                  { id: 'F2', projetId: 'P2', numero: 2, emiseLe: new Date('2026-09-12'), estAvoir: false, statut: 'emise', montantHt: dec(2_000_000), libelle: 'F1' },
                ],
          ),
        ),
      },
      controleFeuilleTemps: {
        findMany: jest.fn().mockResolvedValue([
          { dossierId: 'D1', mois: '2026-09', controleLe: new Date('2026-10-05'), detail: { lignes: [{ id: 'T1', projetCode: 'P1', heures: 100 }] } },
        ]),
      },
      dossierPersonnel: {
        findMany: jest.fn().mockResolvedValue([{ id: 'D1', prenom: 'Awa', nom: 'Diouf', salaires: o.salaire === null ? [] : [valide(o.salaire ?? 520_000, null)] }]),
      },
      tacheProjet: { findMany: jest.fn().mockResolvedValue([{ id: 'T1', projetId: 'P1' }]) },
      prolongationTache: { findMany: jest.fn().mockResolvedValue([{ tache: { projetId: 'P1' } }]) },
      evenementTacheProjet: { findMany: jest.fn().mockResolvedValue([{ tache: { projetId: 'P1' } }, { tache: { projetId: 'P1' } }]) },
      parametreRentabilite: { findMany: jest.fn().mockResolvedValue(o.parametres ?? []), create: jest.fn() },
      journalPaie: { createMany: jest.fn() },
      utilisateurSocieteRole: { findMany: jest.fn(({ where }: { where: { role: { nom: string } } }) => Promise.resolve([{ utilisateur: where.role.nom === 'RH' ? { prenom: 'Coumba', nom: 'Gaye' } : { prenom: 'Bineta', nom: 'Sarr' } }])) },
      utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const reglages = { joursFeries: jest.fn().mockResolvedValue(new Map([['S1', new Set<string>()]])) } as unknown as ReglagesService;
    const temps = { feuilles: jest.fn().mockResolvedValue({ feuilles: [] }) } as unknown as TempsService;
    return { s: new RentabiliteService(prisma, reglages, temps), prisma };
  }

  it('CFO : HT facturé, coût des heures contrôlées au salaire en vigueur, marge provisoire, signaux', async () => {
    const r = await svc().s.portefeuille(CFO);
    const p1 = r.lignes.find((l) => l.projet.id === 'P1')!;
    // 520 000 ÷ (2 080 ÷ 12) = 3 000 FCFA/h × 100 h = 300 000.
    expect(p1).toMatchObject({ ht: 10_000_000, cout: 300_000, marge: 9_700_000, taux: 97, heures: 100, prolongations: 1, reprises: 2, aFacturer: 4_000_000, etat: 'complet', statut: null });
    // Projet sans gabarit : heures non suivies, pas de statut, hors totaux.
    expect(r.lignes.find((l) => l.projet.id === 'P2')).toMatchObject({ etat: 'heures_non_suivies', statut: null });
    expect(r.totaux).toMatchObject({ ht: 10_000_000, cout: 300_000 });
    expect(r.parametres.find((p) => p.cle === 'heures_annuelles')).toMatchObject({ valeur: 2080, parDefaut: true });
  });

  it('couleur par rapport à la marge cible fixée par le CFO', async () => {
    const r = await svc({ parametres: [{ cle: 'marge_cible', valeur: 98, dateEffet: '2026-01-01', createdAt: new Date() }] }).s.portefeuille(CEO);
    expect(r.lignes.find((l) => l.projet.id === 'P1')!.statut).toBe('ambre');
  });

  it('CTO : taux et couleur, aucun montant ; CIO : refusé', async () => {
    const r = await svc().s.portefeuille(CTO);
    expect(r.lignes.find((l) => l.projet.id === 'P1')).toMatchObject({ ht: null, cout: null, marge: null, aFacturer: null, taux: 97 });
    expect(r.totaux).toMatchObject({ ht: null, cout: null, marge: null });
    await expect(svc().s.portefeuille(CIO)).rejects.toThrow(ForbiddenException);
    await expect(svc().s.salaries(CTO, 'P1')).rejects.toThrow(ForbiddenException);
  });

  it('salarié sans salaire validé : « données insuffisantes », jamais un coût à zéro', async () => {
    const r = await svc({ salaire: null }).s.portefeuille(CFO);
    // Pas de faux 100 % : ni marge ni taux, et hors des totaux.
    expect(r.lignes.find((l) => l.projet.id === 'P1')).toMatchObject({ etat: 'insuffisant', raisons: ['1 salarié(s) sans salaire validé'], marge: null, taux: null, statut: null, ht: 10_000_000 });
    expect(r.totaux).toMatchObject({ ht: 0, marge: null, taux: null });
    expect(r.projetsComplets).toBe(0);
  });

  it('détail par salarié tracé au journal de la paie, sans montant', async () => {
    const { s, prisma } = svc();
    (prisma.dossierPersonnel.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'D1', prenom: 'Awa', nom: 'Diouf', salaires: [valide(520_000, null)] }]).mockResolvedValueOnce([{ id: 'D1', prenom: 'Awa', nom: 'Diouf' }]);
    expect(await s.salaries(CFO, 'P1')).toEqual([{ nom: 'Awa Diouf', heures: 100, cout: 300_000, sansSalaire: false }]);
    expect(prisma.journalPaie.createMany).toHaveBeenCalledWith({ data: [{ dossierId: 'D1', action: 'cout_consulte', parId: 'U-CFO' }] });
  });

  it('paramètres : le CFO seul, au 1er d’un mois, jamais un mois passé', async () => {
    const p = { cle: 'heures_annuelles', valeur: 1920, dateEffet: '2099-01-01', motif: 'Accord d’entreprise' };
    await expect(svc().s.modifierParametre(CEO, p)).rejects.toThrow(ForbiddenException);
    await expect(svc().s.modifierParametre(CFO, { ...p, dateEffet: '2020-01-01' })).rejects.toThrow(/mois passé/);
    await expect(svc().s.modifierParametre(CFO, { ...p, valeur: null })).rejects.toThrow(BadRequestException);
    const { s, prisma } = svc();
    await s.modifierParametre(CFO, p);
    expect(prisma.parametreRentabilite.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cle: 'heures_annuelles', valeur: 1920, dateEffet: '2099-01-01', parId: 'U-CFO' }) });
  });

  it('heures de mois clos à contrôler : données insuffisantes, pas de marge gonflée', async () => {
    const { s, prisma } = svc();
    void prisma;
    (s as unknown as { temps: { feuilles: jest.Mock } }).temps.feuilles.mockResolvedValue({ feuilles: [{ statut: 'a_controler', lignes: [{ id: 'T1', projetCode: 'P1', heures: 40 }] }] });
    const r = await s.portefeuille(CFO);
    expect(r.lignes.find((l) => l.projet.id === 'P1')).toMatchObject({ etat: 'insuffisant', marge: null, taux: null, heuresAttente: 40, cout: 300_000 });
    expect(r.lignes.find((l) => l.projet.id === 'P1')!.raisons).toContain('40 h en attente de contrôle RH');
  });

  it('blocages : feuilles à contrôler par mois, salaires manquants, et qui doit agir', async () => {
    const { s } = svc({ salaire: null });
    (s as unknown as { temps: { feuilles: jest.Mock } }).temps.feuilles.mockResolvedValue({ feuilles: [{ dossierId: 'D2', statut: 'a_controler', lignes: [{ id: 'T1', projetCode: 'P1', heures: 40 }] }] });
    const r = await s.portefeuille(CFO);
    expect(r.blocages).toEqual({
      feuilles: [{ mois: expect.stringMatching(/^\d{4}-\d{2}$/), feuilles: 1, projets: 1 }],
      salaires: { salaries: 1, projets: 1 },
      rh: ['Coumba Gaye'],
      cfo: ['Bineta Sarr'],
    });
  });
});

