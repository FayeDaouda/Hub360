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
