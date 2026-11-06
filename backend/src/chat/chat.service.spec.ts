import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatBus } from './chat.bus';
import { ChatService } from './chat.service';

// Trois profils face au chat :
//   societe_admin      → Général + toutes les cellules + ses DM
//   collaborateur      → Général + SA cellule + ses DM ; fiche obligatoire
//   rôle de direction  → (CFO, Dir. GC…) sans fiche : Général + ses DM ;
//                        pas de cellule, et ce n'est pas une erreur
// Et l'annuaire des DM doit montrer ces rôles de direction, sinon personne ne
// peut les joindre.

function svc(
  opts: {
    collab?: { celluleId: string | null } | null;
    collabs?: unknown[];
    titulaires?: unknown[];
  } = {},
) {
  const canalFindMany = jest.fn().mockResolvedValue([]);
  const collabFindFirst = jest.fn().mockResolvedValue(opts.collab ?? null);
  const usrFindMany = jest.fn().mockResolvedValue(opts.titulaires ?? []);
  const prisma = {
    canal: {
      findFirst: jest.fn().mockResolvedValue({ id: 'GEN' }),
      findMany: canalFindMany,
      upsert: jest.fn().mockResolvedValue({}),
    },
    cellule: { findMany: jest.fn().mockResolvedValue([]) },
    collaborateur: {
      findFirst: collabFindFirst,
      findMany: jest.fn().mockResolvedValue(opts.collabs ?? []),
    },
    lectureCanal: { findMany: jest.fn().mockResolvedValue([]) },
    utilisateurSocieteRole: { findMany: usrFindMany },
  } as unknown as PrismaService;
  return { s: new ChatService(prisma, {} as ChatBus, {} as never, {} as never), canalFindMany, usrFindMany };
}

const acteur = (role: string) => ({ userId: 'U1', societeId: 'S1', role });
const typesDemandes = (m: jest.Mock) =>
  m.mock.calls[0][0].where.OR.map((c: { type: unknown; celluleId?: string }) =>
    c.celluleId
      ? `cellule:${c.celluleId}`
      : typeof c.type === 'object' && c.type
        ? (c.type as { in: string[] }).in.join('+')
        : String(c.type),
  );

describe('ChatService.listerCanaux', () => {
  it('compte hors back-office sans fiche → 403 (inchangé)', async () => {
    const { s } = svc({ collab: null });
    await expect(s.listerCanaux(acteur('holding_admin'))).rejects.toThrow(ForbiddenException);
  });

  it('rôle de direction sans fiche → Général + DM + ses groupes, aucune cellule', async () => {
    const { s, canalFindMany } = svc({ collab: null });
    await expect(s.listerCanaux(acteur('CFO'))).resolves.toEqual([]);
    expect(typesDemandes(canalFindMany)).toEqual(['general', 'direct', 'direct', 'groupe+projet']);
  });

  it('rôle de direction AVEC fiche → sa cellule en plus', async () => {
    const { s, canalFindMany } = svc({ collab: { celluleId: 'CEL1' } });
    await s.listerCanaux(acteur('Dir. GC'));
    expect(typesDemandes(canalFindMany)).toEqual(['general', 'cellule:CEL1', 'direct', 'direct', 'groupe+projet']);
  });

  it('holding_admin sans fiche → 403 (hors back-office, pas de chat)', async () => {
    const { s } = svc({ collab: null });
    await expect(s.listerCanaux(acteur('holding_admin'))).rejects.toThrow(ForbiddenException);
  });
});

describe('ChatService.annuaire', () => {
  const u = (id: string, prenom: string, nom: string) => ({ id, prenom, nom });

  it('liste les rôles de direction avec le nom du rôle, l’admin en « Administration »', async () => {
    const { s } = svc({
      titulaires: [
        { utilisateur: u('U2', 'Awa', 'Diop'), role: { nom: 'societe_admin' } },
        { utilisateur: u('U3', 'Bineta', 'Sarr'), role: { nom: 'CFO' } },
        { utilisateur: u('U4', 'Cheikh', 'Fall'), role: { nom: 'Dir. GC' } },
      ],
    });
    const res = await s.annuaire(acteur('collaborateur'));
    expect(res.map((m) => `${m.prenom} ${m.nom} | ${m.role}`)).toEqual([
      'Awa Diop | Administration',
      'Cheikh Fall | Dir. GC',
      'Bineta Sarr | CFO',
    ]);
  });

  it('une fiche collaborateur prime (libellé métier), l’appelant est exclu', async () => {
    const { s } = svc({
      collabs: [
        { utilisateurId: 'U3', prenom: 'Bineta', nom: 'Sarr', role: 'Architecte', cellule: { nom: 'Cellule Archi 1' } },
      ],
      titulaires: [
        { utilisateur: u('U3', 'Bineta', 'Sarr'), role: { nom: 'CFO' } },
        { utilisateur: u('U1', 'Moi', 'Même'), role: { nom: 'Dir. GC' } },
      ],
    });
    const res = await s.annuaire(acteur('Dir. GC'));
    expect(res).toEqual([
      {
        utilisateurId: 'U3',
        prenom: 'Bineta',
        nom: 'Sarr',
        nomAffiche: null,
        photoUrl: null,
        role: 'Architecte',
        cellule: 'Cellule Archi 1',
      },
    ]);
  });

  it('même appartenance qu’au login (société OU transverse), sans holding_admin ni rôle supprimé', async () => {
    const { s, usrFindMany } = svc();
    await s.annuaire(acteur('CFO'));
    expect(usrFindMany.mock.calls[0][0].where).toEqual({
      OR: [{ societeId: 'S1' }, { societeId: null }],
      role: { nom: { not: 'holding_admin' }, supprimeLe: null },
    });
  });
});

