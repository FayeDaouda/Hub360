import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { OuvertureProjetService } from '../gabarit/ouverture.service';
import { FacturationService } from './facturation.service';

// Facture directe d'un lead (maquette Finances) : préparée en brouillon
// (« à valider CFO »), émise par le CFO — numéro et échéance à 15 jours.
function monter(o: { dossier?: object | null; facture?: object } = {}) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    dossierCrm: {
      findFirst: jest.fn().mockResolvedValue(o.dossier === undefined ? { id: 'D1', nature: 'mandat_client', archiveLe: null, projet: null } : o.dossier),
    },
    facture: {
      create: jest.fn().mockResolvedValue({ id: 'F1' }),
      findFirst: jest.fn().mockResolvedValue(o.facture ?? null),
      aggregate: jest.fn().mockResolvedValue({ _max: { numero: 41 } }),
      updateMany,
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const s = new FacturationService(prisma as unknown as PrismaService, {} as EmailService, {} as ReglagesService, {} as OuvertureProjetService);
  jest.spyOn(s, 'factureCentrale').mockResolvedValue({} as never);
  return { s, prisma, updateMany };
}

describe('FacturationService · facture directe d’un lead', () => {
  it('préparée en brouillon, rattachée au lead, total des lignes', async () => {
    const { s, prisma } = monter();
    await s.creerFactureDirecte('S1', { dossierCrmId: 'D1', lignes: [{ designation: 'CO0 · Diagnostic', montantHt: 100_000 }, { designation: 'Relevé', montantHt: 50_000 }] });
    const data = prisma.facture.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ dossierCrmId: 'D1', projetId: null, type: 'honoraires', montantHt: 150_000, libelle: 'CO0 · Diagnostic' });
    expect(data).not.toHaveProperty('statut'); // brouillon par défaut : ni envoyée ni comptée
    expect(data.lignes.create).toHaveLength(2);
  });

  it('lead archivé → 409 ; ligne vide → 400', async () => {
    await expect(monter({ dossier: { id: 'D1', nature: 'mandat_client', archiveLe: new Date(), projet: null } }).s.creerFactureDirecte('S1', { dossierCrmId: 'D1', lignes: [{ designation: 'x', montantHt: 1 }] })).rejects.toThrow(ConflictException);
    await expect(monter().s.creerFactureDirecte('S1', { dossierCrmId: 'D1', lignes: [{ designation: ' ', montantHt: 1 }] })).rejects.toThrow(BadRequestException);
  });

  it('validation CFO sans projet : numéro suivant, émise, échéance à 15 jours', async () => {
    const facture = { id: 'F1', projetId: null, dossierCrmId: 'D1', statut: 'brouillon', montantHt: new Prisma.Decimal(100_000), echeanceLe: null };
    const { s, updateMany } = monter({ facture });
    await s.emettreParId('S1', 'F1');
    const { data } = updateMany.mock.calls[0][0];
    expect(data).toMatchObject({ numero: 42, statut: 'emise' });
    const attendue = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    expect(data.echeanceLe).toBe(attendue);
  });

  it('déjà émise → 409', async () => {
    const { s } = monter({ facture: { id: 'F1', projetId: null, dossierCrmId: 'D1', statut: 'emise', montantHt: new Prisma.Decimal(1), echeanceLe: null } });
    await expect(s.emettreParId('S1', 'F1')).rejects.toThrow(ConflictException);
  });
});
