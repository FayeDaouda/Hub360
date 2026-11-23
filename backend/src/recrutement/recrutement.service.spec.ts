import { RecrutementService } from './recrutement.service';

// Données personnelles : une candidature refusée s'efface 12 mois après le refus.
describe('RecrutementService · effacement à 12 mois', () => {
  it('efface les candidatures refusées depuis plus de 12 mois, et elles seules', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const s = new RecrutementService(
      { candidature: { deleteMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
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
      rendezVous: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'RDV2', lieu: 'Salle A' }),
      },
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
    const email = { envoyerCandidat: jest.fn().mockResolvedValue({ envoye: true }) };
    const invitations = { envoyer: jest.fn().mockResolvedValue(1) };
    return {
      s: new RecrutementService(
        prisma as never,
        notifications as never,
        dossiers as never,
        email as never,
        invitations as never,
      ),
      invitations,
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
      expect.objectContaining({ where: { id: 'RDV1', annuleLe: null, debut: { gt: expect.any(Date) } } }),
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

  it('replanifier : l’ancien rendez-vous part en annulation, puis le nouveau en invitation', async () => {
    const { s, invitations } = monter();
    const r = await s.planifierEntretien(moi(), 'C1', {
      debut: '2026-11-04T10:00:00.000Z',
      fin: '2026-11-04T11:00:00.000Z',
      inviteIds: ['U3'],
    });
    expect(r).toEqual({ ok: true, rendezVousId: 'RDV2' });
    expect(invitations.envoyer.mock.calls).toEqual([
      ['RDV1', 'CANCEL'],
      ['RDV2', 'REQUEST'],
    ]);
  });

  it('replanifier : l’ancien rendez-vous passe à la version suivante avec son annulation (SEQUENCE iCalendar)', async () => {
    const { s, tx } = monter();
    await s.planifierEntretien(moi(), 'C1', {
      debut: '2026-11-04T10:00:00.000Z',
      fin: '2026-11-04T11:00:00.000Z',
    });
    const { data } = tx.rendezVous.updateMany.mock.calls[0][0];
    expect(data).toEqual({ annuleLe: expect.any(Date), sequence: { increment: 1 } });
    // Le nouveau rendez-vous part en version 0 (valeur par défaut en base).
    expect(tx.rendezVous.create.mock.calls[0][0].data).not.toHaveProperty('sequence');
  });

  it('replanifier un entretien déjà annulé ou passé : aucune annulation ne repart', async () => {
    const { s, tx, invitations } = monter();
    tx.rendezVous.updateMany.mockResolvedValueOnce({ count: 0 });
    await s.planifierEntretien(moi(), 'C1', {
      debut: '2026-11-04T10:00:00.000Z',
      fin: '2026-11-04T11:00:00.000Z',
      inviteIds: ['U3'],
    });
    expect(invitations.envoyer.mock.calls).toEqual([['RDV2', 'REQUEST']]);
  });

  it('premier entretien : seule l’invitation du nouveau rendez-vous part, aucune annulation', async () => {
    const { s, prisma, tx, invitations } = monter();
    prisma.candidature.findFirst.mockResolvedValueOnce({
      id: 'C1',
      prenom: 'Awa',
      nom: 'Diop',
      etape: 'candidature',
      rendezVousId: null,
      posteId: 'P1',
      poste: { intitule: 'Architecte', demandeParId: 'DG' },
    });
    await s.planifierEntretien(moi(), 'C1', {
      debut: '2026-11-04T10:00:00.000Z',
      fin: '2026-11-04T11:00:00.000Z',
    });
    expect(tx.rendezVous.updateMany).not.toHaveBeenCalled();
    expect(invitations.envoyer.mock.calls).toEqual([['RDV2', 'REQUEST']]);
  });

  it('entretien refusé (fin avant début, candidature décidée) : aucune invitation ne part', async () => {
    const { s, prisma, invitations } = monter();
    await expect(
      s.planifierEntretien(moi(), 'C1', { debut: '2026-11-04T11:00:00.000Z', fin: '2026-11-04T10:00:00.000Z' }),
    ).rejects.toThrow('La fin doit suivre le début.');
    prisma.candidature.findFirst.mockResolvedValueOnce({
      id: 'C1',
      prenom: 'Awa',
      nom: 'Diop',
      etape: 'refusee',
      rendezVousId: 'RDV1',
      posteId: 'P1',
      poste: { intitule: 'Architecte', demandeParId: 'DG' },
    });
    await expect(
      s.planifierEntretien(moi(), 'C1', { debut: '2026-11-04T10:00:00.000Z', fin: '2026-11-04T11:00:00.000Z' }),
    ).rejects.toThrow('Candidature déjà décidée.');
    expect(invitations.envoyer).not.toHaveBeenCalled();
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
