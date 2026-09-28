import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('./mot-de-passe', () => ({ verifierMotDePasse: jest.fn().mockResolvedValue(true) }));

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
  const prisma = {
    utilisateur: { findUnique: jest.fn().mockResolvedValue(UTILISATEUR) },
    societe: { findUnique: jest.fn().mockResolvedValue(SOCIETE) },
    utilisateurSocieteRole: { findMany },
  } as unknown as PrismaService;
  const jwt = { sign: jest.fn().mockReturnValue('jeton') } as unknown as JwtService;
  return { svc: new AuthService(prisma, jwt), findMany };
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
