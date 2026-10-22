import { BadRequestException } from '@nestjs/common';
import { PilotageService } from './pilotage.service';

// Registre des décisions (revue CTO, 21/10/2026) : responsable toujours
// titulaire d'un compte HUB, rattachement facultatif à un seul élément.
describe('PilotageService.saisir · registre', () => {
  function svc(o: { collaborateur?: unknown; titulaires?: string[]; projets?: number } = {}) {
    const prisma = {
      collaborateur: { findFirst: jest.fn().mockResolvedValue(o.collaborateur ?? null) },
      projet: { count: jest.fn().mockResolvedValue(o.projets ?? 1) },
      cellule: { count: jest.fn().mockResolvedValue(1) },
      client: { count: jest.fn().mockResolvedValue(1) },
      decisionRegistre: { aggregate: jest.fn().mockResolvedValue({ _max: { numero: 2 } }), create: jest.fn() },
    };
    const notifications = { titulairesRole: jest.fn().mockResolvedValue(o.titulaires ?? ['DG']), comptesDe: jest.fn().mockResolvedValue(['U1']), envoyer: jest.fn() };
    const s = new PilotageService(prisma as never, {} as never, {} as never, {} as never, notifications as never, {} as never, {} as never);
    jest.spyOn(s, 'vue').mockResolvedValue({} as never);
    return { s, prisma, notifications };
  }
  const cto = { userId: 'CTO', societeId: 'S1', role: 'CTO (transverse)' };
  const base = { instance: 'CODIR' as const, texte: 'Réorganiser la cellule ARC-02', echeance: '2026-12-31' };

  it('responsable sans compte HUB actif : refusé', async () => {
    const { s } = svc({ collaborateur: { id: 'C1', prenom: 'Ousmane', nom: 'Bâ', utilisateur: null, dossierPersonnel: null } });
    await expect(s.saisir(cto, { ...base, responsableCollaborateurId: 'C1' })).rejects.toThrow('n’a pas de compte HUB actif');
  });

  it('rôle sans titulaire : refusé ; rôle pourvu : prévenu', async () => {
    await expect(svc({ titulaires: [] }).s.saisir(cto, { ...base, responsableRole: 'Dir. GC' })).rejects.toThrow(BadRequestException);
    const { s, notifications, prisma } = svc();
    await s.saisir(cto, { ...base, responsableRole: 'Dir. GC', projetId: 'P1' });
    expect(prisma.decisionRegistre.create).toHaveBeenCalledWith({ data: expect.objectContaining({ numero: 3, projetId: 'P1', celluleId: null, clientId: null, responsableRole: 'Dir. GC' }) });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'decision_assignee', destinataireIds: ['DG'] }));
  });

  it('rattachement : un seul élément, de la société', async () => {
    await expect(svc().s.saisir(cto, { ...base, responsableRole: 'Dir. GC', projetId: 'P1', clientId: 'CL1' })).rejects.toThrow('un seul élément');
    await expect(svc({ projets: 0 }).s.saisir(cto, { ...base, responsableRole: 'Dir. GC', projetId: 'PX' })).rejects.toThrow('introuvable');
  });
});
