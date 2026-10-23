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

function svc(opts: {
  collab?: { celluleId: string | null } | null;
  collabs?: unknown[];
  titulaires?: unknown[];
} = {}) {
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
  return { s: new ChatService(prisma, {} as ChatBus), canalFindMany, usrFindMany };
}

const acteur = (role: string) => ({ userId: 'U1', societeId: 'S1', role });
const typesDemandes = (m: jest.Mock) =>
  m.mock.calls[0][0].where.OR.map((c: { type: unknown; celluleId?: string }) =>
    c.celluleId ? `cellule:${c.celluleId}` : String(c.type),
  );

describe('ChatService.listerCanaux', () => {
  it('compte hors back-office sans fiche → 403 (inchangé)', async () => {
    const { s } = svc({ collab: null });
    await expect(s.listerCanaux(acteur('holding_admin'))).rejects.toThrow(ForbiddenException);
  });

  it('rôle de direction sans fiche → Général + DM, aucune cellule', async () => {
    const { s, canalFindMany } = svc({ collab: null });
    await expect(s.listerCanaux(acteur('CFO'))).resolves.toEqual([]);
    expect(typesDemandes(canalFindMany)).toEqual(['general', 'direct', 'direct']);
  });

  it('rôle de direction AVEC fiche → sa cellule en plus', async () => {
    const { s, canalFindMany } = svc({ collab: { celluleId: 'CEL1' } });
    await s.listerCanaux(acteur('Dir. GC'));
    expect(typesDemandes(canalFindMany)).toEqual(['general', 'cellule:CEL1', 'direct', 'direct']);
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
      { utilisateurId: 'U3', prenom: 'Bineta', nom: 'Sarr', nomAffiche: null, photoUrl: null, role: 'Architecte', cellule: 'Cellule Archi 1' },
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
