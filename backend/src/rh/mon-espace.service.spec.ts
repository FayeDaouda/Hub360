import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonEspaceService } from './mon-espace.service';

const DOSSIER = {
  id: 'D1', matricule: 'GH-0001', prenom: 'Awa', nom: 'Ndiaye', poste: 'CAD L1', typeContrat: 'cdi', dateEntree: '2024-01-03',
  dateFin: null, dateNaissance: null, lieuNaissance: '', nationalite: 'Sénégalaise', numeroPiece: '', telephone: '77',
  emailPro: '', contactUrgence: '', modePaiement: 'virement', coordonneesPaiement: '', numeroIpm: '', salaireBase: 450000,
  missionResultat: '', missionLivrables: '', missionKpi: '', missionSignalAlerte: '',
  societe: { nom: 'Grey Concrete' }, collaborateur: null, pieces: [{ type: 'contrat_signe', nom: 'contrat.pdf', createdAt: new Date() }],
  bulletins: [{ mois: '2026-08', nom: 'bulletin-08.pdf', updatedAt: new Date() }],
};

function svc(dossier: object | null = DOSSIER) {
  const prisma = {
    dossierPersonnel: { findFirst: jest.fn().mockResolvedValue(dossier), update: jest.fn() },
    pieceDossierPersonnel: { findUnique: jest.fn().mockResolvedValue({ nom: 'contrat.pdf', cle: 'data:application/pdf;base64,AA' }) },
    collaborateur: { findFirst: jest.fn().mockResolvedValue(null) },
    cellule: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        nom: 'Cellule Études',
        dispatcherId: 'C2',
        membres: [
          { id: 'C1', prenom: 'Awa', nom: 'Ndiaye', role: 'Architecte', niveau: 'junior' },
          { id: 'C2', prenom: 'Moussa', nom: 'Diop', role: 'Architecte', niveau: 'senior' },
        ],
        projets: [{ projet: { id: 'P1', code: 'PN_S.26', programme: 'Villa', phase: 'permis' } }],
      }),
    },
  } as unknown as PrismaService;
  return { s: new MonEspaceService(prisma), prisma };
}

describe('MonEspaceService', () => {
  it('profil : sans salaire, documents du salarié seulement, carte de mission vide omise', async () => {
    const { dossier } = await svc().s.profil({ userId: 'U' });
    expect(dossier).not.toHaveProperty('salaireBase');
    expect(dossier?.documents.map((d) => d.type)).toEqual(['contrat_signe', 'fiche_poste']);
    expect(dossier?.documents[1].nom).toBeNull();
    expect(dossier?.mission).toBeNull();
    expect(dossier?.bulletins).toEqual([expect.objectContaining({ mois: '2026-08', nom: 'bulletin-08.pdf' })]);
  });
  it('profil sans dossier : null, pas d’erreur', async () => {
    await expect(svc(null).s.profil({ userId: 'U' })).resolves.toEqual({ dossier: null });
  });
  it('coordonnées : seuls téléphone et contact d’urgence sont écrits', async () => {
    const { s, prisma } = svc();
    await s.majCoordonnees({ userId: 'U' }, { telephone: ' 77 000 00 00 ' });
    expect(prisma.dossierPersonnel.update).toHaveBeenCalledWith({ where: { id: 'D1' }, data: { telephone: '77 000 00 00' } });
  });
  it('document : pièce RH hors liste refusée, sans dossier → 404', async () => {
    await expect(svc().s.document({ userId: 'U' }, 'cv')).rejects.toThrow(NotFoundException);
    await expect(svc().s.document({ userId: 'U' }, 'contrat_signe')).resolves.toMatchObject({ nom: 'contrat.pdf' });
    await expect(svc(null).s.majCoordonnees({ userId: 'U' }, { telephone: '1' })).rejects.toThrow(NotFoundException);
  });
  it('ma cellule : chef et « moi » repérés ; sans cellule → null', async () => {
    const { s } = svc({ ...DOSSIER, collaborateur: { id: 'C1', celluleId: 'CEL' } });
    const { cellule } = await s.maCellule({ userId: 'U' });
    expect(cellule?.membres).toEqual([
      expect.objectContaining({ nom: 'Awa Ndiaye', estMoi: true, estChef: false }),
      expect.objectContaining({ nom: 'Moussa Diop', estMoi: false, estChef: true }),
    ]);
    expect(cellule?.projets).toEqual([expect.objectContaining({ code: 'PN_S.26' })]);
    await expect(svc().s.maCellule({ userId: 'U' })).resolves.toEqual({ cellule: null });
  });
});
