import { randomBytes } from 'crypto';
import { hacherJeton } from '../../auth/jetons';
import { dechiffrer } from './chiffrement';
import { ConnexionsAgendaService } from './connexions.service';

// Agendas connectés (16/11/2026) : connexion Google, retour, choix, déconnexion.
const CLE = randomBytes(32);
const moi = { userId: 'U1', societeId: 'S1', role: 'Salarié', permissions: { agenda: 'L' } };

const monter = () => {
  const prisma = {
    connexionAgenda: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 'C1' }),
      delete: jest.fn(),
    },
    agendaExterne: { upsert: jest.fn(), update: jest.fn() },
    evenementExterne: { deleteMany: jest.fn() },
    etatConnexionAgenda: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  };
  const google = {
    configure: jest.fn().mockReturnValue(true),
    urlAutorisation: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x'),
    echangerCode: jest.fn().mockResolvedValue({ rafraichissement: 'R-SECRET', compte: 'awa@gc.sn' }),
    acces: jest.fn().mockResolvedValue('ACCES'),
    agendas: jest.fn().mockResolvedValue([
      { id: 'awa@gc.sn', nom: 'Awa', couleur: '#123', principal: true, ecriture: true },
      { id: 'feries', nom: 'Jours fériés', couleur: null, principal: false, ecriture: false },
    ]),
    supprimer: jest.fn().mockResolvedValue(undefined),
    revoquer: jest.fn().mockResolvedValue(undefined),
  };
  const synchro = { synchroniser: jest.fn() };
  const s = new ConnexionsAgendaService(prisma as never, google as never, synchro as never);
  return { s, prisma, google, synchro };
};

