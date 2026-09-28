import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from './integration.service';

const DOSSIER = {
  id: 'D1', matricule: 'GH-0100', prenom: 'Awa', nom: 'Sarr', poste: 'CAD L3', typeContrat: 'stage',
  dateEntree: '2026-09-15', createdAt: new Date('2026-09-15T08:00:00Z'), confirmeLe: null, archiveLe: null,
  missionResultat: '', missionLivrables: '', missionKpi: '', missionSignalAlerte: '',
  societe: { nom: 'Grey Concrete' }, pointsIntegration: [] as { jalon: number; realiseLe: string; compteRendu: string }[],
};

function svc(dossier: object = {}) {
  const d = { ...DOSSIER, ...dossier };
  const prisma = {
    dossierPersonnel: {
      findUnique: jest.fn().mockResolvedValue(d),
      findMany: jest.fn().mockResolvedValue([d, { ...d, id: 'ANCIEN', dateEntree: '2023-03-06' }]),
      update: jest.fn().mockResolvedValue({ id: 'D1', confirmeLe: '2026-12-15' }),
    },
    pointIntegration: { upsert: jest.fn() },
  } as unknown as PrismaService;
  return { s: new IntegrationService(prisma), prisma };
}
const RH = { userId: 'U' };

describe('IntegrationService', () => {
  it("liste : seulement les nouveaux arrivants, avec les dates J30/J60/J90", async () => {
    const l = await svc().s.liste();
    expect(l.map((x) => x.id)).toEqual(['D1']);
    expect(l[0].points.map((p) => p.datePrevue)).toEqual(['2026-10-15', '2026-11-14', '2026-12-14']);
  });
  it('point : jalon inconnu, compte rendu vide ou date future refusés', async () => {
    const { s } = svc();
    await expect(s.enregistrerPoint(RH, 'D1', 45, { realiseLe: '2026-09-20', compteRendu: 'ok' })).rejects.toThrow(BadRequestException);
    await expect(s.enregistrerPoint(RH, 'D1', 30, { realiseLe: '2026-09-20', compteRendu: '  ' })).rejects.toThrow(BadRequestException);
    await expect(s.enregistrerPoint(RH, 'D1', 30, { realiseLe: '2999-01-01', compteRendu: 'ok' })).rejects.toThrow(BadRequestException);
  });
  it("point sur un salarié hors période d'intégration → 409", async () => {
    await expect(svc({ confirmeLe: '2026-01-01' }).s.enregistrerPoint(RH, 'D1', 30, { realiseLe: '2026-09-20', compteRendu: 'ok' })).rejects.toThrow(ConflictException);
  });
  it('confirmation : exige le point J90', async () => {
    await expect(svc().s.confirmer(RH, 'D1')).rejects.toThrow(ConflictException);
    const { s, prisma } = svc({ pointsIntegration: [{ jalon: 90, realiseLe: '2026-12-14', compteRendu: 'ok' }] });
    await expect(s.confirmer(RH, 'D1')).resolves.toMatchObject({ id: 'D1' });
    expect(prisma.dossierPersonnel.update).toHaveBeenCalled();
  });
});
