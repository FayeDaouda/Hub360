import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('./mot-de-passe', () => ({
  verifierMotDePasse: jest.fn().mockResolvedValue(true),
  hacherMotDePasse: jest.fn().mockResolvedValue('nouveau-hash'),
}));
import { verifierMotDePasse } from './mot-de-passe';

// Choix de l'affectation à la connexion : avant, un findFirst non ordonné
// prenait au hasard l'affectation de la société OU l'affectation transverse
// quand un compte avait les deux — on verrouille « la société d'abord ».

const SOCIETE = { id: 'S1', nom: 'Grey Concrete', slug: 'grey-concrete', actif: true };
const UTILISATEUR = {
  id: 'U1',
  email: 'a@b.c',
  nom: 'Sarr',
  prenom: 'Awa',
  actif: true,
  motDePasseHash: 'hash',
};

function affectation(societeId: string | null, nom: string, perms: [string, string][] = []) {
  return {
    societeId,
    role: { nom, permissions: perms.map(([cle, niveau]) => ({ module: { cle }, niveau })) },
  };
}

function svc(affectations: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(affectations);
  const update = jest.fn((a: { data: { motDePasseHash: string; sessionsValidesDepuis: Date } }) => a);
  const prisma = {
    utilisateur: { findUnique: jest.fn().mockResolvedValue(UTILISATEUR), update },
    societe: { findUnique: jest.fn().mockResolvedValue(SOCIETE) },
    utilisateurSocieteRole: { findMany },
    evenementCompte: { create: jest.fn((a: unknown) => a) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const sign = jest.fn().mockReturnValue('jeton');
  const jwt = { sign } as unknown as JwtService;
  return { svc: new AuthService(prisma, jwt), findMany, update, sign };
}

const DTO = { email: 'a@b.c', motDePasse: 'x', societeSlug: 'grey-concrete' };

describe('AuthService.login — choix de l’affectation', () => {
  it('préfère l’affectation de la société à l’affectation transverse, quel que soit l’ordre', async () => {
    const { svc: s } = svc([
      affectation(null, 'CEO (transverse)', [['finances_marges', 'validation']]),
      affectation('S1', 'Salarié', [['mon_espace', 'ecriture']]),
    ]);
    const res = await s.login(DTO);
    expect(res.role).toBe('Salarié');
    expect(res.permissions).toEqual({ mon_espace: 'ecriture' });
  });

  it('se rabat sur l’affectation transverse sans affectation dans la société', async () => {
    const { svc: s } = svc([affectation(null, 'holding_admin')]);
    expect((await s.login(DTO)).role).toBe('holding_admin');
  });

  it('refuse la connexion sans affectation', async () => {
    const { svc: s } = svc([]);
    await expect(s.login(DTO)).rejects.toThrow(UnauthorizedException);
  });

  it('ignore les rôles supprimés (filtre dans la requête)', async () => {
    const { svc: s, findMany } = svc([affectation('S1', 'Salarié')]);
    await s.login(DTO);
    expect(findMany.mock.calls[0][0].where.role).toEqual({ supprimeLe: null });
  });
});

describe('AuthService.changerMotDePasse', () => {
  it('mot de passe actuel incorrect → 400, rien n’est modifié', async () => {
    (verifierMotDePasse as jest.Mock).mockResolvedValueOnce(false);
    const { svc: s, update } = svc([affectation('S1', 'Salarié')]);
    await expect(s.changerMotDePasse('U1', 'grey-concrete', 'faux', 'nouveau-mdp-1')).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('nouveau identique à l’actuel → 400', async () => {
    const { svc: s } = svc([affectation('S1', 'Salarié')]);
    await expect(s.changerMotDePasse('U1', 'grey-concrete', 'meme-mdp-123', 'meme-mdp-123')).rejects.toThrow(BadRequestException);
  });

  it('change le hash, coupe les autres sessions et rend une session valide (iat ≥ coupure)', async () => {
    const { svc: s, update, sign } = svc([affectation('S1', 'Salarié')]);
    const res = await s.changerMotDePasse('U1', 'grey-concrete', 'ancien-mdp-1', 'nouveau-mdp-1');
    const data = update.mock.calls[0][0].data;
    expect(data.motDePasseHash).toBe('nouveau-hash');
    expect(data.sessionsValidesDepuis).toBeInstanceOf(Date);
    const { iat } = sign.mock.calls[0][0];
    expect(iat * 1000).toBeGreaterThanOrEqual(data.sessionsValidesDepuis.getTime());
    expect(res.access_token).toBe('jeton');
  });
});
