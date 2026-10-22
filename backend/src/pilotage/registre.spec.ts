import { BadRequestException } from '@nestjs/common';
import { PilotageService } from './pilotage.service';

// Registre des décisions (revue CTO, 21/10/2026) : responsable toujours
// titulaire d'un compte HUB, rattachement facultatif à un seul élément.
describe('PilotageService.saisir · registre', () => {
  function svc(o: { collaborateur?: unknown; titulaires?: string[]; projets?: number; decision?: unknown } = {}) {
    const prisma = {
      collaborateur: { findFirst: jest.fn().mockResolvedValue(o.collaborateur ?? null) },
      projet: { count: jest.fn().mockResolvedValue(o.projets ?? 1) },
      cellule: { count: jest.fn().mockResolvedValue(1) },
      client: { count: jest.fn().mockResolvedValue(1) },
      delegationCeo: { findFirst: jest.fn().mockResolvedValue(null) }, // aucune délégation du CEO
      decisionRegistre: {
        aggregate: jest.fn().mockResolvedValue({ _max: { numero: 2 } }),
        create: jest.fn(({ data }: { data: { numero: number } }) => Promise.resolve(data)),
        findFirst: jest.fn().mockResolvedValue(o.decision ?? null),
        update: jest.fn(),
      },
    };
    const notifications = { titulairesRole: jest.fn().mockResolvedValue(o.titulaires ?? ['DG']), comptesDe: jest.fn().mockResolvedValue(['U1']), envoyer: jest.fn() };
    const s = new PilotageService(prisma as never, {} as never, {} as never, {} as never, notifications as never, {} as never, {} as never, {} as never);
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

// Revue CTO (22/10/2026) : le CTO propose, le CEO accepte, modifie ou refuse.
describe('PilotageService · décisions proposées', () => {
  function svc(decision?: unknown) {
    const prisma = {
      collaborateur: { findFirst: jest.fn() },
      delegationCeo: { findFirst: jest.fn().mockResolvedValue(null) }, // aucune délégation du CEO
      decisionRegistre: {
        aggregate: jest.fn().mockResolvedValue({ _max: { numero: 4 } }),
        create: jest.fn(({ data }: { data: { numero: number } }) => Promise.resolve(data)),
        findFirst: jest.fn().mockResolvedValue(decision ?? null),
        update: jest.fn(),
      },
    };
    const notifications = {
      titulairesRole: jest.fn((_s: string, r: string) => Promise.resolve(r === 'CEO (transverse)' ? ['CEO1'] : ['DG'])),
      comptesDe: jest.fn().mockResolvedValue(['U1']),
      envoyer: jest.fn(),
    };
    const s = new PilotageService(prisma as never, {} as never, {} as never, {} as never, notifications as never, {} as never, {} as never, {} as never);
    jest.spyOn(s, 'vue').mockResolvedValue({} as never);
    return { s, prisma, notifications };
  }
  const cto = { userId: 'CTO', societeId: 'S1', role: 'CTO (transverse)' };
  const ceo = { userId: 'CEO1', societeId: 'S1', role: 'CEO (transverse)' };
  const base = { instance: 'CODIR' as const, texte: 'Recruter un CAD L3 pour ARC-04', echeance: '2099-12-31', responsableRole: 'Dir. GC' };
  const proposee = { id: 'D5', societeId: 'S1', numero: 5, texte: base.texte, echeance: '2099-12-31', responsable: 'Direction GC', responsableRole: 'Dir. GC', responsableCollaborateurId: null, proposition: 'proposee', creeParId: 'CTO' };

  it('le CTO propose : le CEO est prévenu, pas le responsable ; le CEO ne propose pas', async () => {
    const { s, prisma, notifications } = svc();
    await s.saisir(cto, { ...base, proposer: true });
    expect(prisma.decisionRegistre.create).toHaveBeenCalledWith({ data: expect.objectContaining({ proposition: 'proposee', numero: 5 }) });
    expect(notifications.envoyer).toHaveBeenCalledTimes(1);
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'decision_proposee', destinataireIds: ['CEO1'], titre: expect.stringContaining('D-005') }));
    await expect(svc().s.saisir(ceo, { ...base, proposer: true })).rejects.toThrow('réservé au CTO et au COO');
  });

  it('le COO propose (titre « par le COO ») mais n’inscrit pas directement', async () => {
    const coo = { userId: 'COO1', societeId: 'S1', role: 'COO' };
    const { s, notifications } = svc();
    await s.saisir(coo, { ...base, proposer: true });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'decision_proposee', titre: expect.stringContaining('proposée par le COO') }));
    await expect(svc().s.saisir(coo, base)).rejects.toThrow('proposez-la-lui');
  });

  it('seul le CEO arbitre ; une décision déjà tranchée n’attend plus rien', async () => {
    await expect(svc(proposee).s.arbitrer(cto, 'D5', { issue: 'accepter' })).rejects.toThrow('Seul le CEO');
    await expect(svc({ ...proposee, proposition: 'acceptee' }).s.arbitrer(ceo, 'D5', { issue: 'accepter' })).rejects.toThrow('n’attend pas');
  });

  it('acceptée : en vigueur ce jour, responsable et CTO prévenus ; échéance passée refusée', async () => {
    const { s, prisma, notifications } = svc(proposee);
    await s.arbitrer(ceo, 'D5', { issue: 'accepter' });
    expect(prisma.decisionRegistre.update).toHaveBeenCalledWith({ where: { id: 'D5' }, data: expect.objectContaining({ proposition: 'acceptee', arbitreParId: 'CEO1' }) });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'decision_assignee', destinataireIds: ['DG'] }));
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'decision_arbitree', destinataireIds: ['CTO'], titre: expect.stringContaining('acceptée par le CEO') }));
    await expect(svc({ ...proposee, echeance: '2020-01-01' }).s.arbitrer(ceo, 'D5', { issue: 'accepter' })).rejects.toThrow('modifiez-la');
  });

  it('modifiée : la proposition d’origine reste tracée ; sans changement, refusée', async () => {
    const { s, prisma, notifications } = svc(proposee);
    await s.arbitrer(ceo, 'D5', { issue: 'modifier', echeance: '2099-06-30' });
    expect(prisma.decisionRegistre.update).toHaveBeenCalledWith({
      where: { id: 'D5' },
      data: expect.objectContaining({ echeance: '2099-06-30', proposeeInitiale: { texte: base.texte, responsable: 'Direction GC', echeance: '2099-12-31' } }),
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'decision_arbitree', titre: expect.stringContaining('avec modifications') }));
    await expect(svc(proposee).s.arbitrer(ceo, 'D5', { issue: 'modifier', texte: base.texte })).rejects.toThrow('Rien n’a été modifié');
  });

  it('refusée : motif obligatoire, le CTO est prévenu, personne d’autre', async () => {
    await expect(svc(proposee).s.arbitrer(ceo, 'D5', { issue: 'refuser' })).rejects.toThrow('motif');
    const { s, prisma, notifications } = svc(proposee);
    await s.arbitrer(ceo, 'D5', { issue: 'refuser', motif: 'Budget 2027 non arrêté' });
    expect(prisma.decisionRegistre.update).toHaveBeenCalledWith({ where: { id: 'D5' }, data: expect.objectContaining({ proposition: 'refusee', motifArbitrage: 'Budget 2027 non arrêté' }) });
    expect(notifications.envoyer).toHaveBeenCalledTimes(1);
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'decision_arbitree', destinataireIds: ['CTO'] }));
  });
});
