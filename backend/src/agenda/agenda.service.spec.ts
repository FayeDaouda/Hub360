import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AgendaService } from './agenda.service';

const svc = () => {
  const prisma = {
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2' }]) },
    utilisateur: {
      findUnique: jest.fn().mockResolvedValue({ id: 'U9', prenom: 'A', nom: 'B' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rendezVous: {
      create: jest.fn().mockResolvedValue({ id: 'R1', titre: 'Point' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    tacheProjet: { findMany: jest.fn().mockResolvedValue([]) },
    candidature: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    inviteRendezVous: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
    demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // Transaction interactive : le rappel reçoit le même faux client.
  prisma.$transaction.mockImplementation((f: (tx: typeof prisma) => unknown) => f(prisma));
  const notifications = { envoyer: jest.fn() };
  const demandes = { aValider: jest.fn().mockResolvedValue([]) };
  const invitations = { envoyer: jest.fn().mockResolvedValue(1) };
  return {
    s: new AgendaService(prisma as never, notifications as never, demandes as never, invitations as never),
    prisma,
    notifications,
    demandes,
    invitations,
  };
};
const moi = (permissions: Record<string, string>) => ({ userId: 'U1', societeId: 'S1', role: 'Salarié', permissions });
const rdv = { titre: 'Point', debut: '2026-11-03T10:00:00.000Z', fin: '2026-11-03T11:00:00.000Z' };

// Agenda (lot 11, 01/11/2026).
describe('AgendaService', () => {
  it('la fin doit suivre le début', async () => {
    await expect(svc().s.creer(moi({ agenda: 'LES' }), { ...rdv, fin: rdv.debut })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('inviter demande l’Écriture de « Réunions » ; avec elle, les invités sont prévenus', async () => {
    await expect(svc().s.creer(moi({ agenda: 'LES' }), { ...rdv, inviteIds: ['U2'] })).rejects.toThrow(
      ForbiddenException,
    );
    const { s, notifications, invitations } = svc();
    await s.creer(moi({ agenda: 'LES', 'agenda.reunions': 'E' }), { ...rdv, inviteIds: ['U2'] });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rdv_invitation', destinataireIds: ['U2'] }),
    );
    // Et l'invitation part par e-mail, vers leur agenda personnel (12/11/2026).
    expect(invitations.envoyer).toHaveBeenCalledWith('R1', 'REQUEST');
  });

  it('un rendez-vous sans invité ne déclenche aucun e-mail', async () => {
    const { s, prisma, invitations } = svc();
    prisma.utilisateurSocieteRole.findMany.mockResolvedValue([]);
    await s.creer(moi({ agenda: 'LES' }), rdv);
    expect(invitations.envoyer).not.toHaveBeenCalled();
  });

  it('annuler une réunion envoie l’annulation aux invités ; seul l’organisateur annule', async () => {
    const { s, prisma, invitations } = svc();
    Object.assign(prisma.rendezVous, {
      findFirst: jest.fn().mockResolvedValue({
        id: 'R1',
        titre: 'Point',
        organisateurId: 'U1',
        debut: new Date(rdv.debut),
        invites: [{ utilisateurId: 'U2' }],
      }),
      update: jest.fn().mockResolvedValue({}),
    });
    await s.annuler(moi({ agenda: 'LES' }), 'R1');
    expect(invitations.envoyer).toHaveBeenCalledWith('R1', 'CANCEL');
    await expect(s.annuler({ ...moi({ agenda: 'LES' }), userId: 'U2' }, 'R1')).rejects.toThrow(ForbiddenException);
    expect(invitations.envoyer).toHaveBeenCalledTimes(1);
  });

  it('l’agenda d’un collègue demande la Lecture de « Agenda des autres »', async () => {
    await expect(svc().s.semaine(moi({ agenda: 'L' }), '2026-11-02', 'U9')).rejects.toThrow(ForbiddenException);
  });

  it('une période d’un an au plus (vue Année) ; une semaine par défaut', async () => {
    const { s } = svc();
    await expect(s.semaine(moi({ agenda: 'L' }), '2026-01-01', undefined, '2027-01-02')).rejects.toThrow(
      BadRequestException,
    );
    expect((await s.semaine(moi({ agenda: 'L' }), '2026-01-01', undefined, '2026-12-31')).au).toBe('2026-12-31');
    expect((await s.semaine(moi({ agenda: 'L' }), '2026-11-02')).au).toBe('2026-11-08');
  });

  it('les demandes d’absence à trancher : un élément par jour couvert, sur son agenda seulement', async () => {
    const { s, demandes } = svc();
    demandes.aValider.mockResolvedValue([
      {
        id: 'D1',
        type: 'conge_paye',
        jours: 3,
        dateDebut: '2026-10-30',
        dateFin: '2026-11-03',
        validationFinale: false,
        salarie: { prenom: 'Awa', nom: 'Diop', poste: null },
      },
    ]);
    const vue = await s.semaine(moi({ agenda: 'L' }), '2026-11-02');
    expect(vue.elements.filter((e) => e.type === 'demande').map((e) => e.jour)).toEqual(['2026-11-02', '2026-11-03']);
    expect(vue.elements[0]).toMatchObject({ titre: 'Awa Diop', demande: { id: 'D1', validationFinale: false } });
    const autre = await s.semaine(moi({ agenda: 'L', 'agenda.autres': 'L' }), '2026-11-02', 'U9');
    expect(autre.elements).toEqual([]);
    // L'abonnement externe ne les lit même pas (elles ne sortent pas du HUB).
    demandes.aValider.mockClear();
    const externe = await s.semaine(moi({ agenda: 'L' }), '2026-11-02', undefined, undefined, { sansDemandes: true });
    expect(externe.elements).toEqual([]);
    expect(demandes.aValider).not.toHaveBeenCalled();
  });

  // Modifier un rendez-vous (12/11/2026).
  describe('modifier', () => {
    const existant = {
      id: 'R1',
      titre: 'Point',
      debut: new Date(rdv.debut),
      fin: new Date(rdv.fin),
      lieu: null,
      description: null,
      organisateurId: 'U1',
      invites: [{ utilisateurId: 'U2' }, { utilisateurId: 'U3' }],
    };
    const monterModif = () => {
      const x = svc();
      x.prisma.rendezVous.findFirst.mockResolvedValue(existant);
      x.prisma.utilisateurSocieteRole.findMany.mockResolvedValue([{ utilisateurId: 'U4' }]);
      return x;
    };
    const droits = moi({ agenda: 'LES', 'agenda.reunions': 'E' });

    it('gardés : réunion modifiée ; ajoutés : invitation ; retirés : annulation — dans le HUB et par e-mail', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      await s.modifier(droits, 'R1', {
        ...rdv,
        debut: '2026-11-03T14:00:00.000Z',
        fin: '2026-11-03T15:00:00.000Z',
        inviteIds: ['U2', 'U4'],
      });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'R1', annuleLe: null },
          data: expect.objectContaining({ sequence: { increment: 1 } }),
        }),
      );
      expect(prisma.inviteRendezVous.deleteMany).toHaveBeenCalledWith({
        where: { rendezVousId: 'R1', utilisateurId: { in: ['U3'] } },
      });
      expect(prisma.inviteRendezVous.createMany).toHaveBeenCalledWith({
        data: [{ rendezVousId: 'R1', utilisateurId: 'U4' }],
        skipDuplicates: true,
      });
      const parType = Object.fromEntries(notifications.envoyer.mock.calls.map(([n]) => [n.type, n.destinataireIds]));
      expect(parType).toEqual({ rdv_modifie: ['U2'], rdv_invitation: ['U4'], rdv_annule: ['U3'] });
      expect(invitations.envoyer.mock.calls).toEqual([
        ['R1', 'REQUEST', { destinataires: ['U2', 'U4'] }],
        ['R1', 'CANCEL', { destinataires: ['U3'] }],
      ]);
    });

    it('une réunion annulée entre-temps n’est pas modifiée (404), et personne n’est prévenu', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      prisma.rendezVous.updateMany.mockResolvedValue({ count: 0 });
      await expect(s.modifier(droits, 'R1', { ...rdv, titre: 'Autre', inviteIds: ['U2', 'U3'] })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.inviteRendezVous.createMany).not.toHaveBeenCalled();
      expect(notifications.envoyer).not.toHaveBeenCalled();
      expect(invitations.envoyer).not.toHaveBeenCalled();
    });

    it('rien de changé : ni écriture, ni notification', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      await s.modifier(droits, 'R1', { ...rdv, inviteIds: ['U3', 'U2'] });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifications.envoyer).not.toHaveBeenCalled();
      expect(invitations.envoyer).not.toHaveBeenCalled();
    });

    it('seul l’organisateur modifie ; ajouter un invité demande « Réunions » (retirer, non)', async () => {
      const { s } = monterModif();
      await expect(s.modifier({ ...droits, userId: 'U2' }, 'R1', { ...rdv, inviteIds: [] })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(s.modifier(moi({ agenda: 'LES' }), 'R1', { ...rdv, inviteIds: ['U2', 'U3', 'U4'] })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(s.modifier(moi({ agenda: 'LES' }), 'R1', { ...rdv, inviteIds: ['U2'] })).resolves.toEqual({
        ok: true,
      });
    });

    it('un entretien de recrutement ne se modifie pas d’ici ; la fin doit suivre le début', async () => {
      const { s, prisma } = monterModif();
      await expect(s.modifier(droits, 'R1', { ...rdv, fin: rdv.debut, inviteIds: [] })).rejects.toThrow(
        BadRequestException,
      );
      prisma.candidature.count.mockResolvedValue(1);
      await expect(s.modifier(droits, 'R1', { ...rdv, inviteIds: [] })).rejects.toThrow(ConflictException);
    });

    it('un rendez-vous introuvable, annulé ou d’une autre société répond 404, sans rien écrire', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      prisma.rendezVous.findFirst.mockResolvedValue(null);
      await expect(s.modifier(droits, 'R1', { ...rdv, titre: 'Autre', inviteIds: [] })).rejects.toThrow(
        NotFoundException,
      );
      // La recherche se borne à la société de l'acteur et aux rendez-vous non annulés.
      expect(prisma.rendezVous.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'R1', societeId: 'S1', annuleLe: null } }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifications.envoyer).not.toHaveBeenCalled();
      expect(invitations.envoyer).not.toHaveBeenCalled();
    });

    it('l’organisateur et les doublons de la liste des invités sont ignorés (ni ajout, ni droit « Réunions » exigé)', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      // Sans « Réunions » : se lister soi-même ou répéter un invité n'est pas un ajout.
      await s.modifier(moi({ agenda: 'LES' }), 'R1', {
        ...rdv,
        titre: 'Point budget',
        inviteIds: ['U1', 'U2', 'U2', 'U3'],
      });
      expect(prisma.utilisateurSocieteRole.findMany).not.toHaveBeenCalled();
      expect(prisma.inviteRendezVous.createMany).toHaveBeenCalledWith({ data: [], skipDuplicates: true });
      expect(prisma.inviteRendezVous.deleteMany).toHaveBeenCalledWith({
        where: { rendezVousId: 'R1', utilisateurId: { in: [] } },
      });
      expect(notifications.envoyer.mock.calls.map(([n]) => [n.type, n.destinataireIds])).toEqual([
        ['rdv_modifie', ['U2', 'U3']],
      ]);
      expect(invitations.envoyer.mock.calls).toEqual([['R1', 'REQUEST', { destinataires: ['U2', 'U3'] }]]);
    });

    it('un nouvel invité répété n’est ajouté qu’une fois', async () => {
      const { s, prisma, notifications } = monterModif();
      await s.modifier(droits, 'R1', { ...rdv, inviteIds: ['U2', 'U3', 'U4', 'U4'] });
      expect(prisma.utilisateurSocieteRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ utilisateurId: { in: ['U4'] } }) }),
      );
      expect(prisma.inviteRendezVous.createMany).toHaveBeenCalledWith({
        data: [{ rendezVousId: 'R1', utilisateurId: 'U4' }],
        skipDuplicates: true,
      });
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rdv_invitation', destinataireIds: ['U4'] }),
      );
    });

    it('ajouter quelqu’un qui n’est pas membre actif de la société est refusé (400), sans rien écrire', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      prisma.utilisateurSocieteRole.findMany.mockResolvedValue([]);
      await expect(s.modifier(droits, 'R1', { ...rdv, inviteIds: ['U2', 'U3', 'U9'] })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.utilisateurSocieteRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { societeId: 'S1', utilisateurId: { in: ['U9'] }, utilisateur: { actif: true } },
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifications.envoyer).not.toHaveBeenCalled();
      expect(invitations.envoyer).not.toHaveBeenCalled();
    });

    it('sans invité ni avant ni après : la fiche est mise à jour, aucune notification ni e-mail', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      prisma.rendezVous.findFirst.mockResolvedValue({ ...existant, invites: [] });
      await s.modifier(droits, 'R1', { ...rdv, titre: 'Point déplacé', lieu: 'Salle B', inviteIds: [] });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith({
        where: { id: 'R1', annuleLe: null },
        data: {
          titre: 'Point déplacé',
          debut: new Date(rdv.debut),
          fin: new Date(rdv.fin),
          lieu: 'Salle B',
          description: null,
          sequence: { increment: 1 },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(notifications.envoyer).not.toHaveBeenCalled();
      expect(invitations.envoyer).not.toHaveBeenCalled();
    });

    it('retirer tous les invités : annulation ciblée, plus aucune invitation à jour', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      await s.modifier(moi({ agenda: 'LES' }), 'R1', { ...rdv, inviteIds: [] });
      expect(prisma.inviteRendezVous.deleteMany).toHaveBeenCalledWith({
        where: { rendezVousId: 'R1', utilisateurId: { in: ['U2', 'U3'] } },
      });
      expect(notifications.envoyer.mock.calls.map(([n]) => [n.type, n.destinataireIds])).toEqual([
        ['rdv_annule', ['U2', 'U3']],
      ]);
      expect(invitations.envoyer.mock.calls).toEqual([['R1', 'CANCEL', { destinataires: ['U2', 'U3'] }]]);
    });

    it('le seul changement est le retrait d’un invité : seul le retiré est prévenu (annulation)', async () => {
      const { s, prisma, notifications, invitations } = monterModif();
      await s.modifier(moi({ agenda: 'LES' }), 'R1', { ...rdv, inviteIds: ['U2'] });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sequence: { increment: 1 } }) }),
      );
      expect(notifications.envoyer.mock.calls.map(([n]) => [n.type, n.destinataireIds])).toEqual([
        ['rdv_annule', ['U3']],
      ]);
      expect(invitations.envoyer.mock.calls).toEqual([['R1', 'CANCEL', { destinataires: ['U3'] }]]);
    });

    it('espaces autour du titre, lieu et note vides : la fiche est jugée inchangée', async () => {
      const { s, prisma, notifications } = monterModif();
      await s.modifier(droits, 'R1', {
        ...rdv,
        titre: '  Point  ',
        lieu: '   ',
        description: '',
        inviteIds: ['U2', 'U3'],
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifications.envoyer).not.toHaveBeenCalled();
    });

    it('l’annulation reprend l’ancien titre et l’ancienne date, la modification les nouveaux', async () => {
      const { s, notifications } = monterModif();
      await s.modifier(droits, 'R1', {
        titre: 'Revue',
        debut: '2026-11-05T14:00:00.000Z',
        fin: '2026-11-05T15:00:00.000Z',
        inviteIds: ['U2'],
      });
      const titres = Object.fromEntries(notifications.envoyer.mock.calls.map(([n]) => [n.type, n.titre]));
      expect(titres.rdv_modifie).toBe('Réunion modifiée · Revue · jeudi 5 novembre à 14:00');
      expect(titres.rdv_annule).toBe('Réunion annulée · Point · mardi 3 novembre à 10:00');
    });
  });

  it('annuler fait passer la réunion à la version suivante (SEQUENCE iCalendar)', async () => {
    const { s, prisma } = svc();
    prisma.rendezVous.findFirst.mockResolvedValue({
      id: 'R1',
      titre: 'Point',
      organisateurId: 'U1',
      debut: new Date(rdv.debut),
      invites: [],
    });
    await s.annuler(moi({ agenda: 'LES' }), 'R1');
    expect(prisma.rendezVous.update).toHaveBeenCalledWith({
      where: { id: 'R1' },
      data: { annuleLe: expect.any(Date), sequence: { increment: 1 } },
    });
  });

  it('un rendez-vous dont on est l’organisateur est modifiable, pas un entretien', async () => {
    const { s, prisma } = svc();
    prisma.rendezVous.findMany.mockResolvedValue([
      {
        id: 'R1',
        titre: 'A',
        debut: new Date(rdv.debut),
        fin: new Date(rdv.fin),
        lieu: null,
        description: 'n',
        organisateurId: 'U1',
        invites: [{ utilisateurId: 'U2' }],
      },
      {
        id: 'R2',
        titre: 'B',
        debut: new Date(rdv.debut),
        fin: new Date(rdv.fin),
        lieu: null,
        description: null,
        organisateurId: 'U1',
        invites: [],
      },
    ]);
    prisma.candidature.findMany.mockResolvedValue([{ rendezVousId: 'R2' }]);
    const vue = await s.semaine(moi({ agenda: 'LES' }), '2026-11-02');
    expect(vue.elements.find((e) => e.id === 'R1')).toMatchObject({
      modifiable: true,
      entretien: false,
      inviteIds: ['U2'],
      description: 'n',
    });
    expect(vue.elements.find((e) => e.id === 'R2')).toMatchObject({ modifiable: false, entretien: true });
  });
});
