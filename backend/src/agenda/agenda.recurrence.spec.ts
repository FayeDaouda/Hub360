import { BadRequestException } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { occurrencesDans } from './series';

// Rendez-vous récurrents (16/11/2026) : création, lecture déroulée,
// modification et annulation selon la portée (comme Google Agenda).
const LUNDI = '2026-11-16T09:00:00.000Z';
const SERIE = {
  id: 'S1',
  societeId: 'S',
  titre: 'Point hebdo',
  debut: new Date(LUNDI),
  fin: new Date('2026-11-16T10:00:00.000Z'),
  lieu: 'Salle A',
  description: null,
  lienVisio: null,
  rappelMinutes: null,
  regle: 'FREQ=WEEKLY;BYDAY=MO;COUNT=10',
  organisateurId: 'U1',
  sequence: 0,
  invites: [{ utilisateurId: 'U2', reponse: null }],
  exceptions: [] as unknown[],
};

const monter = () => {
  const prisma = {
    utilisateurSocieteRole: {
      findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2' }, { utilisateurId: 'U3' }]),
      count: jest.fn().mockResolvedValue(1),
    },
    utilisateur: {
      findUnique: jest.fn().mockResolvedValue({ id: 'U1', prenom: 'Awa', nom: 'Diop' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rendezVous: {
      create: jest.fn().mockResolvedValue({ id: 'S2', titre: 'Point hebdo' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(SERIE),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    exceptionRendezVous: { upsert: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    rappelOccurrence: { deleteMany: jest.fn() },
    inviteRendezVous: { deleteMany: jest.fn(), createMany: jest.fn() },
    tacheProjet: { findMany: jest.fn().mockResolvedValue([]) },
    candidature: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    evenementExterne: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((f: (tx: typeof prisma) => unknown) => f(prisma));
  const notifications = { envoyer: jest.fn() };
  const invitations = { envoyer: jest.fn().mockResolvedValue(1) };
  const s = new AgendaService(
    prisma as never,
    notifications as never,
    { aValider: jest.fn().mockResolvedValue([]) } as never,
    invitations as never,
  );
  return { s, prisma, notifications, invitations };
};
const moi = { userId: 'U1', societeId: 'S', role: 'Salarié', permissions: { agenda: 'LES', 'agenda.reunions': 'E' } };
const corps = (x: Record<string, unknown> = {}) => ({
  titre: 'Point hebdo',
  debut: '2026-11-30T09:00:00.000Z',
  fin: '2026-11-30T10:00:00.000Z',
  lieu: 'Salle A',
  inviteIds: ['U2'],
  ...x,
});

describe('Agenda · récurrence', () => {
  describe('création', () => {
    it('la règle est relue et écrite sous sa forme normale', async () => {
      const { s, prisma } = monter();
      prisma.utilisateurSocieteRole.findMany.mockResolvedValueOnce([{ utilisateurId: 'U2' }]);
      await s.creer(moi, {
        ...corps(),
        debut: LUNDI,
        fin: '2026-11-16T10:00:00.000Z',
        regle: 'RRULE:FREQ=WEEKLY;BYDAY=WE,MO',
      });
      expect(prisma.rendezVous.create.mock.calls[0][0].data.regle).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
    });

    it('règle hors du sous-ensemble, ou qui finit avant le premier rendez-vous : refusée', async () => {
      const { s } = monter();
      const base = { ...corps(), debut: LUNDI, fin: '2026-11-16T10:00:00.000Z' };
      await expect(s.creer(moi, { ...base, regle: 'FREQ=HOURLY' })).rejects.toThrow(BadRequestException);
      await expect(s.creer(moi, { ...base, regle: 'FREQ=DAILY;UNTIL=20261101' })).rejects.toThrow(BadRequestException);
      await expect(s.creer(moi, { ...base, regle: 'FREQ=DAILY;UNTIL=20400101' })).rejects.toThrow(BadRequestException);
    });
  });

  it('lecture : une occurrence par semaine, identifiée par la série et son début d’origine', async () => {
    const { s, prisma } = monter();
    prisma.rendezVous.findMany.mockResolvedValue([SERIE]);
    const vue = await s.semaine(moi, '2026-11-30');
    const rdv = vue.elements.filter((e) => e.type === 'rendez_vous');
    expect(rdv).toEqual([
      expect.objectContaining({
        id: 'S1:2026-11-30T09:00:00.000Z',
        serieId: 'S1',
        occurrence: '2026-11-30T09:00:00.000Z',
        debut: '2026-11-30T09:00:00.000Z',
        regleTexte: 'Chaque semaine le lundi, 10 fois',
        modifiable: true,
      }),
    ]);
  });

  describe('modifier', () => {
    it('cette occurrence : une exception, la série prévenue par e-mail ; pas d’autre date', async () => {
      const { s, prisma, notifications, invitations } = monter();
      await s.modifier(moi, 'S1', {
        ...corps({ debut: '2026-11-30T14:00:00.000Z', fin: '2026-11-30T15:00:00.000Z', lieu: 'Chantier' }),
        portee: 'occurrence',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(prisma.exceptionRendezVous.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rendezVousId_occurrence: { rendezVousId: 'S1', occurrence: new Date('2026-11-30T09:00:00.000Z') } },
          create: expect.objectContaining({ debut: new Date('2026-11-30T14:00:00.000Z'), lieu: 'Chantier' }),
        }),
      );
      // Nouvelle heure : son rappel repartira.
      expect(prisma.rappelOccurrence.deleteMany).toHaveBeenCalled();
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rdv_modifie',
          destinataireIds: ['U2'],
          titre: expect.stringContaining('cette date seulement'),
        }),
      );
      expect(invitations.envoyer).toHaveBeenCalledWith('S1', 'REQUEST');
      expect(prisma.rendezVous.create).not.toHaveBeenCalled();
    });

    it('cette occurrence : changer les invités est refusé ; une date hors de la règle aussi', async () => {
      const { s } = monter();
      await expect(
        s.modifier(moi, 'S1', {
          ...corps({ inviteIds: ['U2', 'U3'] }),
          portee: 'occurrence',
          occurrence: '2026-11-30T09:00:00.000Z',
        }),
      ).rejects.toThrow('Les invités se changent pour toute la série.');
      await expect(
        s.modifier(moi, 'S1', { ...corps(), portee: 'occurrence', occurrence: '2026-12-01T09:00:00.000Z' }),
      ).rejects.toThrow('Occurrence introuvable');
    });

    it('celle-ci et les suivantes : la série s’arrête la veille, une nouvelle part avec ce qu’il reste', async () => {
      const { s, prisma, invitations } = monter();
      const r = await s.modifier(moi, 'S1', {
        ...corps({ titre: 'Point hebdo (nouveau)', regle: SERIE.regle }),
        portee: 'suivantes',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(r).toEqual({ ok: true, id: 'S2' });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ regle: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261129T235959Z' }),
        }),
      );
      expect(prisma.exceptionRendezVous.deleteMany).toHaveBeenCalledWith({
        where: { rendezVousId: 'S1', occurrence: { gte: new Date('2026-11-30T09:00:00.000Z') } },
      });
      // 10 fois au départ, 2 déjà passées (16 et 23) : il en reste 8.
      expect(prisma.rendezVous.create.mock.calls[0][0].data).toMatchObject({
        titre: 'Point hebdo (nouveau)',
        debut: new Date('2026-11-30T09:00:00.000Z'),
        regle: 'FREQ=WEEKLY;BYDAY=MO;COUNT=8',
      });
      expect(invitations.envoyer.mock.calls).toEqual([
        ['S1', 'REQUEST'],
        ['S2', 'REQUEST'],
      ]);
    });

    it('celle-ci et les suivantes depuis la première : toute la série, sans nouvelle série', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', {
        ...corps({ debut: LUNDI, fin: '2026-11-16T11:00:00.000Z' }),
        portee: 'suivantes',
        occurrence: LUNDI,
      });
      expect(prisma.rendezVous.create).not.toHaveBeenCalled();
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fin: new Date('2026-11-16T11:00:00.000Z') }) }),
      );
    });

    it('toute la série, heure seule changée : les dates annulées restent annulées, décalées ; les modifiées tombent', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...SERIE,
        exceptions: [
          { occurrence: new Date('2026-11-23T09:00:00.000Z'), annulee: true },
          {
            occurrence: new Date('2026-11-30T09:00:00.000Z'),
            annulee: false,
            debut: new Date('2026-11-30T15:00:00.000Z'),
          },
        ],
      });
      await s.modifier(moi, 'S1', {
        ...corps({ debut: '2026-11-16T14:00:00.000Z', fin: '2026-11-16T15:00:00.000Z' }),
        portee: 'toutes',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            debut: new Date('2026-11-16T14:00:00.000Z'),
            fin: new Date('2026-11-16T15:00:00.000Z'),
          }),
        }),
      );
      expect(prisma.exceptionRendezVous.deleteMany).toHaveBeenCalledWith({ where: { rendezVousId: 'S1' } });
      expect(prisma.exceptionRendezVous.createMany).toHaveBeenCalledWith({
        data: [{ rendezVousId: 'S1', occurrence: new Date('2026-11-23T14:00:00.000Z'), annulee: true }],
      });
    });

    it('toute la série déplacée à un autre jour : la règle suit le jour, les exceptions tombent', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...SERIE,
        exceptions: [{ occurrence: new Date('2026-11-23T09:00:00.000Z'), annulee: true }],
      });
      await s.modifier(moi, 'S1', {
        ...corps({ debut: '2026-11-18T09:00:00.000Z', fin: '2026-11-18T10:00:00.000Z', regle: SERIE.regle }),
        portee: 'toutes',
      });
      expect(prisma.rendezVous.updateMany.mock.calls[0][0].data.regle).toBe('FREQ=WEEKLY;BYDAY=WE;COUNT=10');
      expect(prisma.exceptionRendezVous.createMany).not.toHaveBeenCalled();
    });
  });

  describe('annuler', () => {
    it('cette occurrence : marquée annulée, les invités prévenus pour cette date', async () => {
      const { s, prisma, notifications, invitations } = monter();
      await s.annuler(moi, 'S1', 'occurrence', '2026-11-30T09:00:00.000Z');
      expect(prisma.exceptionRendezVous.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ annulee: true }), update: { annulee: true } }),
      );
      expect(prisma.rendezVous.update).not.toHaveBeenCalled(); // la série reste
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rdv_annule', destinataireIds: ['U2'] }),
      );
      expect(invitations.envoyer).toHaveBeenCalledWith('S1', 'REQUEST');
    });

    it('celle-ci et les suivantes : la série s’arrête la veille ; depuis la première : toute la série', async () => {
      const a = monter();
      await a.s.annuler(moi, 'S1', 'suivantes', '2026-11-30T09:00:00.000Z');
      expect(a.prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ regle: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261129T235959Z' }),
        }),
      );
      const b = monter();
      await b.s.annuler(moi, 'S1', 'suivantes', LUNDI);
      expect(b.prisma.rendezVous.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ annuleLe: expect.any(Date) }) }),
      );
      expect(b.invitations.envoyer).toHaveBeenCalledWith('S1', 'CANCEL');
    });
  });

  it('disponibilités : une série n’occupe que les créneaux de ses occurrences', async () => {
    const { s, prisma } = monter();
    jest.useFakeTimers({ now: new Date('2026-11-20T08:00:00.000Z'), doNotFake: ['nextTick', 'queueMicrotask'] });
    try {
      prisma.rendezVous.findMany.mockResolvedValue([{ ...SERIE }]);
      const lundi = await s.disponibilites(moi, '2026-11-30T09:30:00.000Z', '2026-11-30T10:30:00.000Z', ['U2']);
      // U2, invité ; l'organisateur U1 n'était pas parmi les personnes regardées.
      expect(lundi.occupes).toEqual(['U2']);
      const mardi = await s.disponibilites(moi, '2026-12-01T09:30:00.000Z', '2026-12-01T10:30:00.000Z', ['U2']);
      expect(mardi.occupes).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

// Compléments (16/11/2026) : « toutes » qui change la règle, « suivantes »
// avec une autre règle, portée sur un rendez-vous unique, agenda d'un
// collègue, règle vide.
describe('Agenda · récurrence (compléments)', () => {
  describe('création : règle vide', () => {
    it.each([[null], [''], ['   ']])('regle %p : un rendez-vous unique', async (regle) => {
      const { s, prisma } = monter();
      await s.creer(moi, { ...corps({ inviteIds: [] }), debut: LUNDI, fin: '2026-11-16T10:00:00.000Z', regle });
      expect(prisma.rendezVous.create.mock.calls[0][0].data.regle).toBeNull();
    });

    it('une fin le jour même du premier rendez-vous est acceptée', async () => {
      const { s, prisma } = monter();
      await s.creer(moi, {
        ...corps({ inviteIds: [] }),
        debut: LUNDI,
        fin: '2026-11-16T10:00:00.000Z',
        regle: 'FREQ=DAILY;UNTIL=20261116',
      });
      expect(prisma.rendezVous.create.mock.calls[0][0].data.regle).toBe('FREQ=DAILY;UNTIL=20261116T235959Z');
    });
  });

  describe('modifier toute la série', () => {
    it('une nouvelle règle : exceptions et rappels d’occurrences supprimés, invités prévenus', async () => {
      const { s, prisma, notifications, invitations } = monter();
      await s.modifier(moi, 'S1', {
        // Toute la série : l'écran envoie les valeurs de la série (son 1er rendez-vous).
        ...corps({ debut: LUNDI, fin: '2026-11-16T10:00:00.000Z', regle: 'FREQ=WEEKLY;BYDAY=WE,MO;COUNT=10' }),
        portee: 'toutes',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ regle: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10', debut: new Date(LUNDI) }),
        }),
      );
      expect(prisma.exceptionRendezVous.deleteMany).toHaveBeenCalledWith({ where: { rendezVousId: 'S1' } });
      expect(prisma.rappelOccurrence.deleteMany).toHaveBeenCalledWith({ where: { rendezVousId: 'S1' } });
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rdv_modifie', destinataireIds: ['U2'] }),
      );
      expect(invitations.envoyer).toHaveBeenCalledWith('S1', 'REQUEST', { destinataires: ['U2'] });
    });

    it('retirer la répétition : la série redevient un rendez-vous unique à la date de la première', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', {
        ...corps({ debut: LUNDI, fin: '2026-11-16T10:00:00.000Z', regle: null }),
        portee: 'toutes',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ regle: null, debut: new Date(LUNDI) }) }),
      );
      expect(prisma.exceptionRendezVous.deleteMany).toHaveBeenCalledWith({ where: { rendezVousId: 'S1' } });
    });

    it('seul le titre change : les exceptions sont gardées', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', {
        ...corps({ debut: LUNDI, fin: '2026-11-16T10:00:00.000Z', titre: 'Point hebdo (renommé)' }),
        portee: 'toutes',
      });
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ titre: 'Point hebdo (renommé)', regle: SERIE.regle }),
        }),
      );
      expect(prisma.exceptionRendezVous.deleteMany).not.toHaveBeenCalled();
      expect(prisma.rappelOccurrence.deleteMany).not.toHaveBeenCalled();
    });

    it('une règle hors du sous-ensemble est refusée, rien n’est écrit', async () => {
      const { s, prisma } = monter();
      await expect(s.modifier(moi, 'S1', { ...corps({ regle: 'FREQ=HOURLY' }), portee: 'toutes' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.rendezVous.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('modifier celle-ci et les suivantes', () => {
    const suivantes = (x: Record<string, unknown>) => ({
      ...corps(x),
      portee: 'suivantes' as const,
      occurrence: '2026-11-30T09:00:00.000Z',
    });

    it('une autre règle reçue : prise telle quelle, le nombre de fois n’est pas recalculé', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', suivantes({ regle: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5' }));
      expect(prisma.rendezVous.create.mock.calls[0][0].data.regle).toBe('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5');
      // L'ancienne série s'arrête quand même la veille.
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ regle: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261129T235959Z' }),
        }),
      );
    });

    it('règle absente : la même règle, avec ce qu’il reste du nombre de fois', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', suivantes({}));
      expect(prisma.rendezVous.create.mock.calls[0][0].data.regle).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=8');
    });

    it('sans répétition : la suite devient un rendez-vous unique', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', suivantes({ regle: null }));
      expect(prisma.rendezVous.create.mock.calls[0][0].data.regle).toBeNull();
    });

    it('une règle qui finit avant la nouvelle première date est refusée, rien n’est écrit', async () => {
      const { s, prisma } = monter();
      await expect(s.modifier(moi, 'S1', suivantes({ regle: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261123' }))).rejects.toThrow(
        'La répétition finit avant le premier rendez-vous.',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ajouter un invité sans l’Écriture de « Réunions » est refusé', async () => {
      const { s, prisma } = monter();
      await expect(
        s.modifier({ ...moi, permissions: { agenda: 'LES' } }, 'S1', suivantes({ inviteIds: ['U2', 'U3'] })),
      ).rejects.toThrow('Inviter des collègues demande l’Écriture de « Réunions ».');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // Corrigé le 16/11/2026 (règle recalée sur le nouveau jour ; champ vidé = « '' »).
    it('déplacée vers un autre jour : la nouvelle série commence bien à la date choisie', async () => {
      const { s, prisma } = monter();
      await s.modifier(
        moi,
        'S1',
        suivantes({ debut: '2026-12-01T09:00:00.000Z', fin: '2026-12-01T10:00:00.000Z', regle: SERIE.regle }),
      );
      const creee = prisma.rendezVous.create.mock.calls[0][0].data;
      const vue = occurrencesDans(
        { ...creee, exceptions: [] },
        new Date('2026-11-30T00:00:00Z'),
        new Date('2026-12-07T00:00:00Z'),
      );
      expect(vue.map((o) => o.debut.toISOString())).toEqual(['2026-12-01T09:00:00.000Z']);
    });
  });

  describe('modifier cette occurrence', () => {
    // Corrigé le 16/11/2026 (règle recalée sur le nouveau jour ; champ vidé = « '' »).
    it('vider le lieu de cette date seulement : l’occurrence n’a plus de lieu', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', {
        ...corps({ lieu: '' }),
        portee: 'occurrence',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      const ecrite = prisma.exceptionRendezVous.upsert.mock.calls[0][0].create;
      const [vue] = occurrencesDans(
        { ...SERIE, exceptions: [{ annulee: false, ...ecrite }] },
        new Date('2026-11-30T00:00:00Z'),
        new Date('2026-12-07T00:00:00Z'),
      );
      expect(vue.lieu).toBeNull();
    });

    it('sur une occurrence déjà modifiée, la même heure ne relance pas son rappel', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...SERIE,
        exceptions: [{ occurrence: new Date('2026-11-30T09:00:00.000Z'), debut: new Date('2026-11-30T14:00:00.000Z') }],
      });
      await s.modifier(moi, 'S1', {
        ...corps({ debut: '2026-11-30T14:00:00.000Z', fin: '2026-11-30T15:00:00.000Z', titre: 'Autre titre' }),
        portee: 'occurrence',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(prisma.exceptionRendezVous.upsert).toHaveBeenCalled();
      expect(prisma.rappelOccurrence.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('annuler', () => {
    it('« cette occurrence » sur un rendez-vous unique : la portée est ignorée, il est annulé entièrement', async () => {
      const { s, prisma, notifications, invitations } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({ ...SERIE, regle: null });
      await s.annuler(moi, 'S1', 'occurrence', '2026-11-30T09:00:00.000Z');
      expect(prisma.exceptionRendezVous.upsert).not.toHaveBeenCalled();
      expect(prisma.rendezVous.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'S1' }, data: expect.objectContaining({ annuleLe: expect.any(Date) }) }),
      );
      expect(notifications.envoyer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rdv_annule', destinataireIds: ['U2'] }),
      );
      expect(invitations.envoyer).toHaveBeenCalledWith('S1', 'CANCEL');
    });

    it('une série sans portée, ou « toutes » : toute la série est annulée', async () => {
      for (const portee of [undefined, 'toutes' as const]) {
        const { s, prisma, invitations } = monter();
        await s.annuler(moi, 'S1', portee, '2026-11-30T09:00:00.000Z');
        expect(prisma.rendezVous.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ annuleLe: expect.any(Date) }) }),
        );
        expect(prisma.exceptionRendezVous.upsert).not.toHaveBeenCalled();
        expect(invitations.envoyer).toHaveBeenCalledWith('S1', 'CANCEL');
      }
    });

    it('« cette occurrence » sans date, ou à une date que la règle ne donne pas : refusé, rien n’est écrit', async () => {
      const { s, prisma } = monter();
      await expect(s.annuler(moi, 'S1', 'occurrence')).rejects.toThrow('Occurrence introuvable');
      await expect(s.annuler(moi, 'S1', 'occurrence', '2026-12-01T09:00:00.000Z')).rejects.toThrow(
        'Occurrence introuvable',
      );
      // Au-delà des 10 fois (la 10e est le 18 janvier 2027).
      await expect(s.annuler(moi, 'S1', 'occurrence', '2027-01-25T09:00:00.000Z')).rejects.toThrow(
        'Occurrence introuvable',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.rendezVous.update).not.toHaveBeenCalled();
    });

    it('un autre que l’organisateur ne peut annuler aucune occurrence', async () => {
      const { s, prisma } = monter();
      await expect(s.annuler({ ...moi, userId: 'U2' }, 'S1', 'occurrence', '2026-11-30T09:00:00.000Z')).rejects.toThrow(
        'Seul l’organisateur annule ce rendez-vous.',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('lecture de l’agenda d’un collègue', () => {
    const lecteur = { ...moi, permissions: { agenda: 'LES', 'agenda.autres': 'L' } };

    it('ses occurrences de la période, sans action pour le lecteur, avec la réponse du collègue', async () => {
      const { s, prisma } = monter();
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 'U2', prenom: 'Moussa', nom: 'Sow' });
      // Série organisée par U3, à laquelle U2 est invité et a dit oui.
      prisma.rendezVous.findMany.mockResolvedValue([
        { ...SERIE, organisateurId: 'U3', invites: [{ utilisateurId: 'U2', reponse: 'oui' }] },
      ]);
      const vue = await s.semaine(lecteur, '2026-11-30', 'U2');
      expect(prisma.rendezVous.findMany.mock.calls[0][0].where.AND).toContainEqual({
        OR: [{ organisateurId: 'U2' }, { invites: { some: { utilisateurId: 'U2' } } }],
      });
      expect(vue.elements.filter((e) => e.type === 'rendez_vous')).toEqual([
        expect.objectContaining({
          id: 'S1:2026-11-30T09:00:00.000Z',
          serieId: 'S1',
          occurrence: '2026-11-30T09:00:00.000Z',
          regleTexte: 'Chaque semaine le lundi, 10 fois',
          modifiable: false,
          annulable: false,
          jeSuisOrganisateur: false,
          maReponse: 'oui',
          inviteIds: [],
        }),
      ]);
    });

    it('sans le droit « Agenda des autres » : refusé', async () => {
      const { s, prisma } = monter();
      await expect(s.semaine(moi, '2026-11-30', 'U2')).rejects.toThrow('Agenda des autres');
      expect(prisma.rendezVous.findMany).not.toHaveBeenCalled();
    });

    it('une occurrence modifiée est signalée, avec ses propres heures', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findMany.mockResolvedValue([
        {
          ...SERIE,
          exceptions: [
            {
              occurrence: new Date('2026-11-30T09:00:00.000Z'),
              annulee: false,
              titre: null,
              debut: new Date('2026-11-30T14:00:00.000Z'),
              fin: new Date('2026-11-30T15:00:00.000Z'),
              lieu: null,
              description: null,
              lienVisio: null,
            },
          ],
        },
      ]);
      const vue = await s.semaine(moi, '2026-11-30');
      expect(vue.elements.filter((e) => e.type === 'rendez_vous')).toEqual([
        expect.objectContaining({
          id: 'S1:2026-11-30T09:00:00.000Z',
          debut: '2026-11-30T14:00:00.000Z',
          occurrenceModifiee: true,
          lieu: 'Salle A',
        }),
      ]);
    });
  });

  // Correctifs de la relecture (16/11/2026).
  describe('relecture', () => {
    it('répondre à une série dont la 1re date est passée : accepté tant qu’une occurrence reste à venir', async () => {
      const { s, prisma, notifications } = monter();
      jest.useFakeTimers({ now: new Date('2026-12-02T08:00:00.000Z'), doNotFake: ['nextTick', 'queueMicrotask'] });
      try {
        prisma.rendezVous.findFirst.mockResolvedValue({ ...SERIE, invites: [{ utilisateurId: 'U1', reponse: null }] });
        Object.assign(prisma, { inviteRendezVous: { ...prisma.inviteRendezVous, update: jest.fn() } });
        await s.repondre(moi, 'S1', 'oui');
        expect(notifications.envoyer).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'rdv_reponse',
            titre: expect.stringContaining('à partir du lundi 7 décembre'),
          }),
        );
        // Série terminée (10 lundis : la dernière le 18 janvier 2027) : refusé.
        jest.setSystemTime(new Date('2027-02-01T08:00:00.000Z'));
        await expect(s.repondre(moi, 'S1', 'non')).rejects.toThrow('Cette réunion est passée.');
      } finally {
        jest.useRealTimers();
      }
    });

    it('celle-ci et les suivantes : les dates annulées et les réponses passent dans la nouvelle série', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...SERIE,
        invites: [{ utilisateurId: 'U2', reponse: 'non', reponduLe: new Date('2026-11-10T00:00:00.000Z') }],
        exceptions: [
          { occurrence: new Date('2026-11-23T09:00:00.000Z'), annulee: true }, // avant : reste à l'ancienne
          { occurrence: new Date('2026-12-14T09:00:00.000Z'), annulee: true }, // après : reportée
        ],
      });
      await s.modifier(moi, 'S1', {
        ...corps({ titre: 'Renommée', regle: SERIE.regle }),
        portee: 'suivantes',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      const data = prisma.rendezVous.create.mock.calls[0][0].data;
      expect(data.exceptions).toEqual({
        create: [{ occurrence: new Date('2026-12-14T09:00:00.000Z'), annulee: true }],
      });
      expect(data.invites.create).toEqual([
        { utilisateurId: 'U2', reponse: 'non', reponduLe: new Date('2026-11-10T00:00:00.000Z') },
      ]);
      // Même heure : la fin de série suit le nombre de fois restant (8 → 18 janvier).
      expect(data.finSerie).toEqual(new Date('2027-01-18T10:00:00.000Z'));
    });

    it('celle-ci et les suivantes à une autre heure : les réponses repartent à zéro', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...SERIE,
        invites: [{ utilisateurId: 'U2', reponse: 'oui', reponduLe: new Date() }],
      });
      await s.modifier(moi, 'S1', {
        ...corps({ debut: '2026-11-30T15:00:00.000Z', fin: '2026-11-30T16:00:00.000Z', regle: SERIE.regle }),
        portee: 'suivantes',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(prisma.rendezVous.create.mock.calls[0][0].data.invites.create).toEqual([{ utilisateurId: 'U2' }]);
    });

    it('une règle reçue hors de son premier rendez-vous est recalée dessus', async () => {
      const { s, prisma } = monter();
      prisma.utilisateurSocieteRole.findMany.mockResolvedValueOnce([{ utilisateurId: 'U2' }]);
      await s.creer(moi, {
        ...corps(),
        debut: '2026-11-17T09:00:00.000Z',
        fin: '2026-11-17T10:00:00.000Z',
        regle: 'FREQ=WEEKLY;BYDAY=MO',
      });
      expect(prisma.rendezVous.create.mock.calls[0][0].data).toMatchObject({
        regle: 'FREQ=WEEKLY;BYDAY=TU',
        finSerie: null,
      });
    });
  });

  // Deuxième relecture (16/11/2026).
  describe('relecture 2', () => {
    const suivantes = (x: Record<string, unknown>) => ({
      ...corps(x),
      portee: 'suivantes' as const,
      occurrence: '2026-11-30T09:00:00.000Z',
    });

    it('celle-ci et les suivantes : un nombre de fois changé ou retiré est pris tel quel', async () => {
      const a = monter();
      await a.s.modifier(moi, 'S1', suivantes({ regle: 'FREQ=WEEKLY;BYDAY=MO;COUNT=5' }));
      expect(a.prisma.rendezVous.create.mock.calls[0][0].data.regle).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=5');
      const b = monter();
      await b.s.modifier(moi, 'S1', suivantes({ regle: 'FREQ=WEEKLY;BYDAY=MO' }));
      expect(b.prisma.rendezVous.create.mock.calls[0][0].data).toMatchObject({
        regle: 'FREQ=WEEKLY;BYDAY=MO',
        finSerie: null,
      });
    });

    it('celle-ci et les suivantes, jour changé : les annulations suivent leur rang (plusieurs jours)', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...SERIE,
        regle: 'FREQ=WEEKLY;BYDAY=MO,WE',
        // Le mercredi 2 décembre (2e date à partir du lundi 30/11) est annulé.
        exceptions: [{ occurrence: new Date('2026-12-02T09:00:00.000Z'), annulee: true }],
      });
      // Décalée d'un jour : la nouvelle série part le mardi 1er décembre.
      await s.modifier(moi, 'S1', {
        ...corps({
          debut: '2026-12-01T09:00:00.000Z',
          fin: '2026-12-01T10:00:00.000Z',
          regle: 'FREQ=WEEKLY;BYDAY=TU,TH',
        }),
        portee: 'suivantes',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      // Sa 2e date : le jeudi 3 décembre.
      expect(prisma.rendezVous.create.mock.calls[0][0].data.exceptions).toEqual({
        create: [{ occurrence: new Date('2026-12-03T09:00:00.000Z'), annulee: true }],
      });
    });

    it('cette occurrence déplacée après la dernière : la série va jusque-là (visible, rappels)', async () => {
      const { s, prisma } = monter();
      prisma.rendezVous.findFirst.mockResolvedValue({
        ...SERIE,
        regle: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
        exceptions: [],
      });
      await s.modifier(moi, 'S1', {
        ...corps({ debut: '2026-12-04T09:00:00.000Z', fin: '2026-12-04T10:00:00.000Z' }),
        portee: 'occurrence',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      // Dernière date de la règle : le 30/11 à 10 h ; déplacée au 4/12.
      expect(prisma.rendezVous.update).toHaveBeenCalledWith({
        where: { id: 'S1' },
        data: { finSerie: new Date('2026-12-04T10:00:00.000Z') },
      });
    });

    it('cette occurrence : début déplacé, la fin est toujours gardée avec lui', async () => {
      const { s, prisma } = monter();
      await s.modifier(moi, 'S1', {
        ...corps({ debut: '2026-11-30T09:30:00.000Z', fin: '2026-11-30T10:00:00.000Z' }),
        portee: 'occurrence',
        occurrence: '2026-11-30T09:00:00.000Z',
      });
      expect(prisma.exceptionRendezVous.upsert.mock.calls[0][0].create).toMatchObject({
        debut: new Date('2026-11-30T09:30:00.000Z'),
        fin: new Date('2026-11-30T10:00:00.000Z'),
      });
    });

    it('une série modifiée sans portée : refusée (rien ne devine la portée)', async () => {
      const { s, prisma } = monter();
      await expect(s.modifier(moi, 'S1', corps())).rejects.toThrow('Précisez la portée');
      expect(prisma.rendezVous.updateMany).not.toHaveBeenCalled();
    });

    it('répondre à une série dont la prochaine date est dans plus de cinq ans : accepté', async () => {
      const { s, prisma } = monter();
      jest.useFakeTimers({ now: new Date('2027-01-01T08:00:00.000Z'), doNotFake: ['nextTick', 'queueMicrotask'] });
      try {
        prisma.rendezVous.findFirst.mockResolvedValue({
          ...SERIE,
          regle: 'FREQ=YEARLY;INTERVAL=6',
          invites: [{ utilisateurId: 'U1', reponse: null }],
        });
        Object.assign(prisma, { inviteRendezVous: { ...prisma.inviteRendezVous, update: jest.fn() } });
        await expect(s.repondre(moi, 'S1', 'oui')).resolves.toEqual({ ok: true });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
