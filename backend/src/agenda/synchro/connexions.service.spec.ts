import { randomBytes } from 'crypto';
import { hacherJeton } from '../../auth/jetons';
import { chiffrer, dechiffrer } from './chiffrement';
import { ConnexionsAgendaService } from './connexions.service';
import { ErreurGoogle } from './google.client';

// Agendas connectés (16/11/2026) : connexion Google en trois temps (adresse,
// retour avec ticket, confirmation par la session), choix, déconnexion.
const CLE = randomBytes(32);
const moi = { userId: 'U1', societeId: 'S1', role: 'Salarié', permissions: { agenda: 'L' } };

const monter = () => {
  const prisma = {
    connexionAgenda: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn().mockResolvedValue({ id: 'C1' }),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), // verrou de synchronisation
    },
    agendaExterne: {
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    evenementExterne: { deleteMany: jest.fn() },
    lienExportAgenda: { deleteMany: jest.fn() },
    etatConnexionAgenda: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    utilisateur: { findUnique: jest.fn().mockResolvedValue({ email: 'awa@gc.sn', prenom: 'Awa' }) },
    $transaction: jest.fn(),
  };
  const google = {
    configure: jest.fn().mockReturnValue(true),
    urlAutorisation: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x'),
    echangerCode: jest.fn().mockResolvedValue({ rafraichissement: 'R-SECRET', compte: 'awa@gc.sn' }),
    acces: jest.fn().mockResolvedValue('ACCES'),
    agendas: jest.fn().mockResolvedValue([
      { id: 'awa@gc.sn', nom: 'Awa', couleur: '#123', principal: true, ecriture: true, proprietaire: true },
      { id: 'feries', nom: 'Jours fériés', couleur: null, principal: false, ecriture: false, proprietaire: false },
    ]),
    supprimer: jest.fn().mockResolvedValue(undefined),
    revoquer: jest.fn().mockResolvedValue(undefined),
  };
  const synchro = { synchroniser: jest.fn().mockResolvedValue(true) };
  const email = { envoyerAvisSecurite: jest.fn().mockResolvedValue({ envoye: true }) };
  const s = new ConnexionsAgendaService(prisma as never, google as never, synchro as never, email as never);
  return { s, prisma, google, synchro, email };
};

