import { AdministrationService } from './administration.service';

// « À traiter aujourd'hui » du CIO (revue CIO, 22/10/2026).
describe('AdministrationService.aTraiter', () => {
  const recent = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const compte = (id: string, role: string, o: Record<string, unknown> = {}) => ({
    role: { nom: role },
    utilisateur: { id, prenom: id, nom: 'X', email: `${id}@gc.sn`, motDePasseHash: 'h', totpActifLe: null, invitations: [], ...o },
  });
  const prisma = {
    signalement: { findMany: jest.fn().mockResolvedValue([]) },
    demandeDroit: { findMany: jest.fn().mockResolvedValue([]) },
    utilisateurSocieteRole: {
      findMany: jest.fn().mockResolvedValue([
        compte('CFO', 'CFO'),
        compte('SAL', 'Salarié'),
        compte('SAL2', 'Salarié', { totpActifLe: new Date() }),
        compte('NEW', 'Salarié', { motDePasseHash: null, invitations: [{ expiresAt: new Date(Date.now() - 86_400_000), usedAt: null, createdAt: new Date() }] }),
      ]),
    },
    cellule: {
      findMany: jest.fn().mockResolvedValue([{ code: 'GC-ARC-02', dispatcher: { id: 'C1', prenom: 'Ousmane', nom: 'Bâ', utilisateurId: null, utilisateur: null, dossierPersonnel: null } }]),
    },
    dossierPersonnel: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'D1', prenom: 'Ousmane', nom: 'Bâ', poste: 'Architecte', dateEntree: null, createdAt: new Date(), collaborateurId: 'C1' },
        { id: 'D2', prenom: 'Awa', nom: 'Diouf', poste: 'Architecte', dateEntree: recent, createdAt: new Date(), collaborateurId: null },
        { id: 'D3', prenom: 'Malick', nom: 'Sy', poste: 'Ingénieur', dateEntree: '2025-01-10', createdAt: new Date(), collaborateurId: null },
      ]),
    },
  };

  it('double authentification de la direction, invitation expirée, chef sans compte, arrivées', async () => {
    const r = await new AdministrationService(prisma as never).aTraiter('S1');
    const par = (t: string) => r.filter((e) => e.type === t);
    expect(par('double_facteur')).toEqual([expect.objectContaining({ titre: 'Double authentification non activée · 1 compte', ton: 'risque' })]);
    expect(par('invitation')).toEqual([expect.objectContaining({ ton: 'risque', detail: expect.stringContaining('expirée') })]);
    expect(par('chef_sans_compte').map((e) => e.titre)).toEqual(['Chef de cellule sans compte HUB · Ousmane Bâ']);
    // Le chef n'est pas répété ; l'arrivée récente seule, les autres regroupés.
    expect(par('salarie_sans_compte').map((e) => e.titre)).toEqual(['Nouvel arrivant sans compte HUB · Awa Diouf', '1 salarié sans compte HUB']);
  });
});
