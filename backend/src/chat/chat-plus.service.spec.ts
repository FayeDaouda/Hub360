import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { ChatBus } from './chat.bus';
import { ChatService } from './chat.service';

// Messagerie, suite (02/11/2026) : modifier/supprimer (15 min), réactions,
// @tous, conversation du projet tenue à jour.
const auteur = { id: 'U1', prenom: 'Cheikh', nom: 'Fall', nomAffiche: null, photoCle: null };
const acteur = { userId: 'U1', societeId: 'S1', role: 'Dir. GC' };

function monter(opts: { type?: string; envoyeIlYa?: number; auteurId?: string } = {}) {
  const bus = { publier: jest.fn() };
  const notifications = { envoyer: jest.fn() };
  const push = { envoyer: jest.fn() };
  const message = (data: Record<string, unknown> = {}) => ({
    id: 'M1',
    canalId: 'C1',
    texte: 'Bonjour',
    systeme: false,
    mentions: [],
    createdAt: new Date(),
    modifieLe: null,
    supprimeLe: null,
    reponseA: null,
    pieces: [],
    reactions: [],
    auteur,
    ...data,
  });
  const prisma = {
    canal: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'C1',
        societeId: 'S1',
        type: opts.type ?? 'groupe',
        nom: 'Chantier',
        celluleId: null,
        participant1Id: null,
        participant2Id: null,
        cellule: null,
        participant1: null,
        participant2: null,
        societe: { slug: 'gc' },
        membres: [{ utilisateurId: 'U1' }, { utilisateurId: 'U2' }, { utilisateurId: 'U3' }],
      }),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'M1',
        auteurId: opts.auteurId ?? 'U1',
        systeme: false,
        supprimeLe: null,
        createdAt: new Date(Date.now() - (opts.envoyeIlYa ?? 60_000)),
        _count: { pieces: 0 },
      }),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(message({ texte: data.texte, mentions: data.mentions }))),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(message(data))),
    },
    pieceMessage: { deleteMany: jest.fn() },
    reactionMessage: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ emoji: '👍', utilisateur: auteur }]),
    },
    utilisateur: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            (where.id.in as string[]).map((id) => ({ id, prenom: 'P', nom: id, nomAffiche: null, photoCle: null })),
          ),
        ),
    },
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return {
    s: new ChatService(prisma, bus as unknown as ChatBus, notifications as never, push as never),
    prisma,
    bus,
    notifications,
    push,
  };
}

describe('ChatService · messages', () => {
  it('son auteur modifie dans les 15 minutes ; ni un autre, ni plus tard', async () => {
    const { s, bus } = monter();
    const m = await s.modifier(acteur, 'C1', 'M1', 'Bonjour à tous');
    expect(m.texte).toBe('Bonjour à tous');
    expect(bus.publier).toHaveBeenCalledWith(expect.objectContaining({ kind: 'message_modifie' }));
    await expect(monter({ auteurId: 'U2' }).s.modifier(acteur, 'C1', 'M1', 'x')).rejects.toThrow(ForbiddenException);
    await expect(monter({ envoyeIlYa: 16 * 60_000 }).s.supprimer(acteur, 'C1', 'M1')).rejects.toThrow('15 minutes');
  });

  it('supprimé : texte, mentions et pièces effacés, la ligne reste « supprimée »', async () => {
    const { s, prisma } = monter();
    await s.supprimer(acteur, 'C1', 'M1');
    expect((prisma.pieceMessage.deleteMany as jest.Mock).mock.calls[0][0]).toEqual({ where: { messageId: 'M1' } });
    expect((prisma.message.update as jest.Mock).mock.calls[0][0].data).toMatchObject({ texte: '', mentions: [] });
  });

  it('réaction : ajoutée, diffusée à la conversation', async () => {
    const { s, prisma, bus } = monter();
    const r = await s.reagir(acteur, 'C1', 'M1', '👍');
    expect(prisma.reactionMessage.create).toHaveBeenCalled();
    expect(r).toEqual([{ emoji: '👍', ids: ['U1'], noms: ['Cheikh Fall'] }]);
    expect(bus.publier).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reactions' }));
    await expect(s.reagir(acteur, 'C1', 'M1', '💩')).rejects.toThrow('Réaction inconnue.');
  });

  it('@tous prévient chaque lecteur (pas dans « Général ») ; les autres lecteurs reçoivent la notification système', async () => {
    const { s, notifications, push } = monter();
    await s.envoyer('C1', 'U1', 'Réunion à 10 h', [], { mentionTous: true });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ destinataireIds: ['U2', 'U3'] }));
    const general = monter({ type: 'general' });
    await general.s.envoyer('C1', 'U1', 'Bonjour', [], { mentionTous: true });
    expect(general.notifications.envoyer).not.toHaveBeenCalled();
    const simple = monter();
    await simple.s.envoyer('C1', 'U1', 'Bonjour');
    expect(simple.push.envoyer).toHaveBeenCalledWith(
      ['U2', 'U3'],
      expect.objectContaining({ url: '/admin/gc?conversation=C1' }),
      'messagerie',
    );
    expect(push.envoyer).toHaveBeenCalledWith([], expect.anything(), 'messagerie');
  });
});

describe('ChatService · conversation du projet', () => {
  it('membres = équipes + assignés + Dir. GC ; les partants sont retirés', async () => {
    const prisma = {
      projet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'P1',
          societeId: 'S1',
          code: 'NF_OUA.26',
          ouvertLe: '2026-11-02',
          client: { nom: 'SCI Ndiaye' },
          cellules: [{ celluleId: 'CEL1' }],
          canal: { id: 'CP' },
        }),
      },
      collaborateur: { findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2' }]) },
      tacheProjet: { findMany: jest.fn().mockResolvedValue([{ assigne: { utilisateurId: 'U3' } }]) },
      utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'DG' }]) },
      membreCanal: {
        findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2' }, { utilisateurId: 'PARTI' }]),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const s = new ChatService(prisma, {} as ChatBus, {} as never, {} as never);
    expect(await s.synchroniserCanalProjet('P1')).toBe('CP');
    expect((prisma.membreCanal.createMany as jest.Mock).mock.calls[0][0].data).toEqual([
      { canalId: 'CP', utilisateurId: 'U3' },
      { canalId: 'CP', utilisateurId: 'DG' },
    ]);
    expect((prisma.membreCanal.deleteMany as jest.Mock).mock.calls[0][0]).toEqual({
      where: { canalId: 'CP', utilisateurId: { in: ['PARTI'] } },
    });
  });
});
