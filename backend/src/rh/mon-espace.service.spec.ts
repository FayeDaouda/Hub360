import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonEspaceService } from './mon-espace.service';
import { TachesService } from './taches.service';

const DOSSIER = {
  id: 'D1',
  matricule: 'GH-0001',
  prenom: 'Awa',
  nom: 'Ndiaye',
  poste: 'CAD L1',
  typeContrat: 'cdi',
  dateEntree: '2024-01-03',
  dateFin: null,
  dateNaissance: null,
  lieuNaissance: '',
  nationalite: 'Sénégalaise',
  numeroPiece: '',
  telephone: '77',
  emailPro: '',
  contactUrgence: '',
  modePaiement: 'virement',
  coordonneesPaiement: 'CBAO · SN012',
  numeroIpm: '',
  salaireBase: 450000,
  telephoneUrgence: '',
  emailPerso: '',
  situationFamiliale: null,
  enfantsACharge: 0,
  adresse: '',
  paiementDemandeMode: null,
  paiementDemandeCoordonnees: null,
  paiementDemandeLe: null,
  missionResultat: '',
  missionLivrables: '',
  missionKpi: '',
  missionSignalAlerte: '',
  societe: { nom: 'Grey Concrete' },
  collaborateur: null,
  pieces: [{ type: 'contrat_signe', nom: 'contrat.pdf', createdAt: new Date() }],
  bulletins: [{ mois: '2026-08', nom: 'bulletin-08.pdf', updatedAt: new Date() }],
  attestations: [],
};

function svc(dossier: object | null = DOSSIER, attestationsEnAttente = 0) {
  const prisma = {
    demandeAttestation: { count: jest.fn().mockResolvedValue(attestationsEnAttente), create: jest.fn() },
    dossierPersonnel: {
      findFirst: jest.fn().mockResolvedValue(dossier),
      findUniqueOrThrow: jest.fn().mockResolvedValue(dossier),
      update: jest.fn(),
    },
    pieceDossierPersonnel: {
      findUnique: jest.fn().mockResolvedValue({ nom: 'contrat.pdf', cle: 'data:application/pdf;base64,AA' }),
    },
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
  // Statistiques d'équipe : sans objet ici (aucun membre n'a de tâche).
  const taches = {
    statsEquipe: jest.fn().mockResolvedValue({
      total: 0,
      validees: 0,
      enCours: 0,
      enRetard: 0,
      respectDelais: { aTemps: 0, total: 0, pct: null },
    }),
  };
  return { s: new MonEspaceService(prisma, taches as unknown as TachesService), prisma };
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
    expect(prisma.dossierPersonnel.update).toHaveBeenCalledWith({
      where: { id: 'D1' },
      data: { telephone: '77 000 00 00' },
    });
  });
  it('document : pièce RH hors liste refusée, sans dossier → 404', async () => {
    await expect(svc().s.document({ userId: 'U' }, 'cv')).rejects.toThrow(NotFoundException);
    await expect(svc().s.document({ userId: 'U' }, 'contrat_signe')).resolves.toMatchObject({ nom: 'contrat.pdf' });
    await expect(svc(null).s.majCoordonnees({ userId: 'U' }, { telephone: '1' })).rejects.toThrow(NotFoundException);
  });
  it('ma cellule : chef et « moi » repérés ; sans cellule → null, compteurs à zéro', async () => {
    const { s } = svc({ ...DOSSIER, collaborateur: { id: 'C1', celluleId: 'CEL' } });
    const { cellule } = await s.maCellule({ userId: 'U' });
    expect(cellule?.membres).toEqual([
      expect.objectContaining({ nom: 'Awa Ndiaye', estMoi: true, estChef: false }),
      expect.objectContaining({ nom: 'Moussa Diop', estMoi: false, estChef: true }),
    ]);
    expect(cellule?.projets).toEqual([expect.objectContaining({ code: 'PN_S.26' })]);
    await expect(svc().s.maCellule({ userId: 'U' })).resolves.toEqual({
      cellule: null,
      stats: expect.objectContaining({ enCours: 0 }),
    });
  });

  it('moyen de paiement : la demande attend la RH ; identique à celui en service → 409', async () => {
    const { s: service, prisma } = svc();
    await service.demanderPaiement({ userId: 'U' }, { modePaiement: 'wave', coordonneesPaiement: ' 77 100 00 09 ' });
    const data = (prisma.dossierPersonnel.update as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ paiementDemandeMode: 'wave', paiementDemandeCoordonnees: '77 100 00 09' });
    expect(data).not.toHaveProperty('modePaiement');
    await expect(
      service.demanderPaiement({ userId: 'U' }, { modePaiement: 'virement', coordonneesPaiement: 'CBAO · SN012' }),
    ).rejects.toThrow('déjà');
  });

  it('mes informations : champs saisis enregistrés tels quels (texte nettoyé)', async () => {
    const { s: service, prisma } = svc();
    await service.majCoordonnees(
      { userId: 'U' },
      { adresse: ' Sacré-Cœur 3 ', enfantsACharge: 2, situationFamiliale: 'marie' },
    );
    expect((prisma.dossierPersonnel.update as jest.Mock).mock.calls[0][0].data).toMatchObject({
      adresse: 'Sacré-Cœur 3',
      enfantsACharge: 2,
      situationFamiliale: 'marie',
    });
  });

  it('attestation de travail : une demande à la fois, la RH la délivre', async () => {
    const { s: service, prisma } = svc();
    await service.demanderAttestation({ userId: 'U' });
    expect((prisma.demandeAttestation.create as jest.Mock).mock.calls[0][0]).toEqual({ data: { dossierId: 'D1' } });
    await expect(svc(DOSSIER, 1).s.demanderAttestation({ userId: 'U' })).rejects.toThrow('déjà demandée');
  });
});
