import { RecrutementService } from './recrutement.service';

// Données personnelles : une candidature refusée s'efface 12 mois après le refus.
describe('RecrutementService · effacement à 12 mois', () => {
  it('efface les candidatures refusées depuis plus de 12 mois, et elles seules', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const s = new RecrutementService({ candidature: { deleteMany } } as never, {} as never, {} as never);
    await s.purger(new Date('2026-11-02T03:30:00Z'));
    expect(deleteMany).toHaveBeenCalledWith({
      where: { etape: 'refusee', decideLe: { lt: new Date('2025-11-02T03:30:00Z') } },
    });
  });
});

// Côté RH (01/11/2026) : deux chemins, entretien dans l'Agenda, suivi.
describe('RecrutementService · côté RH', () => {
  const moi = (permissions: Record<string, string> = {}) => ({
    userId: 'RH1',
    societeId: 'S1',
    role: 'RH',
    permissions,
  });
  const monter = () => {
    const tx = {
      rendezVous: { updateMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'RDV2', lieu: 'Salle A' }) },
      candidature: { update: jest.fn() },
    };
    const prisma = {
      posteRecrutement: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      candidature: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'C1',
          prenom: 'Awa',
          nom: 'Diop',
          etape: 'candidature',
          rendezVousId: 'RDV1',
          posteId: 'P1',
          poste: { intitule: 'Architecte', demandeParId: 'DG' },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      utilisateurSocieteRole: {
        findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'DG' }, { utilisateurId: 'U3' }]),
      },
      roleRight: { findMany: jest.fn().mockResolvedValue([]) },
      utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((f: (t: typeof tx) => unknown) => f(tx)),
    };
    const notifications = { envoyer: jest.fn() };
    const dossiers = { creer: jest.fn().mockResolvedValue({ id: 'D1' }) };
    return {
      s: new RecrutementService(prisma as never, notifications as never, dossiers as never),
      prisma,
      tx,
      notifications,
      dossiers,
    };
  };

  it('embauche directe : le dossier s’ouvre et l’embauche reste tracée (poste pourvu, candidature embauchée)', async () => {
    const { s, prisma, dossiers } = monter();
    const r = await s.embaucheDirecte(moi(), {
      prenom: 'Moussa',
      nom: 'Sow',
      intitule: 'Conducteur de travaux',
      dateEntree: '2026-12-01',
    });
    expect(r).toEqual({ ok: true, dossierId: 'D1' });
    expect(dossiers.creer).toHaveBeenCalledWith(
      expect.objectContaining({ societeId: 'S1', poste: 'Conducteur de travaux', dateEntree: '2026-12-01' }),
      'RH1',
    );
    const data = prisma.posteRecrutement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ statut: 'pourvu', direct: true });
    expect(data.candidatures.create).toMatchObject({ etape: 'embauche', dossierId: 'D1' });
  });

  it('entretien : un rendez-vous de l’Agenda, le demandeur invité d’office, l’ancien annulé', async () => {
    const { s, tx, notifications } = monter();
    await s.planifierEntretien(moi(), 'C1', {
      debut: '2026-11-04T10:00:00.000Z',
      fin: '2026-11-04T11:00:00.000Z',
      lieu: 'Salle A',
      inviteIds: ['U3'],
    });
    expect(tx.rendezVous.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'RDV1', annuleLe: null } }),
    );
    expect(tx.rendezVous.create.mock.calls[0][0].data.invites.create).toEqual([
      { utilisateurId: 'DG' },
      { utilisateurId: 'U3' },
    ]);
    expect(tx.candidature.update).toHaveBeenCalledWith({
      where: { id: 'C1' },
      data: { rendezVousId: 'RDV2', etape: 'entretien' },
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'entretien_planifie', destinataireIds: ['DG', 'U3'] }),
    );
  });

  it('« À votre attention » suit la matrice : rien sans Validation des postes ni décision', async () => {
    const { s, prisma } = monter();
    expect(await s.aTraiter(moi({ 'recrutement.postes': 'L' }))).toEqual({ postes: [], candidats: [] });
    expect(prisma.posteRecrutement.findMany).not.toHaveBeenCalled();
    await s.aTraiter(moi({ 'recrutement.postes': 'LV', 'recrutement.decision': 'V' }));
    expect(prisma.posteRecrutement.findMany).toHaveBeenCalled();
    expect(prisma.candidature.findMany).toHaveBeenCalled();
  });
});