// Groupes de discussion et mentions (01/11/2026).
describe('ChatService · groupes et mentions', () => {
  const acteur = { userId: 'U1', societeId: 'S1', role: 'Dir. GC' };
  const monter = () => {
    const bus = { publier: jest.fn() };
    const notifications = { envoyer: jest.fn() };
    const push = { envoyer: jest.fn() };
    const auteur = { id: 'U1', prenom: 'Cheikh', nom: 'Fall', nomAffiche: null, photoCle: null };
    const prisma = {
      canal: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'G1', type: 'groupe', nom: 'Chantier Ouakam', _count: { membres: 3 } }),
        findUnique: jest.fn().mockImplementation(({ select }) =>
          Promise.resolve({
            id: 'G1',
            societeId: 'S1',
            type: 'groupe',
            nom: 'Chantier Ouakam',
            creeParId: 'U1',
            societe: { slug: 'gc' },
            celluleId: null,
            participant1Id: null,
            participant2Id: null,
            cellule: null,
            participant1: null,
            participant2: null,
            membres: select?.membres
              ? [{ utilisateurId: 'U1' }, { utilisateurId: 'U2' }, { utilisateurId: 'U3' }]
              : undefined,
          }),
        ),
        update: jest.fn(),
        delete: jest.fn(),
      },
      membreCanal: {
        findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2', ajouteLe: new Date() }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn(),
      },
      message: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'M1',
            canalId: 'G1',
            texte: data.texte,
            systeme: !!data.systeme,
            mentions: data.mentions ?? [],
            createdAt: new Date(),
            modifieLe: null,
            supprimeLe: null,
            reponseA: null,
            pieces: [],
            reactions: [],
            auteur,
          }),
        ),
      },
      utilisateur: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            (where.id.in as string[]).map((id) => ({
              id,
              prenom: id === 'U1' ? 'Cheikh' : 'Awa',
              nom: id,
              nomAffiche: null,
              photoCle: null,
            })),
          ),
        ),
      },
      collaborateur: { findMany: jest.fn().mockResolvedValue([]) },
      utilisateurSocieteRole: {
        findMany: jest.fn().mockResolvedValue(
          ['U2', 'U3'].map((id) => ({
            utilisateur: { id, prenom: 'Awa', nom: id, nomAffiche: null, photoCle: null },
            role: { nom: 'Salarié' },
          })),
        ),
      },
    } as unknown as PrismaService;
    return {
      s: new ChatService(prisma, bus as unknown as ChatBus, notifications as never, push as never),
      prisma,
      bus,
      notifications,
    };
  };

  it('crée un groupe : le créateur et ses membres, une ligne « a créé le groupe », les membres prévenus', async () => {
    const { s, prisma, notifications } = monter();
    const g = await s.creerGroupe(acteur, ' Chantier Ouakam ', ['U2', 'U3']);
    expect(g).toMatchObject({ id: 'G1', type: 'groupe', nom: 'Chantier Ouakam', creeParId: 'U1', membres: 3 });
    const data = (prisma.canal.create as jest.Mock).mock.calls[0][0].data;
    expect(data.membres.create).toEqual([{ utilisateurId: 'U1' }, { utilisateurId: 'U2' }, { utilisateurId: 'U3' }]);
    expect((prisma.message.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ systeme: true });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'groupe_chat', destinataireIds: ['U2', 'U3'], canalId: 'G1' }),
    );
  });

  it('refuse une personne hors de la société', async () => {
    await expect(monter().s.creerGroupe(acteur, 'Groupe', ['U2', 'INCONNU'])).rejects.toThrow(
      'pas membre de la société',
    );
  });

  it('mention : seulement un lecteur de la conversation, prévenu avec la conversation à ouvrir', async () => {
    const { s, prisma, notifications } = monter();
    const m = await s.envoyer('G1', 'U1', 'Bonjour @Awa U2', ['U2', 'U9', 'U1']);
    expect((prisma.message.create as jest.Mock).mock.calls[0][0].data.mentions).toEqual(['U2']);
    expect(m.mentions).toEqual([{ id: 'U2', nom: 'Awa U2' }]);
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mention_chat', destinataireIds: ['U2'], canalId: 'G1' }),
    );
  });

  it('seul le créateur retire un membre ; chacun peut quitter', async () => {
    const { s } = monter();
    await expect(s.retirerMembre({ ...acteur, userId: 'U2' }, 'G1', 'U3')).rejects.toThrow(ForbiddenException);
    await expect(s.retirerMembre({ ...acteur, userId: 'U2' }, 'G1', 'U2')).resolves.toEqual({ ok: true });
  });
});
