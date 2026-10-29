import { BadRequestException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthService,
  dateEmission,
  doubleFacteurExige,
  doubleFacteurExigePour,
  doubleFacteurSuspendue,
  doubleFacteurSuspenduePour,
} from './auth.service';
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
    module: { findMany: jest.fn().mockResolvedValue([{ cle: 'crm' }, { cle: 'finances_marges' }]) },
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
    adminHub: false,
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

  it('obligatoire pour tous les rôles en production (décision du 28/10/2026) ; réglable, suspendable', () => {
    expect(doubleFacteurExige({ NODE_ENV: 'production' })).toBe(true);
    expect(doubleFacteurExige({ NODE_ENV: 'development' })).toBe(false);
    expect(doubleFacteurExige({ NODE_ENV: 'development', HUB_DOUBLE_FACTEUR: 'obligatoire' })).toBe(true);
    // Pilote (28/10/2026) : « desactive » la suspend, production comprise.
    expect(doubleFacteurExige({ NODE_ENV: 'production', HUB_DOUBLE_FACTEUR: 'desactive' })).toBe(false);
    expect(doubleFacteurExige({ NODE_ENV: 'development', HUB_DOUBLE_FACTEUR: 'desactive' })).toBe(false);
    expect(doubleFacteurSuspendue({ NODE_ENV: 'production', HUB_DOUBLE_FACTEUR: 'desactive' })).toBe(true);
    expect(doubleFacteurSuspendue({ NODE_ENV: 'production' })).toBe(false);
  });

  it('mot de passe juste + double facteur actif : pas de session, une étape « code »', async () => {
    expect(await svc2().s.login(DTO)).toEqual({ etape: 'code', jeton: 'jeton' });
  });

  it('suspendue : session ouverte sans code, même pour un compte inscrit', async () => {
    const avant = process.env.HUB_DOUBLE_FACTEUR;
    process.env.HUB_DOUBLE_FACTEUR = 'desactive';
    try {
      const res = (await svc2().s.login(DTO)) as Session;
      expect(res.role).toBe('CFO');
    } finally {
      if (avant === undefined) delete process.env.HUB_DOUBLE_FACTEUR;
      else process.env.HUB_DOUBLE_FACTEUR = avant;
    }
  });

  it('code de l’application : session ouverte, pas mémorisé contre le rejeu', async () => {
    const { s, updateMany } = svc2();
    const res = (await s.connexionAvecCode('jeton', codeAuPas(SECRET, pasCourant()))) as Session;
    expect(res.role).toBe('CFO');
    expect(updateMany.mock.calls[0][0].data).toEqual({ totpDernierPas: pasCourant() });
  });

  it('code faux refusé (compté comme essai, lot C) ; code de secours accepté une seule fois', async () => {
    const { s, update } = svc2();
    await expect(s.connexionAvecCode('jeton', '000000')).rejects.toThrow(UnauthorizedException);
    expect((update.mock.calls[0][0] as { data: unknown }).data).toEqual({ echecsConnexion: { increment: 1 } });
    await s.connexionAvecCode('jeton', 'abcd efgh');
    expect(update.mock.calls[1][0]).toEqual({ where: { id: 'U1' }, data: { totpCodesSecours: [] } });
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

describe('Administrateur HUB (carte blanche)', () => {
  const ADMIN = 'Administrateur HUB (transverse)';
  const TOUT = { crm: 'validation', finances_marges: 'validation' };

  it('connexion : endosse le CEO, tous les modules en validation, rôle tracé', async () => {
    const { svc: s, sign, evenement } = svc([affectation(null, ADMIN)]);
    const res = (await s.login(DTO)) as Session & { adminHub: boolean };
    expect(res).toMatchObject({ role: 'CEO (transverse)', permissions: TOUT, adminHub: true });
    const [contenu, options] = sign.mock.calls[0];
    expect(contenu).toMatchObject({ role: 'CEO (transverse)', adminHub: true });
    expect(options).toEqual({ expiresIn: 3600 });
    expect(evenement).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'role_endosse', detail: expect.stringContaining('en tant que CEO') }),
    });
  });

  it('compte ordinaire : pas de drapeau, droits de la matrice', async () => {
    const { svc: s, sign } = svc([affectation('S1', 'CFO', [['crm', 'lecture']])]);
    const res = (await s.login(DTO)) as Session & { adminHub: boolean };
    expect(res).toMatchObject({ role: 'CFO', permissions: { crm: 'lecture' }, adminHub: false });
    expect(sign.mock.calls[0][0].adminHub).toBeUndefined();
  });

  const t = Math.floor(Date.now() / 1000);
  const CONNECTE = {
    userId: 'U1',
    email: 'a@b.c',
    societeId: 'S1',
    societeSlug: 'grey-concrete',
    role: 'CEO (transverse)',
    permissions: TOUT,
    adminHub: true,
    debutSession: t - 600,
    emissionJeton: t - 60,
  };

  it('endosser un rôle : même début de session, droits complets, tracé', async () => {
    const { svc: s, sign, evenement } = svc([affectation(null, ADMIN)]);
    const res = await s.endosserRole(CONNECTE, 'CFO');
    expect(res).toEqual({ access_token: 'jeton', role: 'CFO', permissions: TOUT });
    expect(sign.mock.calls[0][0]).toMatchObject({ role: 'CFO', adminHub: true, debut: t - 600 });
    expect(evenement).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'role_endosse', detail: 'Grey Concrete · en tant que CFO' }),
    });
  });

  it('refuse un compte qui n’est pas (ou plus) Administrateur HUB, et un rôle inconnu', async () => {
    const ordinaire = svc([affectation('S1', 'CFO')]);
    await expect(ordinaire.svc.endosserRole({ ...CONNECTE, adminHub: false }, 'CFO')).rejects.toThrow(
      ForbiddenException,
    );
    const retire = svc([affectation('S1', 'CFO')]);
    await expect(retire.svc.endosserRole(CONNECTE, 'CFO')).rejects.toThrow(ForbiddenException);
    const admin = svc([affectation(null, ADMIN)]);
    await expect(admin.svc.endosserRole(CONNECTE, 'societe_admin')).rejects.toThrow(BadRequestException);
  });

  it('double authentification : exigée en production même suspendue', () => {
    const prod = { NODE_ENV: 'production', HUB_DOUBLE_FACTEUR: 'desactive' } as NodeJS.ProcessEnv;
    expect(doubleFacteurExigePour(ADMIN, prod)).toBe(true);
    expect(doubleFacteurSuspenduePour(ADMIN, prod)).toBe(false);
    expect(doubleFacteurExigePour('CFO', prod)).toBe(false);
    expect(doubleFacteurSuspenduePour('CFO', prod)).toBe(true);
    expect(doubleFacteurExigePour(ADMIN, { NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('Verrouillage du compte (lot C)', () => {
  const SECRET = base32(Buffer.from('12345678901234567890'));
  type Etat = { echecsConnexion: number; verrouillages: number; verrouilleJusquau: Date | null };

  function svc3(etat: Partial<Etat> = {}, compte: Record<string, unknown> = {}) {
    const u = {
      ...UTILISATEUR,
      totpActifLe: null,
      echecsConnexion: 0,
      verrouillages: 0,
      verrouilleJusquau: null,
      ...compte,
      ...etat,
    };
    // Applique l'incrément comme la base, et rend les compteurs choisis.
    const update = jest.fn((a: { data: Record<string, unknown> }) => {
      const e = a.data.echecsConnexion as number | { increment: number } | undefined;
      if (typeof e === 'object') u.echecsConnexion += e.increment;
      return Promise.resolve({ echecsConnexion: u.echecsConnexion, verrouillages: u.verrouillages });
    });
    const prisma = {
      utilisateur: {
        findUnique: jest.fn().mockResolvedValue(u),
        update,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      societe: { findUnique: jest.fn().mockResolvedValue(SOCIETE) },
      utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([affectation('S1', 'Salarié')]) },
      evenementCompte: { create: jest.fn((a: unknown) => a) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    const jwt = {
      sign: jest.fn().mockReturnValue('jeton'),
      verify: jest.fn().mockReturnValue({ sub: 'U1', slug: 'grey-concrete', but: 'double-facteur' }),
    } as unknown as JwtService;
    const email = { envoyerAvisSecurite: jest.fn().mockResolvedValue({ envoye: true }) };
    const evenement = (prisma as unknown as { evenementCompte: { create: jest.Mock } }).evenementCompte.create;
    return {
      s: new AuthService(prisma, jwt, { envoyer: jest.fn() } as never, email as never),
      update,
      email,
      evenement,
    };
  }
  const refus = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: unknown) => e as HttpException,
    );
  const minutes = (fin: Date) => Math.round((fin.getTime() - Date.now()) / 60_000);

  beforeEach(() => {
    (verifierMotDePasse as jest.Mock).mockClear();
  });

  it('pendant le verrouillage : refus (423, heure de fin) sans examiner le mot de passe', async () => {
    const { s } = svc3({ verrouilleJusquau: new Date(Date.now() + 10 * 60_000) });
    const e = await refus(s.login(DTO));
    expect(e?.getStatus()).toBe(423);
    expect(e?.message).toMatch(/^Compte verrouillé jusqu’à \d{2}:\d{2} \(heure de Dakar\)/);
    expect(verifierMotDePasse).not.toHaveBeenCalled();
  });

  it('un échec ordinaire est compté, sans verrouiller', async () => {
    (verifierMotDePasse as jest.Mock).mockResolvedValueOnce(false);
    const { s, update, email } = svc3({ echecsConnexion: 3 });
    await expect(s.login(DTO)).rejects.toThrow(UnauthorizedException);
    expect(update.mock.calls[0][0].data).toEqual({ echecsConnexion: { increment: 1 } });
    expect(update).toHaveBeenCalledTimes(1);
    expect(email.envoyerAvisSecurite).not.toHaveBeenCalled();
  });

  it('au dixième échec : verrouillé 15 min, journal, avis par e-mail, et la réponse le dit', async () => {
    (verifierMotDePasse as jest.Mock).mockResolvedValueOnce(false);
    const { s, update, email, evenement } = svc3({ echecsConnexion: 9 });
    const e = await refus(s.login(DTO));
    expect(e?.getStatus()).toBe(423);
    const pose = update.mock.calls[1][0].data;
    expect(pose).toMatchObject({ echecsConnexion: 0, verrouillages: { increment: 1 } });
    expect(minutes(pose.verrouilleJusquau as Date)).toBe(15);
    expect(evenement.mock.calls[0][0].data).toMatchObject({ type: 'compte_verrouille', parId: null });
    expect(email.envoyerAvisSecurite).toHaveBeenCalledWith(
      expect.objectContaining({ evenement: 'compte_verrouille', jusquau: pose.verrouilleJusquau }),
    );
  });

  it('récidive : la durée double (30 min au deuxième verrouillage)', async () => {
    (verifierMotDePasse as jest.Mock).mockResolvedValueOnce(false);
    const { s, update } = svc3({ echecsConnexion: 9, verrouillages: 1 });
    await refus(s.login(DTO));
    expect(minutes(update.mock.calls[1][0].data.verrouilleJusquau as Date)).toBe(30);
  });

  it('un code de double authentification refusé compte aussi', async () => {
    const avec2fa = {
      totpActifLe: new Date(),
      totpSecret: chiffrerSecret(SECRET),
      totpDernierPas: null,
      totpCodesSecours: [],
    };
    const { s, update } = svc3({ echecsConnexion: 9 }, avec2fa);
    const e = await refus(s.connexionAvecCode('etape', 'ABCD-EFGH'));
    expect(e?.getStatus()).toBe(423);
    expect(update.mock.calls[0][0].data).toEqual({ echecsConnexion: { increment: 1 } });
  });

  it('connexion réussie : essais et récidives remis à zéro', async () => {
    const { s, update } = svc3({ echecsConnexion: 4, verrouillages: 2 });
    await s.login(DTO);
    expect(update.mock.calls[0][0].data).toMatchObject({
      echecsConnexion: 0,
      verrouillages: 0,
      verrouilleJusquau: null,
    });
  });
});
