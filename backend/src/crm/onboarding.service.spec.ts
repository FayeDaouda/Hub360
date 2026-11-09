import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { ProjectOpeningService } from '../projects/project-opening.service';
import { ReglagesService } from '../reglages/reglages.service';
import { OnboardingService } from './onboarding.service';

// Ouverture du projet à l'Onboard (30/10/2026) : selon le réglage, et sans
// jamais faire échouer l'acceptation du client.
describe('OnboardingService.openIfDue', () => {
  function svc(o: { quand?: string; plan?: object | null; echec?: boolean }) {
    const tx = {};
    const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    const opening = {
      prepare: o.echec
        ? jest.fn().mockRejectedValue(new Error('gabarit illisible'))
        : jest.fn().mockResolvedValue(o.plan === undefined ? { projectId: 'P1' } : o.plan),
      save: jest.fn().mockResolvedValue(true),
    };
    const reglages = { regle: jest.fn().mockResolvedValue(o.quand ?? 'onboard') };
    return {
      opening,
      s: new OnboardingService(
        prisma as unknown as PrismaService,
        {} as FacturationService,
        opening as unknown as ProjectOpeningService,
        reglages as unknown as ReglagesService,
      ),
    };
  }

  it('à l’acceptation de l’offre (défaut) : le gabarit est recopié, le projet s’ouvre', async () => {
    const { s, opening } = svc({});
    await expect(s.openIfDue('S1', 'P1')).resolves.toBe(true);
    expect(opening.save).toHaveBeenCalledWith({}, { projectId: 'P1' });
  });

  it('réglage « à l’émission de F1 » : rien à l’Onboard', async () => {
    const { s, opening } = svc({ quand: 'emission_f1' });
    await expect(s.openIfDue('S1', 'P1')).resolves.toBe(false);
    expect(opening.prepare).not.toHaveBeenCalled();
  });

  it('catégorie sans gabarit (ou déjà ouvert) : rien', async () => {
    const { s, opening } = svc({ plan: null });
    await expect(s.openIfDue('S1', 'P1')).resolves.toBe(false);
    expect(opening.save).not.toHaveBeenCalled();
  });

  it('un échec d’ouverture ne remonte pas (l’acceptation reste acquise)', async () => {
    const { s } = svc({ echec: true });
    await expect(s.openIfDue('S1', 'P1')).resolves.toBe(false);
  });
});

// Onboard d'un dossier (transaction pivot) : depuis le 09/11/2026 le type de
// projet n'est plus demandé — repris tel quel s'il existe (dossier antérieur),
// null sinon ; la catégorie reste exigée.
describe('OnboardingService.onboard · catégorie exigée, type de projet facultatif', () => {
  const DOSSIER = {
    id: 'D1',
    societeId: 'S1',
    code: 'CM_YOF.26',
    nature: 'mandat_client',
    categorie: 'conception',
    programme: 'Local commercial R+1 · 2 commerces',
    localisation: 'Yoff',
    latitude: null,
    longitude: null,
    type: null as string | null,
    clientId: 'C1',
    statut: 'offre_envoyee',
    projet: null,
  };

  function monter(dossier: Partial<typeof DOSSIER>) {
    const tx = {
      dossierCrm: {
        findFirst: jest.fn().mockResolvedValue({ ...DOSSIER, ...dossier }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dossierCrmTransition: { create: jest.fn().mockResolvedValue({}) },
      devis: {
        findFirst: jest.fn().mockResolvedValue({ id: 'O1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      projet: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...data,
            id: 'P1',
            statut: 'actif',
            createdAt: new Date(0),
            client: { id: 'C1', nom: 'X', type: 'particulier' },
            cellules: [],
          }),
        ),
      },
      facture: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const facturation = { preparerDepuisOffre: jest.fn().mockResolvedValue(3) };
    const s = new OnboardingService(
      {} as PrismaService,
      facturation as unknown as FacturationService,
      {} as ProjectOpeningService,
      {} as ReglagesService,
    );
    const onboard = () => s.onboard(tx as never, 'S1', 'D1', 'U1', 'offre acceptée par le client');
    return { tx, facturation, onboard };
  }

  it('ouvre le projet d’un dossier sans type de projet (type null repris)', async () => {
    const { tx, facturation, onboard } = monter({ type: null });
    const r = await onboard();
    expect(tx.projet.create).toHaveBeenCalledTimes(1);
    expect(tx.projet.create.mock.calls[0][0].data).toMatchObject({
      societeId: 'S1',
      dossierCrmId: 'D1',
      categorie: 'conception',
      type: null,
      phase: 'avant_projet',
    });
    expect(tx.devis.update).toHaveBeenCalledWith({
      where: { id: 'O1' },
      data: { projetId: 'P1', statut: 'transforme' },
    });
    expect(facturation.preparerDepuisOffre).toHaveBeenCalled();
    expect(r.projet.type).toBeNull();
    expect(r.facturesPreparees).toBe(3);
  });

  it('reprend le type de projet d’un dossier antérieur qui en a un', async () => {
    const { tx, onboard } = monter({ type: 'hotelier' });
    const r = await onboard();
    expect(tx.projet.create.mock.calls[0][0].data.type).toBe('hotelier');
    expect(r.projet.type).toBe('hotelier');
  });

  it('refuse sans catégorie (409) et ne bascule rien ni ne crée de projet', async () => {
    const { tx, onboard } = monter({ categorie: null as unknown as string });
    await expect(onboard()).rejects.toThrow(ConflictException);
    await expect(onboard()).rejects.toThrow('catégorie requise');
    expect(tx.dossierCrm.updateMany).not.toHaveBeenCalled();
    expect(tx.dossierCrmTransition.create).not.toHaveBeenCalled();
    expect(tx.projet.create).not.toHaveBeenCalled();
  });

  it('refuse sans catégorie même quand le type de projet est renseigné', async () => {
    const { tx, onboard } = monter({ categorie: null as unknown as string, type: 'villa' });
    await expect(onboard()).rejects.toThrow('catégorie requise');
    expect(tx.projet.create).not.toHaveBeenCalled();
  });
});