const etatEnCours = (x: Record<string, unknown> = {}) => ({
  id: 'E1',
  societeId: 'S1',
  utilisateurId: 'U1',
  verificateur: 'V',
  expireLe: new Date(Date.now() + 60_000),
  ticketHash: null,
  codeChiffre: null,
  societe: { slug: 'gc' },
  ...x,
});

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

  it('retour : rien n’est relié ; le code est gardé chiffré et un ticket remis au navigateur', async () => {
    const { s, prisma, google } = monter();
    prisma.etatConnexionAgenda.findUnique.mockResolvedValue(etatEnCours());
    const url = await s.retourGoogle('ETAT', 'CODE-GOOGLE', undefined);
    // Le ticket dans le fragment : jamais envoyé à un serveur ni dans un Referer.
    expect(url).toMatch(/\/admin\/gc\/agenda\?connexion=confirmer#ticket=[A-Za-z0-9_-]{43}$/);
    const ticket = new URL(url).hash.slice('#ticket='.length);
    const { where, data } = prisma.etatConnexionAgenda.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'E1', ticketHash: null }); // un seul ticket par autorisation
    expect(data.ticketHash).toBe(hacherJeton(ticket));
    expect(data.codeChiffre).not.toContain('CODE-GOOGLE');
    expect(dechiffrer(data.codeChiffre, CLE)).toBe('CODE-GOOGLE');
    expect(google.echangerCode).not.toHaveBeenCalled();
    expect(prisma.connexionAgenda.upsert).not.toHaveBeenCalled();
  });

  it('retour : état inconnu, déjà utilisé, expiré, ou refus chez Google → pas de ticket', async () => {
    const a = monter();
    a.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(null);
    expect(await a.s.retourGoogle('INCONNU', 'CODE', undefined)).toMatch(/\?connexion=echec$/);
    const b = monter();
    b.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(etatEnCours({ ticketHash: 'deja' }));
    expect(await b.s.retourGoogle('ETAT', 'CODE', undefined)).toMatch(/\?connexion=echec$/);
    expect(b.prisma.etatConnexionAgenda.updateMany).not.toHaveBeenCalled();
    const c = monter();
    c.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(etatEnCours({ expireLe: new Date(Date.now() - 1000) }));
    expect(await c.s.retourGoogle('ETAT', 'CODE', undefined)).toMatch(/connexion=annulee$/);
    expect(c.prisma.etatConnexionAgenda.delete).toHaveBeenCalledWith({ where: { id: 'E1' } });
    const d = monter();
    d.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(etatEnCours());
    expect(await d.s.retourGoogle('ETAT', undefined, 'access_denied')).toMatch(/connexion=annulee$/);
    expect(d.prisma.etatConnexionAgenda.updateMany).not.toHaveBeenCalled();
    // Deux retours simultanés : le second ne pose pas de ticket.
    const e = monter();
    e.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(etatEnCours());
    e.prisma.etatConnexionAgenda.updateMany.mockResolvedValue({ count: 0 });
    expect(await e.s.retourGoogle('ETAT', 'CODE', undefined)).toMatch(/connexion=echec$/);
  });

  const ticketPret = (x: Record<string, unknown> = {}) =>
    etatEnCours({ ticketHash: hacherJeton('TICKET'), codeChiffre: chiffrer('CODE-GOOGLE', CLE), ...x });

  it('confirmer : la session de la personne relie le compte — accès chiffré, agenda principal choisi, avis par e-mail', async () => {
    const { s, prisma, google, email, synchro } = monter();
    prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret());
    await s.confirmerGoogle(moi, 'TICKET');
    expect(prisma.etatConnexionAgenda.findUnique).toHaveBeenCalledWith({
      where: { ticketHash: hacherJeton('TICKET') },
    });
    // Usage unique, atomique : supprimé par son ticket.
    expect(prisma.etatConnexionAgenda.deleteMany).toHaveBeenCalledWith({
      where: { id: 'E1', ticketHash: hacherJeton('TICKET') },
    });
    expect(google.echangerCode).toHaveBeenCalledWith(
      'CODE-GOOGLE',
      'V',
      expect.stringContaining('/agenda/google/retour'),
    );
    const { create, update } = prisma.connexionAgenda.upsert.mock.calls[0][0];
    expect(create).toMatchObject({ utilisateurId: 'U1', societeId: 'S1', fournisseur: 'google', compte: 'awa@gc.sn' });
    expect(create.autoriseLe).toBeInstanceOf(Date);
    expect(update.autoriseLe).toBeInstanceOf(Date);
    expect(update.derniereSynchroLe).toBeNull(); // e-mails d'invitation jusqu'à la première tournée
    expect(create.accesChiffre).not.toContain('R-SECRET');
    expect(dechiffrer(create.accesChiffre, CLE)).toBe('R-SECRET');
    const agendas = prisma.agendaExterne.upsert.mock.calls.map((c) => c[0].create);
    expect(agendas).toEqual([
      expect.objectContaining({ idExterne: 'awa@gc.sn', importe: true, cible: true, proprietaire: true }),
      expect.objectContaining({ idExterne: 'feries', importe: false, cible: false, proprietaire: false }),
    ]);
    expect(email.envoyerAvisSecurite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'awa@gc.sn', evenement: 'agenda_connecte', detail: 'awa@gc.sn' }),
    );
    // Première synchronisation lancée aussitôt, sans faire attendre l'écran.
    await new Promise((r) => setImmediate(r));
    expect(synchro.synchroniser).toHaveBeenCalledWith('C1');
  });

  it('confirmer : deux onglets en même temps → une seule confirmation passe', async () => {
    const { s, prisma, google } = monter();
    prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret());
    prisma.etatConnexionAgenda.deleteMany.mockResolvedValue({ count: 0 });
    await expect(s.confirmerGoogle(moi, 'TICKET')).rejects.toThrow('déjà utilisée');
    expect(google.echangerCode).not.toHaveBeenCalled();
  });

  it('confirmer : le ticket d’un autre compte du HUB est refusé et détruit, rien n’est relié', async () => {
    const { s, prisma, google } = monter();
    prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret({ utilisateurId: 'U2' }));
    await expect(s.confirmerGoogle(moi, 'TICKET')).rejects.toThrow('un autre compte');
    expect(prisma.etatConnexionAgenda.deleteMany).toHaveBeenCalled();
    expect(google.echangerCode).not.toHaveBeenCalled();
    expect(prisma.connexionAgenda.upsert).not.toHaveBeenCalled();
    // Ni dans une autre société.
    const b = monter();
    b.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret({ societeId: 'S2' }));
    await expect(b.s.confirmerGoogle(moi, 'TICKET')).rejects.toThrow('un autre compte');
  });

  it('confirmer : ticket inconnu ou expiré → refusé ; échec chez Google → refusé', async () => {
    const a = monter();
    a.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(null);
    await expect(a.s.confirmerGoogle(moi, 'X')).rejects.toThrow('introuvable');
    const b = monter();
    b.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret({ expireLe: new Date(Date.now() - 1) }));
    await expect(b.s.confirmerGoogle(moi, 'TICKET')).rejects.toThrow('expirée');
    expect(b.google.echangerCode).not.toHaveBeenCalled();
    const c = monter();
    c.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret());
    c.google.echangerCode.mockRejectedValue(new Error('invalid_grant'));
    await expect(c.s.confirmerGoogle(moi, 'TICKET')).rejects.toThrow('recommencez');
    expect(c.prisma.connexionAgenda.upsert).not.toHaveBeenCalled();
  });

  it('confirmer : un autre compte Google s’ajoute (perso + pro) ; le même compte est relié de nouveau, choix gardés, sans révoquer', async () => {
    // Un deuxième compte : ajouté, l'ancien reste ; le HUB écrit déjà ailleurs,
    // donc le nouveau ne devient pas la cible.
    const a = monter();
    a.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret());
    a.prisma.connexionAgenda.count.mockResolvedValue(1);
    a.prisma.agendaExterne.count.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.cible ? 1 : 0),
    );
    await a.s.confirmerGoogle(moi, 'TICKET');
    expect(a.prisma.connexionAgenda.delete).not.toHaveBeenCalled();
    expect(a.prisma.connexionAgenda.upsert.mock.calls[0][0].where).toEqual({
      societeId_utilisateurId_fournisseur_compte: {
        societeId: 'S1',
        utilisateurId: 'U1',
        fournisseur: 'google',
        compte: 'awa@gc.sn',
      },
    });
    expect(a.prisma.agendaExterne.upsert.mock.calls[0][0].create).toMatchObject({ importe: true, cible: false });
    // Le même compte : relié de nouveau (réactivé), choix gardés, rien révoqué.
    const b = monter();
    b.prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret());
    b.prisma.connexionAgenda.findUnique.mockResolvedValue({ id: 'C1' });
    b.prisma.agendaExterne.count.mockResolvedValue(2);
    await b.s.confirmerGoogle(moi, 'TICKET');
    expect(b.prisma.connexionAgenda.upsert.mock.calls[0][0].update).toMatchObject({ active: true });
    expect(b.google.revoquer).not.toHaveBeenCalled();
    expect(b.prisma.agendaExterne.upsert.mock.calls[0][0].create).toMatchObject({ importe: false, cible: false });
  });

  it('confirmer : cinq comptes au plus ; au-delà, le nouvel accès est rendu à Google', async () => {
    const { s, prisma, google } = monter();
    prisma.etatConnexionAgenda.findUnique.mockResolvedValue(ticketPret());
    prisma.connexionAgenda.count.mockResolvedValue(5);
    await expect(s.confirmerGoogle(moi, 'TICKET')).rejects.toThrow('5 comptes reliés au plus');
    expect(google.revoquer).toHaveBeenCalledWith('R-SECRET');
    expect(prisma.connexionAgenda.upsert).not.toHaveBeenCalled();
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

  const avecAgendas = (agendas: { id: string; importe?: boolean; proprietaire?: boolean }[], x = {}) => ({
    id: 'C1',
    fournisseur: 'google',
    active: true,
    accesChiffre: chiffrer('R-SECRET', CLE),
    agendas: agendas.map((g) => ({ importe: false, proprietaire: true, ...g })),
    liens: [],
    ...x,
  });

  it('afficher un agenda : seulement les siens ; masqué, ses rendez-vous quittent le HUB ; affiché, synchronisé aussitôt', async () => {
    const { s, prisma, synchro } = monter();
    prisma.connexionAgenda.findFirst.mockResolvedValue(avecAgendas([{ id: 'A1', importe: true }, { id: 'A2' }]));
    await expect(s.afficherAgenda(moi, 'C1', 'A9', true)).rejects.toThrow('Agenda inconnu');
    await s.afficherAgenda(moi, 'C1', 'A1', false);
    expect(prisma.agendaExterne.update).toHaveBeenCalledWith({ where: { id: 'A1' }, data: { importe: false } });
    expect(prisma.evenementExterne.deleteMany).toHaveBeenCalledWith({ where: { agendaId: 'A1' } });
    await s.afficherAgenda(moi, 'C1', 'A2', true);
    await new Promise((r) => setImmediate(r));
    expect(synchro.synchroniser).toHaveBeenCalledWith('C1');
    // La connexion d'un autre : introuvable.
    expect(prisma.connexionAgenda.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'C1', societeId: 'S1', utilisateurId: 'U1' } }),
    );
  });

  it('afficher : dix agendas au plus par compte', async () => {
    const { s, prisma } = monter();
    const agendas = Array.from({ length: 11 }, (_, i) => ({ id: `A${i}`, importe: i < 10 }));
    prisma.connexionAgenda.findFirst.mockResolvedValue(avecAgendas(agendas));
    await expect(s.afficherAgenda(moi, 'C1', 'A10', true)).rejects.toThrow('10 agendas');
    expect(prisma.agendaExterne.update).not.toHaveBeenCalled();
  });

  it('où le HUB écrit : un seul agenda tous comptes confondus, à soi, d’un compte actif — ou aucun', async () => {
    const { s, prisma } = monter();
    prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    prisma.agendaExterne.findFirst.mockResolvedValue({ id: 'A2', proprietaire: true, connexion: { active: true } });
    prisma.connexionAgenda.findMany.mockResolvedValue([]);
    await s.choisirCible(moi, 'A2');
    expect(prisma.agendaExterne.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'A2', connexion: { societeId: 'S1', utilisateurId: 'U1' } } }),
    );
    // Les autres (de tous ses comptes) ne le sont plus ; celui-ci l'est.
    expect(prisma.agendaExterne.updateMany).toHaveBeenCalledWith({
      where: { cible: true, connexion: { societeId: 'S1', utilisateurId: 'U1' } },
      data: { cible: false },
    });
    expect(prisma.agendaExterne.update).toHaveBeenCalledWith({ where: { id: 'A2' }, data: { cible: true } });
    // Partagé, ou compte en pause : refusé.
    prisma.agendaExterne.findFirst.mockResolvedValue({ id: 'A3', proprietaire: false, connexion: { active: true } });
    await expect(s.choisirCible(moi, 'A3')).rejects.toThrow('vous appartient');
    prisma.agendaExterne.findFirst.mockResolvedValue({ id: 'A4', proprietaire: true, connexion: { active: false } });
    await expect(s.choisirCible(moi, 'A4')).rejects.toThrow('en pause');
    // Nulle part.
    prisma.agendaExterne.update.mockClear();
    await s.choisirCible(moi, null);
    expect(prisma.agendaExterne.update).not.toHaveBeenCalled();
  });

  it('pause : réunions retirées de Google sans couper l’accès, ses rendez-vous quittent le HUB ; reprise : synchronisée', async () => {
    const { s, prisma, google, synchro } = monter();
    prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    prisma.connexionAgenda.findFirst.mockResolvedValue(
      avecAgendas([{ id: 'A1', importe: true }], { liens: [{ agendaId: 'awa@gc.sn', idExterne: 'G1' }] }),
    );
    await s.activer(moi, 'C1', false);
    expect(google.supprimer).toHaveBeenCalledWith('ACCES', 'awa@gc.sn', 'G1');
    expect(google.revoquer).not.toHaveBeenCalled();
    expect(prisma.lienExportAgenda.deleteMany).toHaveBeenCalledWith({ where: { connexionId: 'C1' } });
    expect(prisma.evenementExterne.deleteMany).toHaveBeenCalledWith({ where: { agendaId: { in: ['A1'] } } });
    expect(prisma.connexionAgenda.update).toHaveBeenCalledWith({
      where: { id: 'C1' },
      data: { active: false, erreur: null, synchroDepuis: null },
    });
    // Reprise.
    prisma.connexionAgenda.findFirst.mockResolvedValue(avecAgendas([{ id: 'A1' }], { active: false }));
    await s.activer(moi, 'C1', true);
    expect(prisma.connexionAgenda.update).toHaveBeenLastCalledWith({
      where: { id: 'C1' },
      data: { active: true, erreur: null, derniereSynchroLe: null },
    });
    await new Promise((r) => setImmediate(r));
    expect(synchro.synchroniser).toHaveBeenCalledWith('C1');
  });

  it('pause : Google injoignable → rien n’est mis en pause, on demande de réessayer', async () => {
    const { s, prisma, google } = monter();
    prisma.connexionAgenda.findFirst.mockResolvedValue(avecAgendas([{ id: 'A1' }]));
    google.acces.mockRejectedValue(new ErreurGoogle(503, 'indisponible'));
    await expect(s.activer(moi, 'C1', false)).rejects.toThrow('réessayez');
    expect(prisma.connexionAgenda.update).not.toHaveBeenCalled();
  });

  it('synchroniser un compte en pause : refusé', async () => {
    const { s, prisma } = monter();
    prisma.connexionAgenda.findFirst.mockResolvedValue(avecAgendas([], { active: false }));
    await expect(s.synchroniserMaintenant(moi, 'C1')).rejects.toThrow('en pause');
  });

  const connexionGoogle = () => ({
    id: 'C1',
    fournisseur: 'google',
    active: true,
    accesChiffre: chiffrer('R-SECRET', CLE),
    agendas: [],
    liens: [{ agendaId: 'awa@gc.sn', idExterne: 'G1' }],
  });

  it('déconnecter : les réunions écrites par le HUB retirées de Google, l’accès révoqué, la connexion supprimée', async () => {
    const { s, prisma, google } = monter();
    prisma.connexionAgenda.findFirst.mockResolvedValue(connexionGoogle());
    await s.deconnecter(moi, 'C1');
    expect(google.supprimer).toHaveBeenCalledWith('ACCES', 'awa@gc.sn', 'G1');
    expect(google.revoquer).toHaveBeenCalledWith('R-SECRET');
    expect(prisma.connexionAgenda.delete).toHaveBeenCalledWith({ where: { id: 'C1' } });
  });

  it('déconnecter : Google en panne → on garde tout et on demande de réessayer ; accès déjà retiré → supprimée', async () => {
    const a = monter();
    a.prisma.connexionAgenda.findFirst.mockResolvedValue(connexionGoogle());
    a.google.acces.mockRejectedValue(new ErreurGoogle(503, 'indisponible', false));
    await expect(a.s.deconnecter(moi, 'C1')).rejects.toThrow('réessayez');
    expect(a.prisma.connexionAgenda.delete).not.toHaveBeenCalled();
    // Le verrou pris pour la déconnexion est rendu.
    expect(a.prisma.connexionAgenda.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'C1' },
      data: { synchroDepuis: null },
    });
    const b = monter();
    b.prisma.connexionAgenda.findFirst.mockResolvedValue(connexionGoogle());
    b.google.acces.mockRejectedValue(new ErreurGoogle(400, 'invalid_grant', true));
    await b.s.deconnecter(moi, 'C1');
    expect(b.google.supprimer).not.toHaveBeenCalled();
    expect(b.prisma.connexionAgenda.delete).toHaveBeenCalledWith({ where: { id: 'C1' } });
  });

  it('déconnecter pendant une synchronisation : refusé (rien n’est retiré ni supprimé)', async () => {
    const { s, prisma, google } = monter();
    prisma.connexionAgenda.findFirst.mockResolvedValue(connexionGoogle());
    prisma.connexionAgenda.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.deconnecter(moi, 'C1')).rejects.toThrow('Synchronisation en cours');
    expect(google.supprimer).not.toHaveBeenCalled();
    expect(prisma.connexionAgenda.delete).not.toHaveBeenCalled();
  });

  it('synchroniser maintenant : déjà en cours → la personne le sait', async () => {
    const { s, prisma, synchro } = monter();
    prisma.connexionAgenda.findFirst.mockResolvedValue(connexionGoogle());
    synchro.synchroniser.mockResolvedValue(false);
    await expect(s.synchroniserMaintenant(moi, 'C1')).rejects.toThrow('déjà en cours');
  });
});