describe('ConnexionsAgendaService', () => {
  const avant = process.env.AGENDA_CLE_CHIFFREMENT;
  beforeEach(() => (process.env.AGENDA_CLE_CHIFFREMENT = CLE.toString('base64')));
  afterAll(() => (process.env.AGENDA_CLE_CHIFFREMENT = avant));

  it('début : un état aléatoire dont seule l’empreinte est gardée, avec le vérificateur PKCE, dix minutes', async () => {
    const { s, prisma, google } = monter();
    const { url } = await s.debutGoogle(moi);
    expect(url).toContain('accounts.google.com');
    const [etat, defi] = google.urlAutorisation.mock.calls[0];
    expect(etat).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ecrit = prisma.etatConnexionAgenda.create.mock.calls[0][0].data;
    expect(ecrit.etatHash).toBe(hacherJeton(etat));
    expect(JSON.stringify(ecrit)).not.toContain(etat);
    expect(defi).not.toBe(ecrit.verificateur);
    expect(+ecrit.expireLe - Date.now()).toBeGreaterThan(9 * 60_000);
  });

  it('début : sans clé de chiffrement ou sans application Google, refusé', async () => {
    const a = monter();
    a.google.configure.mockReturnValue(false);
    await expect(a.s.debutGoogle(moi)).rejects.toThrow('pas encore configurée');
    delete process.env.AGENDA_CLE_CHIFFREMENT;
    await expect(monter().s.debutGoogle(moi)).rejects.toThrow('pas encore configurée');
  });

  it('retour : l’accès est chiffré, l’agenda principal importé et choisi pour écrire', async () => {
    const { s, prisma } = monter();
    prisma.etatConnexionAgenda.findUnique.mockResolvedValue({
      id: 'E1',
      societeId: 'S1',
      utilisateurId: 'U1',
      verificateur: 'V',
      expireLe: new Date(Date.now() + 60_000),
      societe: { slug: 'gc' },
    });
    const url = await s.retourGoogle('ETAT', 'CODE', undefined);
    expect(url).toMatch(/\/admin\/gc\/agenda\?connexion=google$/);
    expect(prisma.etatConnexionAgenda.delete).toHaveBeenCalledWith({ where: { id: 'E1' } }); // usage unique
    const cree = prisma.connexionAgenda.upsert.mock.calls[0][0].create;
    expect(cree).toMatchObject({ utilisateurId: 'U1', fournisseur: 'google', compte: 'awa@gc.sn' });
    expect(cree.accesChiffre).not.toContain('R-SECRET');
    expect(dechiffrer(cree.accesChiffre, CLE)).toBe('R-SECRET');
    const agendas = prisma.agendaExterne.upsert.mock.calls.map((c) => c[0].create);
    expect(agendas).toEqual([
      expect.objectContaining({ idExterne: 'awa@gc.sn', importe: true, cible: true }),
      expect.objectContaining({ idExterne: 'feries', importe: false, cible: false }),
    ]);
  });

  it('retour : état inconnu, expiré, ou refus chez Google → pas de connexion', async () => {
    const a = monter();
    a.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(null);
    expect(await a.s.retourGoogle('INCONNU', 'CODE', undefined)).toMatch(/\?connexion=echec$/);
    const b = monter();
    b.prisma.etatConnexionAgenda.findUnique.mockResolvedValue({
      id: 'E1',
      societeId: 'S1',
      utilisateurId: 'U1',
      verificateur: 'V',
      expireLe: new Date(Date.now() - 1000),
      societe: { slug: 'gc' },
    });
    expect(await b.s.retourGoogle('ETAT', 'CODE', undefined)).toMatch(/connexion=annulee$/);
    expect(b.google.echangerCode).not.toHaveBeenCalled();
    expect(b.prisma.connexionAgenda.upsert).not.toHaveBeenCalled();
  });

  it('état : jamais l’accès chiffré à l’écran', async () => {
    const { s, prisma } = monter();
    prisma.connexionAgenda.findMany.mockResolvedValue([
      {
        id: 'C1',
        fournisseur: 'google',
        compte: 'awa@gc.sn',
        accesChiffre: 'v1.SECRET',
        derniereSynchroLe: null,
        erreur: null,
        agendas: [],
      },
    ]);
    const e = await s.etat(moi);
    expect(JSON.stringify(e)).not.toContain('SECRET');
    expect(e.disponibles).toEqual({ google: true, apple: false });
  });

  it('choisir : seulement ses agendas ; ceux qui ne sont plus importés quittent le HUB', async () => {
    const { s, prisma } = monter();
    prisma.connexionAgenda.findFirst.mockResolvedValue({
      id: 'C1',
      agendas: [{ id: 'A1' }, { id: 'A2' }],
      liens: [],
    });
    await expect(s.choisirAgendas(moi, 'C1', ['A9'], null)).rejects.toThrow('Agenda inconnu');
    await s.choisirAgendas(moi, 'C1', ['A2'], 'A2');
    expect(prisma.agendaExterne.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: 'A1' }, data: { importe: false, cible: false } },
      { where: { id: 'A2' }, data: { importe: true, cible: true } },
    ]);
    expect(prisma.evenementExterne.deleteMany).toHaveBeenCalledWith({ where: { agendaId: { in: ['A1'] } } });
    // La connexion d'un autre : introuvable.
    expect(prisma.connexionAgenda.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'C1', societeId: 'S1', utilisateurId: 'U1' } }),
    );
  });

  it('déconnecter : les réunions écrites par le HUB retirées de Google, l’accès révoqué, la connexion supprimée', async () => {
    const { s, prisma, google } = monter();
    const { chiffrer } = await import('./chiffrement');
    prisma.connexionAgenda.findFirst.mockResolvedValue({
      id: 'C1',
      fournisseur: 'google',
      accesChiffre: chiffrer('R-SECRET', CLE),
      agendas: [],
      liens: [{ agendaId: 'awa@gc.sn', idExterne: 'G1' }],
    });
    await s.deconnecter(moi, 'C1');
    expect(google.supprimer).toHaveBeenCalledWith('ACCES', 'awa@gc.sn', 'G1');
    expect(google.revoquer).toHaveBeenCalledWith('R-SECRET');
    expect(prisma.connexionAgenda.delete).toHaveBeenCalledWith({ where: { id: 'C1' } });
  });
});
