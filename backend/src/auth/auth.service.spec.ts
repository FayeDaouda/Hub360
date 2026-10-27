import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, dateEmission, doubleFacteurExige } from './auth.service';
import { base32, chiffrerSecret, codeAuPas, hacherCodeSecours, pasCourant } from './totp';

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
  const notifications = { envoyer: jest.fn() };
  const email = { envoyerAvisSecurite: jest.fn().mockResolvedValue({ envoye: true }) };
  return {
    email,
    svc: new AuthService(prisma, jwt, notifications as never, email as never),
    findMany,
    update,
    sign,
    notifications,
    evenement: (prisma as unknown as { evenementCompte: { create: jest.Mock } }).evenementCompte.create,
  };
}

const DTO = { email: 'a@b.c', motDePasse: 'x', societeSlug: 'grey-concrete' };
type Session = { role: string; permissions: Record<string, string> };

describe('AuthService.login — choix de l’affectation', () => {
  it('préfère l’affectation de la société à l’affectation transverse, quel que soit l’ordre', async () => {
    const { svc: s } = svc([
      affectation(null, 'CEO (transverse)', [['finances_marges', 'validation']]),
      affectation('S1', 'Salarié', [['mon_espace', 'ecriture']]),
    ]);
    const res = (await s.login(DTO)) as Session;
    expect(res.role).toBe('Salarié');
    expect(res.permissions).toEqual({ mon_espace: 'ecriture' });
  });

  it('se rabat sur l’affectation transverse sans affectation dans la société', async () => {
    const { svc: s } = svc([affectation(null, 'holding_admin')]);
    expect(((await s.login(DTO)) as Session).role).toBe('holding_admin');
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

// Session ouverte il y a une heure (lot B : le début voyage d'un jeton à l'autre).
const DEBUT = Math.floor(Date.now() / 1000) - 3600;

describe('AuthService.changerMotDePasse', () => {
  it('mot de passe actuel incorrect → 400, rien n’est modifié', async () => {
    (verifierMotDePasse as jest.Mock).mockResolvedValueOnce(false);
    const { svc: s, update } = svc([affectation('S1', 'Salarié')]);
    await expect(s.changerMotDePasse('U1', 'grey-concrete', 'faux', 'nouveau-mdp-1', DEBUT)).rejects.toThrow(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('nouveau identique à l’actuel → 400', async () => {
    const { svc: s } = svc([affectation('S1', 'Salarié')]);
    await expect(s.changerMotDePasse('U1', 'grey-concrete', 'meme-mdp-123', 'meme-mdp-123', DEBUT)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('change le hash, coupe les autres sessions et rend une session valide (iat ≥ coupure)', async () => {
    const { svc: s, update, sign, email } = svc([affectation('S1', 'Salarié')]);
    const res = await s.changerMotDePasse('U1', 'grey-concrete', 'ancien-mdp-1', 'nouveau-mdp-1', DEBUT);
    // Avis de sécurité à la personne (lot A).
    expect(email.envoyerAvisSecurite).toHaveBeenCalledWith(
      expect.objectContaining({ evenement: 'mot_de_passe_modifie', le: expect.any(Date) }),
    );
    const data = update.mock.calls[0][0].data;
    expect(data.motDePasseHash).toBe('nouveau-hash');
    expect(data.sessionsValidesDepuis).toBeInstanceOf(Date);
    const { iat, debut } = sign.mock.calls[0][0];
    expect(iat * 1000).toBeGreaterThanOrEqual(data.sessionsValidesDepuis.getTime());
    // Lot B : même début de session, le changement ne repousse pas les 12 h.
    expect(debut).toBe(DEBUT);
    expect(res.access_token).toBe('jeton');
  });
});

describe('Durée des sessions (lot B)', () => {
  const CONNECTE = {
    userId: 'U1',
    email: 'a@b.c',
    societeId: 'S1',
    societeSlug: 'grey-concrete',
    role: 'Salarié',
    permissions: { crm: 'aucun' },
  };
  const maintenant = () => Math.floor(Date.now() / 1000);

  it('connexion : la session commence avec le jeton, valable selon le rôle', async () => {
    const { svc: s, sign } = svc([affectation('S1', 'CFO')]);
    await s.login(DTO);
    const [contenu, options] = sign.mock.calls[0];
    expect(contenu.debut).toBe(contenu.iat);
    expect(options).toEqual({ expiresIn: 3600 });
  });

  it('prolongation : mêmes droits, même début, expiration repoussée', () => {
    const { svc: s, sign } = svc([]);
    const t = maintenant();
    const res = s.prolongerSession({ ...CONNECTE, debutSession: t - 3600, emissionJeton: t - 600 });
    const [contenu, options] = sign.mock.calls[0];
    expect(contenu).toMatchObject({ sub: 'U1', role: 'Salarié', permissions: { crm: 'aucun' }, debut: t - 3600 });
    expect(contenu.iat).toBeGreaterThanOrEqual(t);
    expect(options).toEqual({ expiresIn: 4 * 3600 });
    expect(res.access_token).toBe('jeton');
  });

  it('prolongation près des 12 h : le jeton s’arrête avec la session ; au-delà, refus', () => {
    const { svc: s, sign } = svc([]);
    const t = maintenant();
    s.prolongerSession({ ...CONNECTE, debutSession: t - 12 * 3600 + 600, emissionJeton: t - 60 });
    expect(sign.mock.calls[0][1].expiresIn).toBeLessThanOrEqual(600);
    expect(() => s.prolongerSession({ ...CONNECTE, debutSession: t - 12 * 3600, emissionJeton: t })).toThrow(
      UnauthorizedException,
    );
  });
});

describe('dateEmission', () => {
  it('sans coupure : seconde courante', () => {
    expect(dateEmission(null, 10_700)).toBe(10);
  });
  it('connexion dans la seconde d’une coupure : datée juste après la coupure (jeton accepté)', () => {
    expect(dateEmission(new Date(10_500), 10_700)).toBe(11);
  });
  it('coupure ancienne : seconde courante', () => {
    expect(dateEmission(new Date(5_000), 10_700)).toBe(10);
  });
});

describe('Double authentification', () => {
  const SECRET = base32(Buffer.from('12345678901234567890'));
  const AVEC_2FA = {
    ...UTILISATEUR,
    totpActifLe: new Date(),
    totpSecret: chiffrerSecret(SECRET),
    totpDernierPas: null,
    totpCodesSecours: [hacherCodeSecours('ABCD-EFGH')],
  };

  function svc2(u: unknown = AVEC_2FA) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn((a: unknown) => a);
    const prisma = {
      utilisateur: { findUnique: jest.fn().mockResolvedValue(u), update, updateMany },
      societe: { findUnique: jest.fn().mockResolvedValue(SOCIETE) },
      utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([affectation('S1', 'CFO')]) },
      evenementCompte: { create: jest.fn((a: unknown) => a) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    const jwt = {
      sign: jest.fn().mockReturnValue('jeton'),
      verify: jest.fn().mockReturnValue({ sub: 'U1', slug: 'grey-concrete', but: 'double-facteur' }),
    } as unknown as JwtService;
    const email = { envoyerAvisSecurite: jest.fn().mockResolvedValue({ envoye: true }) };
    return {
      s: new AuthService(prisma, jwt, { envoyer: jest.fn() } as never, email as never),
      update,
      updateMany,
      email,
    };
  }

  it('obligatoire pour tous les rôles en production (décision du 28/10/2026) ; réglable', () => {
    expect(doubleFacteurExige({ NODE_ENV: 'production' })).toBe(true);
    expect(doubleFacteurExige({ NODE_ENV: 'development' })).toBe(false);
    expect(doubleFacteurExige({ NODE_ENV: 'development', HUB_DOUBLE_FACTEUR: 'obligatoire' })).toBe(true);
    // Revue CIO (22/10/2026) : « desactive » n'est accepté en production que
    // sur un serveur de démonstration ; jamais sur un HUB réel.
    expect(doubleFacteurExige({ NODE_ENV: 'production', HUB_DOUBLE_FACTEUR: 'desactive' })).toBe(true);
    expect(
      doubleFacteurExige({ NODE_ENV: 'production', HUB_DOUBLE_FACTEUR: 'desactive', HUB_DONNEES_DEMO: 'autorise' }),
    ).toBe(false);
    expect(doubleFacteurExige({ NODE_ENV: 'development', HUB_DOUBLE_FACTEUR: 'desactive' })).toBe(false);
  });

  it('mot de passe juste + double facteur actif : pas de session, une étape « code »', async () => {
    expect(await svc2().s.login(DTO)).toEqual({ etape: 'code', jeton: 'jeton' });
  });

  it('code de l’application : session ouverte, pas mémorisé contre le rejeu', async () => {
    const { s, updateMany } = svc2();
    const res = (await s.connexionAvecCode('jeton', codeAuPas(SECRET, pasCourant()))) as Session;
    expect(res.role).toBe('CFO');
    expect(updateMany.mock.calls[0][0].data).toEqual({ totpDernierPas: pasCourant() });
  });

  it('code faux refusé ; code de secours accepté une seule fois', async () => {
    const { s, update } = svc2();
    await expect(s.connexionAvecCode('jeton', '000000')).rejects.toThrow(UnauthorizedException);
    await s.connexionAvecCode('jeton', 'abcd efgh');
    expect(update.mock.calls[0][0]).toEqual({ where: { id: 'U1' }, data: { totpCodesSecours: [] } });
  });

  it('activation : premier code juste → 8 codes de secours et session', async () => {
    const enCours = {
      ...UTILISATEUR,
      totpActifLe: null,
      totpSecret: chiffrerSecret(SECRET),
      totpDernierPas: null,
      totpCodesSecours: [],
    };
    const { s, email } = svc2(enCours);
    const res = await s.activerDoubleFacteur('jeton', codeAuPas(SECRET, pasCourant()));
    expect(res.codesSecours).toHaveLength(8);
    expect(res.role).toBe('CFO');
    expect(email.envoyerAvisSecurite).toHaveBeenCalledWith(
      expect.objectContaining({ evenement: 'double_facteur_active' }),
    );
  });
});

// Revue CIO (22/10/2026) : compte technique de secours — chaque connexion
// tracée au journal et notifiée au CEO et au CIO.
describe('AuthService · compte de secours', () => {
  it('connexion d’un compte technique : trace et alerte ; compte ordinaire : rien', async () => {
    const secours = svc([affectation('S1', 'societe_admin')]);
    await secours.svc.login(DTO);
    expect(secours.evenement).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'connexion_secours', utilisateurId: 'U1' }),
    });
    expect(secours.notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'connexion_secours', titre: expect.stringContaining('compte de secours a@b.c') }),
    );
    const ordinaire = svc([affectation('S1', 'CFO')]);
    await ordinaire.svc.login(DTO);
    expect(ordinaire.notifications.envoyer).not.toHaveBeenCalled();
  });
});
