import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalAuditService, periode } from './journal-audit.service';

const dec = (n: number) => new Prisma.Decimal(n);

function svc() {
  const vide = { findMany: jest.fn().mockResolvedValue([]) };
  const prisma = {
    evenementCompte: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'E1', type: 'compte_desactive', detail: 'Administration du HUB', parId: 'U9', createdAt: new Date('2026-10-10T08:00:00Z'), utilisateur: { prenom: 'Awa', nom: 'Diop' } },
      ]),
    },
    journalDroit: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'D1', roleNom: 'CFO', module: 'crm', avant: 'lecture', apres: 'ecriture', parId: 'U9', createdAt: new Date('2026-10-12T08:00:00Z') },
      ]),
    },
    facture: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'F1', numero: 3, emiseLe: new Date('2026-10-11T08:00:00Z'), estAvoir: false, montantHt: dec(100_000), tauxTva: dec(18), emiseParId: null, libelle: 'Acompte' },
        ])
        .mockResolvedValue([]),
    },
    paiement: vide,
    paiementSupprime: vide,
    journalReglage: vide,
    dossierPersonnel: vide,
    journalPaie: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'P1', action: 'bulletin_consulte', mois: '2026-09', parId: 'U9', createdAt: new Date('2026-10-13T08:00:00Z'), dossier: { prenom: 'Khadija', nom: 'Sow', matricule: 'GH-0005' } },
      ]),
    },
    utilisateur: { findMany: jest.fn().mockResolvedValue([{ id: 'U9', prenom: 'Ousseynou', nom: 'Camara' }]) },
  } as unknown as PrismaService;
  return new JournalAuditService(prisma);
}

describe('JournalAuditService', () => {
  it('réservé au CEO, au CIO et à l’administration', async () => {
    await expect(svc().journal({ userId: 'U1', societeId: 'S1', role: 'CFO' })).rejects.toThrow(ForbiddenException);
  });

  it('réunit les sources, du plus récent au plus ancien, auteur nommé', async () => {
    const { lignes } = await svc().journal({ userId: 'U1', societeId: 'S1', role: 'CEO (transverse)' }, '2026-10-01', '2026-10-14');
    expect(lignes.map((l) => l.action)).toEqual(['Bulletin consulté', 'Droits modifiés', 'Facture émise', 'Compte désactivé']);
    // Paie : qui a ouvert le bulletin de qui — jamais de montant.
    expect(lignes[0]).toMatchObject({ categorie: 'paie', detail: 'Khadija Sow · GH-0005 · bulletin 09/2026', par: 'Ousseynou Camara' });
    expect(lignes[1]).toMatchObject({ detail: 'CFO · crm : lecture → écriture', par: 'Ousseynou Camara', categorie: 'droits' });
    expect(lignes[2].detail).toContain('F2026-0003 · 118');
    expect(lignes[2].par).toBeNull();
  });
});

describe('periode', () => {
  const MAINTENANT = new Date('2026-10-15T10:00:00Z');
  it('30 derniers jours par défaut, fin incluse', () => {
    const { de, a } = periode(undefined, undefined, MAINTENANT);
    expect(a.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(de.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });
  it('refuse un format faux, une période inversée ou de plus d’un an', () => {
    expect(() => periode('15/10/2026')).toThrow(BadRequestException);
    expect(() => periode('2026-10-15', '2026-10-01')).toThrow('précéder');
    expect(() => periode('2024-01-01', '2026-10-01')).toThrow('Un an');
  });
});
