import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AgendaService } from './agenda.service';

const svc = () => {
  const prisma = {
    utilisateurSocieteRole: {
      findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2' }]),
      count: jest.fn().mockResolvedValue(1),
    },
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
    inviteRendezVous: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
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
      lienVisio: null,
      rappelMinutes: null,
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
          lienVisio: null,
          rappelMinutes: null,
          regle: null,
          finSerie: new Date(rdv.fin),
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

  it('un entretien ne s’annule pas depuis l’Agenda (409), et n’est pas présenté annulable', async () => {
    const { s, prisma } = svc();
    prisma.rendezVous.findFirst.mockResolvedValue({
      id: 'R2',
      titre: 'Entretien',
      organisateurId: 'U1',
      debut: new Date(rdv.debut),
      invites: [],
    });
    prisma.candidature.count.mockResolvedValue(1);
    await expect(s.annuler(moi({ agenda: 'LES' }), 'R2')).rejects.toThrow(ConflictException);
    expect(prisma.rendezVous.update).not.toHaveBeenCalled();
    prisma.rendezVous.findMany.mockResolvedValue([
      {
        id: 'R2',
        titre: 'Entretien',
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
    expect(vue.elements[0]).toMatchObject({
      annulable: false,
      modifiable: false,
      entretien: true,
      jeSuisOrganisateur: true,
    });
  });

  it('l’agenda d’un compte qui n’est pas membre de la société : introuvable', async () => {
    const { s, prisma } = svc();
    prisma.utilisateurSocieteRole.count.mockResolvedValue(0);
    await expect(s.semaine(moi({ agenda: 'L', 'agenda.autres': 'L' }), '2026-11-02', 'U9')).rejects.toThrow(
      NotFoundException,
    );
  });

  // B3 (12/11/2026) : réponses, disponibilités, visio et rappel.
  describe('répondre à une invitation', () => {
    const reunion = (reponse: string | null = null, fin = '2099-01-01T10:00:00.000Z') => ({
      id: 'R1',
      titre: 'Point',
      debut: new Date('2099-01-01T09:00:00.000Z'),
      fin: new Date(fin),
      organisateurId: 'U9',
      invites: [{ utilisateurId: 'U1', reponse }],
    });

    it('l’invité répond ; l’organisateur est prévenu', async () => {
      const { s, prisma, notifications } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(reunion());
      prisma.utilisateur.findUnique.mockResolvedValue({ prenom: 'Awa', nom: 'Diop' });
      await s.repondre(moi({ agenda: 'L' }), 'R1', 'peut_etre');
      expect(prisma.inviteRendezVous.update).toHaveBeenCalledWith({
        where: { rendezVousId_utilisateurId: { rendezVousId: 'R1', utilisateurId: 'U1' } },
        data: { reponse: 'peut_etre', reponduLe: expect.any(Date) },
      });
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rdv_reponse',
          destinataireIds: ['U9'],
          titre: expect.stringContaining('Awa Diop · Peut-être · Point'),
        }),
      );
    });

    it('même réponse : rien ; pas invité : introuvable ; réunion passée : refusée', async () => {
      const { s, prisma, notifications } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(reunion('oui'));
      await s.repondre(moi({ agenda: 'L' }), 'R1', 'oui');
      expect(prisma.inviteRendezVous.update).not.toHaveBeenCalled();
      expect(notifications.envoyer).not.toHaveBeenCalled();
      prisma.rendezVous.findFirst.mockResolvedValue({ ...reunion(), invites: [] });
      await expect(s.repondre(moi({ agenda: 'L' }), 'R1', 'oui')).rejects.toThrow(NotFoundException);
      prisma.rendezVous.findFirst.mockResolvedValue(reunion(null, '2020-01-01T10:00:00.000Z'));
      await expect(s.repondre(moi({ agenda: 'L' }), 'R1', 'oui')).rejects.toThrow(ConflictException);
    });
  });

  describe('disponibilités', () => {
    // Créneaux bornés d'hier à un an : horloge figée au 13/11/2026.
    beforeEach(() =>
      jest.useFakeTimers({ now: new Date('2026-11-13T08:00:00.000Z'), doNotFake: ['nextTick', 'queueMicrotask'] }),
    );
    afterEach(() => jest.useRealTimers());
    it('occupé : organisateur ou invité qui n’a pas décliné ; absent prime ; membres seulement', async () => {
      const { s, prisma } = svc();
      prisma.utilisateurSocieteRole.findMany.mockResolvedValue(
        ['U2', 'U3', 'U4', 'U5'].map((utilisateurId) => ({ utilisateurId })),
      );
      prisma.rendezVous.findMany.mockResolvedValue([
        {
          organisateurId: 'U2',
          invites: [
            { utilisateurId: 'U3', reponse: 'non' },
            { utilisateurId: 'U4', reponse: null },
            { utilisateurId: 'ETRANGER', reponse: 'oui' },
          ],
        },
      ]);
      prisma.demandeAbsence.findMany.mockResolvedValue([{ dossier: { utilisateurId: 'U4' } }]);
      const d = await s.disponibilites(
        moi({ 'agenda.reunions': 'E', 'agenda.autres': 'L' }),
        '2026-11-13T09:00:00.000Z',
        '2026-11-13T10:00:00.000Z',
        ['U2', 'U3', 'U4', 'U5', 'ETRANGER'],
        'R7',
      );
      expect(d).toEqual({ occupes: ['U2'], absents: ['U4'] });
      // Sans « Agenda des autres » : une absence (donnée RH) se dit « occupé ».
      const sansAutres = await s.disponibilites(
        moi({ 'agenda.reunions': 'E' }),
        '2026-11-13T09:00:00.000Z',
        '2026-11-13T10:00:00.000Z',
        ['U2', 'U3', 'U4', 'U5'],
      );
      expect(sansAutres).toEqual({ occupes: ['U2', 'U4'], absents: [] });
      // Seules les personnes envisagées sont regardées.
      expect(prisma.utilisateurSocieteRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ utilisateurId: { in: ['U2', 'U3', 'U4', 'U5'] } }),
        }),
      );
      expect(prisma.rendezVous.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: 'R7' }, annuleLe: null }) }),
      );
    });

    it('créneau invalide ou trop long : refusé', async () => {
      const { s } = svc();
      await expect(
        s.disponibilites(moi({}), '2026-11-13T10:00:00.000Z', '2026-11-13T09:00:00.000Z', ['U2']),
      ).rejects.toThrow(BadRequestException);
      await expect(
        s.disponibilites(moi({}), '2026-11-01T10:00:00.000Z', '2026-11-13T09:00:00.000Z', ['U2']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('création : visio et rappel enregistrés', async () => {
    const { s, prisma } = svc();
    prisma.utilisateurSocieteRole.findMany.mockResolvedValue([]);
    await s.creer(moi({ agenda: 'LES' }), { ...rdv, lienVisio: 'https://zoom.us/j/1', rappelMinutes: 30 });
    expect(prisma.rendezVous.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lienVisio: 'https://zoom.us/j/1', rappelMinutes: 30 }),
      }),
    );
  });

  it('modifier l’heure ou le rappel : le rappel repartira ; changer la note, non', async () => {
    const { s, prisma } = svc();
    const existant = {
      id: 'R1',
      titre: 'Point',
      debut: new Date(rdv.debut),
      fin: new Date(rdv.fin),
      lieu: null,
      description: null,
      lienVisio: null,
      rappelMinutes: 10,
      organisateurId: 'U1',
      invites: [],
    };
    prisma.rendezVous.findFirst.mockResolvedValue(existant);
    await s.modifier(moi({ agenda: 'LES' }), 'R1', { ...rdv, rappelMinutes: 60, inviteIds: [] });
    expect(prisma.rendezVous.updateMany.mock.calls[0][0].data).toMatchObject({
      rappelMinutes: 60,
      rappelEnvoyeLe: null,
    });
    await s.modifier(moi({ agenda: 'LES' }), 'R1', { ...rdv, rappelMinutes: 10, description: 'n', inviteIds: [] });
    expect(prisma.rendezVous.updateMany.mock.calls[1][0].data).not.toHaveProperty('rappelEnvoyeLe');
  });
  // Lot B3 (12/11/2026) : ce que la semaine expose des réponses, de la visio et du rappel.
  describe('semaine · réponses, visio et rappel', () => {
    const reunion = {
      id: 'R1',
      titre: 'Point',
      debut: new Date(rdv.debut),
      fin: new Date(rdv.fin),
      lieu: null,
      description: null,
      lienVisio: 'https://meet.google.com/abc',
      rappelMinutes: 30,
      organisateurId: 'U9',
      invites: [
        { utilisateurId: 'U1', reponse: 'non' },
        { utilisateurId: 'U2', reponse: 'oui' },
        { utilisateurId: 'U3', reponse: null },
      ],
    };
    const monterSemaine = (r: object = reunion) => {
      const x = svc();
      x.prisma.rendezVous.findMany.mockResolvedValue([r]);
      x.prisma.utilisateur.findMany.mockResolvedValue([
        { id: 'U1', prenom: 'Awa', nom: 'Diop' },
        { id: 'U2', prenom: 'Moussa', nom: 'Sow' },
        { id: 'U9', prenom: 'Fatou', nom: 'Ba' },
      ]);
      return x;
    };

    it('chaque invité avec son nom et sa réponse ; un compte sans nom connu : « — »', async () => {
      const { s } = monterSemaine();
      const vue = await s.semaine(moi({ agenda: 'L' }), '2026-11-02');
      expect(vue.elements[0].participants).toEqual([
        { nom: 'Awa Diop', reponse: 'non' },
        { nom: 'Moussa Sow', reponse: 'oui' },
        { nom: '—', reponse: null },
      ]);
      expect(vue.elements[0].organisateur).toBe('Fatou Ba');
    });

    it('l’invité lit sa propre réponse (maReponse) ; il n’est pas l’organisateur', async () => {
      const { s } = monterSemaine();
      const [e] = (await s.semaine(moi({ agenda: 'L' }), '2026-11-02')).elements;
      expect(e).toMatchObject({ maReponse: 'non', jeSuisOrganisateur: false, modifiable: false, annulable: false });
      // L'organisateur seul reçoit la liste des invités pour son formulaire.
      expect(e.inviteIds).toEqual([]);
    });

    it('un invité qui n’a pas encore répondu : maReponse null', async () => {
      const { s } = monterSemaine({ ...reunion, invites: [{ utilisateurId: 'U1', reponse: null }] });
      const [e] = (await s.semaine(moi({ agenda: 'L' }), '2026-11-02')).elements;
      expect(e.maReponse).toBeNull();
    });

    it('l’organisateur : maReponse null (il n’est pas invité), les réponses des invités visibles', async () => {
      const { s } = monterSemaine({
        ...reunion,
        organisateurId: 'U1',
        invites: [{ utilisateurId: 'U2', reponse: 'peut_etre' }],
      });
      const [e] = (await s.semaine(moi({ agenda: 'LES' }), '2026-11-02')).elements;
      expect(e).toMatchObject({
        maReponse: null,
        jeSuisOrganisateur: true,
        participants: [{ nom: 'Moussa Sow', reponse: 'peut_etre' }],
      });
    });

    it('l’agenda d’un collègue : maReponse est la réponse de ce collègue, pas la sienne', async () => {
      const { s } = monterSemaine();
      const [e] = (await s.semaine(moi({ agenda: 'L', 'agenda.autres': 'L' }), '2026-11-02', 'U2')).elements;
      expect(e.maReponse).toBe('oui');
    });

    it('le lien visio et le rappel sont exposés tels qu’enregistrés', async () => {
      const { s } = monterSemaine();
      const [e] = (await s.semaine(moi({ agenda: 'L' }), '2026-11-02')).elements;
      expect(e).toMatchObject({ lienVisio: 'https://meet.google.com/abc', rappelMinutes: 30 });
    });

    it('échéances et congés : ni visio, ni rappel, ni réponse, ni participant', async () => {
      const { s, prisma } = svc();
      prisma.tacheProjet.findMany.mockResolvedValue([
        { id: 'T1', libelle: 'Plans RDC', finLe: '2026-11-03', projet: { code: 'GC-01' } },
      ]);
      prisma.demandeAbsence.findMany.mockResolvedValue([
        { id: 'C1', type: 'conge_paye', dateDebut: '2026-11-04', dateFin: '2026-11-04' },
      ]);
      const vue = await s.semaine(moi({ agenda: 'L' }), '2026-11-02');
      expect(vue.elements.map((e) => e.type).sort()).toEqual(['conge', 'echeance']);
      for (const e of vue.elements) {
        expect(e).toMatchObject({ lienVisio: null, rappelMinutes: null, maReponse: null, participants: [] });
      }
    });
  });

  describe('création et modification · visio et rappel', () => {
    it('création sans visio ni rappel : null enregistrés ; un lien entouré d’espaces est nettoyé', async () => {
      const { s, prisma } = svc();
      prisma.utilisateurSocieteRole.findMany.mockResolvedValue([]);
      await s.creer(moi({ agenda: 'LES' }), rdv);
      expect(prisma.rendezVous.create.mock.calls[0][0].data).toMatchObject({ lienVisio: null, rappelMinutes: null });
      await s.creer(moi({ agenda: 'LES' }), { ...rdv, lienVisio: '  https://zoom.us/j/1  ', rappelMinutes: null });
      expect(prisma.rendezVous.create.mock.calls[1][0].data).toMatchObject({
        lienVisio: 'https://zoom.us/j/1',
        rappelMinutes: null,
      });
    });

    const existant = {
      id: 'R1',
      titre: 'Point',
      debut: new Date(rdv.debut),
      fin: new Date(rdv.fin),
      lieu: null,
      description: null,
      lienVisio: 'https://meet.google.com/abc',
      rappelMinutes: 30,
      organisateurId: 'U1',
      invites: [{ utilisateurId: 'U2' }],
    };
    const droits = moi({ agenda: 'LES', 'agenda.reunions': 'E' });

    it('changer seulement le lien visio : les invités reçoivent la réunion à jour, le rappel n’est pas refait', async () => {
      const { s, prisma, notifications, invitations } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(existant);
      await s.modifier(droits, 'R1', {
        ...rdv,
        lienVisio: 'https://meet.google.com/xyz',
        rappelMinutes: 30,
        inviteIds: ['U2'],
      });
      const data = prisma.rendezVous.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({ lienVisio: 'https://meet.google.com/xyz' });
      expect(data).not.toHaveProperty('rappelEnvoyeLe');
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rdv_modifie', destinataireIds: ['U2'] }),
      );
      expect(invitations.envoyer).toHaveBeenCalledWith('R1', 'REQUEST', expect.anything());
    });

    it('effacer la visio (null) est une modification ; le rappel retiré aussi', async () => {
      const { s, prisma } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(existant);
      await s.modifier(droits, 'R1', { ...rdv, lienVisio: null, rappelMinutes: null, inviteIds: ['U2'] });
      expect(prisma.rendezVous.updateMany.mock.calls[0][0].data).toMatchObject({
        lienVisio: null,
        rappelMinutes: null,
        rappelEnvoyeLe: null,
      });
    });

    it('déplacer l’heure remet le rappel à envoyer, même avec le même délai', async () => {
      const { s, prisma } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(existant);
      await s.modifier(droits, 'R1', {
        ...rdv,
        debut: '2026-11-03T14:00:00.000Z',
        fin: '2026-11-03T15:00:00.000Z',
        lienVisio: existant.lienVisio,
        rappelMinutes: 30,
        inviteIds: ['U2'],
      });
      expect(prisma.rendezVous.updateMany.mock.calls[0][0].data).toMatchObject({ rappelEnvoyeLe: null });
    });

    it('rien de changé, visio et rappel compris : aucune écriture', async () => {
      const { s, prisma, invitations } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(existant);
      await s.modifier(droits, 'R1', {
        ...rdv,
        lienVisio: 'https://meet.google.com/abc',
        rappelMinutes: 30,
        inviteIds: ['U2'],
      });
      expect(prisma.rendezVous.updateMany).not.toHaveBeenCalled();
      expect(invitations.envoyer).not.toHaveBeenCalled();
    });
  });

  describe('répondre · cas limites', () => {
    const reunion = {
      id: 'R1',
      titre: 'Point',
      debut: new Date('2099-01-01T09:00:00.000Z'),
      fin: new Date('2099-01-01T10:00:00.000Z'),
      organisateurId: 'U9',
      invites: [{ utilisateurId: 'U1', reponse: 'oui' }],
    };

    it('ne cherche la réunion que dans sa société, non annulée, et sa propre invitation', async () => {
      const { s, prisma } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(null);
      await expect(s.repondre(moi({ agenda: 'L' }), 'R1', 'oui')).rejects.toThrow(NotFoundException);
      expect(prisma.rendezVous.findFirst).toHaveBeenCalledWith({
        where: { id: 'R1', societeId: 'S1', annuleLe: null },
        include: { invites: { where: { utilisateurId: 'U1' } }, exceptions: true },
      });
      expect(prisma.inviteRendezVous.update).not.toHaveBeenCalled();
    });

    it('changer d’avis (Oui → Non) : enregistré, l’organisateur prévenu du « Non »', async () => {
      const { s, prisma, notifications } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue(reunion);
      prisma.utilisateur.findUnique.mockResolvedValue({ prenom: 'Awa', nom: 'Diop' });
      await s.repondre(moi({ agenda: 'L' }), 'R1', 'non');
      expect(prisma.inviteRendezVous.update.mock.calls[0][0].data).toMatchObject({ reponse: 'non' });
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({ titre: expect.stringContaining('Awa Diop · Non · Point'), parId: 'U1' }),
      );
    });

    it('une réunion en cours accepte encore une réponse', async () => {
      const { s, prisma } = svc();
      const maintenant = Date.now();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...reunion,
        debut: new Date(maintenant - 30 * 60_000),
        fin: new Date(maintenant + 30 * 60_000),
        invites: [{ utilisateurId: 'U1', reponse: null }],
      });
      await expect(s.repondre(moi({ agenda: 'L' }), 'R1', 'oui')).resolves.toEqual({ ok: true });
      expect(prisma.inviteRendezVous.update).toHaveBeenCalled();
    });

    it('compte introuvable au moment de prévenir : « Un invité » répond', async () => {
      const { s, prisma, notifications } = svc();
      prisma.rendezVous.findFirst.mockResolvedValue({ ...reunion, invites: [{ utilisateurId: 'U1', reponse: null }] });
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      await s.repondre(moi({ agenda: 'L' }), 'R1', 'oui');
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({ titre: expect.stringMatching(/^Un invité · Oui · Point/) }),
      );
    });
  });

  describe('disponibilités · bornes', () => {
    beforeEach(() =>
      jest.useFakeTimers({ now: new Date('2026-11-13T08:00:00.000Z'), doNotFake: ['nextTick', 'queueMicrotask'] }),
    );
    afterEach(() => jest.useRealTimers());

    it('hier au plus tôt, un an au plus tard ; personne d’envisagé : rien à lire', async () => {
      const { s, prisma } = svc();
      await expect(
        s.disponibilites(moi({}), '2026-11-11T09:00:00.000Z', '2026-11-11T10:00:00.000Z', ['U2']),
      ).rejects.toThrow(BadRequestException);
      await expect(
        s.disponibilites(moi({}), '2027-12-01T09:00:00.000Z', '2027-12-01T10:00:00.000Z', ['U2']),
      ).rejects.toThrow(BadRequestException);
      expect(await s.disponibilites(moi({}), '2026-11-13T09:00:00.000Z', '2026-11-13T10:00:00.000Z', [])).toEqual({
        occupes: [],
        absents: [],
      });
      expect(prisma.rendezVous.findMany).not.toHaveBeenCalled();
    });

    it('sept jours tout juste : accepté ; une absence compte sur les jours du créneau', async () => {
      const { s, prisma } = svc();
      await expect(
        s.disponibilites(moi({}), '2026-11-13T09:00:00.000Z', '2026-11-20T09:00:00.000Z', ['U2']),
      ).resolves.toEqual({
        occupes: [],
        absents: [],
      });
      // Fin exclue : un créneau qui finit à minuit ne compte pas le lendemain.
      await s.disponibilites(moi({}), '2026-11-13T22:00:00.000Z', '2026-11-14T00:00:00.000Z', ['U2']);
      expect(prisma.demandeAbsence.findMany.mock.calls[1][0].where).toMatchObject({
        statut: 'validee',
        dateDebut: { lte: '2026-11-13' },
        dateFin: { gte: '2026-11-13' },
      });
    });

    it('sans exclusion, aucun filtre sur l’identifiant ; un compte inactif n’est pas proposé', async () => {
      const { s, prisma } = svc();
      await s.disponibilites(moi({}), '2026-11-13T09:00:00.000Z', '2026-11-13T10:00:00.000Z', ['U2']);
      expect(prisma.rendezVous.findMany.mock.calls[0][0].where).not.toHaveProperty('id');
      expect(prisma.utilisateurSocieteRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { societeId: 'S1', utilisateurId: { in: ['U2'] }, utilisateur: { actif: true } },
        }),
      );
    });

    it('un créneau de durée nulle est refusé', async () => {
      const { s } = svc();
      await expect(
        s.disponibilites(moi({}), '2026-11-13T09:00:00.000Z', '2026-11-13T09:00:00.000Z', ['U2']),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
