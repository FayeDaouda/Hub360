import { ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ROLE_HUB_ADMIN } from '@hub/domain';
import { chiffrer } from './chiffrement';
import { ErreurGoogle } from './google.client';
import { empreinte } from './reconciliation';
import { ligneImportee, SynchroAgendaService } from './synchro.service';

// Synchronisation avec Google (16/11/2026), faux Google et faux Agenda.
const CLE = randomBytes(32);
const MAINTENANT = new Date('2026-11-16T12:00:00.000Z');
const REUNION = {
  id: 'R1',
  type: 'rendez_vous',
  titre: 'Point chantier',
  jour: '2026-11-20',
  debut: '2026-11-20T09:00:00.000Z',
  fin: '2026-11-20T10:00:00.000Z',
  lieu: 'Plateau',
  detail: null,
  description: null,
  lienVisio: null,
  rappelMinutes: null,
  maReponse: null,
  jeSuisOrganisateur: true,
  modifiable: true,
  annulable: true,
  entretien: false,
  inviteIds: ['U2'],
  serieId: null,
  occurrence: null,
};

const AGENDAS = [
  { id: 'A1', idExterne: 'awa@gc.sn', nom: 'Awa', importe: true, cible: true, proprietaire: true },
  { id: 'A2', idExterne: 'feries', nom: 'Jours fériés', importe: false, cible: false, proprietaire: false },
];

const monter = (x: { liens?: unknown[]; elements?: unknown[]; google?: unknown[]; agendas?: unknown[] } = {}) => {
  const agendas = x.agendas ?? AGENDAS;
  const prisma = {
    connexionAgenda: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'C1',
        societeId: 'S1',
        utilisateurId: 'U1',
        fournisseur: 'google',
        active: true,
        accesChiffre: chiffrer('R', CLE),
        autoriseLe: new Date('2026-11-01T00:00:00Z'),
        agendas,
        liens: x.liens ?? [],
      }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(),
    },
    agendaExterne: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue(agendas),
      deleteMany: jest.fn(),
    },
    // acteurAgenda
    utilisateur: { findUnique: jest.fn().mockResolvedValue({ actif: true, sessionsValidesDepuis: null }) },
    societe: { findUnique: jest.fn().mockResolvedValue({ nom: 'Grey Concrete', slug: 'gc', actif: true }) },
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ societeId: 'S1', role: { nom: 'Salarié' } }]) },
    evenementExterne: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockReturnValue('del'),
      upsert: jest.fn().mockReturnValue('up'),
    },
    etatConnexionAgenda: { deleteMany: jest.fn() },
    lienExportAgenda: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  };
  const rights = { forUser: jest.fn().mockResolvedValue({ agenda: 'LES' }) };
  const agenda = {
    semaine: jest.fn().mockResolvedValue({ elements: x.elements ?? [REUNION] }),
    modifier: jest.fn(),
    annuler: jest.fn(),
    repondre: jest.fn(),
  };
  const google = {
    acces: jest.fn().mockResolvedValue('ACCES'),
    agendas: jest.fn().mockResolvedValue(
      agendas.map((a) => ({
        id: (a as { idExterne: string }).idExterne,
        nom: (a as { nom: string }).nom,
        couleur: null,
        principal: false,
        ecriture: true,
        proprietaire: (a as { proprietaire: boolean }).proprietaire,
      })),
    ),
    lire: jest.fn().mockResolvedValue(null),
    revoquer: jest.fn(),
    evenements: jest
      .fn()
      .mockImplementation((_a: string, agendaId: string) =>
        Promise.resolve(agendaId === 'awa@gc.sn' ? (x.google ?? []) : []),
      ),
    creer: jest.fn().mockResolvedValue({ id: 'G-NOUVEAU' }),
    modifier: jest.fn(),
    supprimer: jest.fn(),
  };
  const switches = { refuseDuringMaintenance: jest.fn().mockResolvedValue(undefined) };
  const notifications = { envoyer: jest.fn().mockResolvedValue(1) };
  const s = new SynchroAgendaService(
    prisma as never,
    rights as never,
    agenda as never,
    google as never,
    switches as never,
    notifications as never,
  );
  return { s, prisma, agenda, google, switches, notifications };
};
const lien = (
  empreinteEcrite = empreinte({ titre: 'Point chantier', lieu: 'Plateau', debut: REUNION.debut, fin: REUNION.fin }),
) => ({
  cle: 'R1',
  idExterne: 'G1',
  agendaId: 'awa@gc.sn',
  empreinte: empreinteEcrite,
});
const googleHub = (x: Record<string, unknown> = {}) => ({
  id: 'G1',
  summary: 'Point chantier',
  location: 'Plateau',
  start: { dateTime: REUNION.debut },
  end: { dateTime: REUNION.fin },
  extendedProperties: { private: { hubCle: 'R1' } },
  ...x,
});

describe('SynchroAgendaService', () => {
  const avant = process.env.AGENDA_CLE_CHIFFREMENT;
  beforeEach(() => (process.env.AGENDA_CLE_CHIFFREMENT = CLE.toString('base64')));
  afterAll(() => (process.env.AGENDA_CLE_CHIFFREMENT = avant));

  it('import : les rendez-vous de l’agenda choisi, sans ceux que le HUB y a écrits', async () => {
    const { s, prisma } = monter({
      google: [
        {
          id: 'P1',
          summary: 'Dentiste',
          start: { dateTime: '2026-11-18T08:00:00Z' },
          end: { dateTime: '2026-11-18T09:00:00Z' },
        },
        googleHub(),
      ],
      elements: [],
    });
    await s.synchroniser('C1', MAINTENANT);
    expect(prisma.evenementExterne.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.evenementExterne.upsert.mock.calls[0][0].create).toMatchObject({
      idExterne: 'P1',
      titre: 'Dentiste',
      agendaId: 'A1',
    });
    expect(prisma.connexionAgenda.update).toHaveBeenLastCalledWith({
      where: { id: 'C1' },
      data: { erreur: null, derniereSynchroLe: MAINTENANT },
    });
  });

  it('export : une nouvelle réunion est écrite chez Google et suivie', async () => {
    const { s, prisma, google } = monter();
    await s.synchroniser('C1', MAINTENANT);
    expect(google.creer).toHaveBeenCalledWith(
      'ACCES',
      'awa@gc.sn',
      expect.objectContaining({ summary: 'Point chantier' }),
    );
    expect(prisma.lienExportAgenda.create.mock.calls[0][0].data).toMatchObject({
      cle: 'R1',
      rendezVousId: 'R1',
      idExterne: 'G-NOUVEAU',
      agendaId: 'awa@gc.sn',
    });
  });

  it('l’organisateur a déplacé la réunion dans Google : le HUB la modifie (invités prévenus par le HUB)', async () => {
    const { s, agenda } = monter({
      liens: [lien()],
      google: [googleHub({ start: { dateTime: '2026-11-20T14:00:00Z' }, end: { dateTime: '2026-11-20T15:00:00Z' } })],
    });
    await s.synchroniser('C1', MAINTENANT);
    expect(agenda.modifier).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'U1', societeId: 'S1' }),
      'R1',
      expect.objectContaining({ debut: '2026-11-20T14:00:00Z', fin: '2026-11-20T15:00:00Z', inviteIds: ['U2'] }),
    );
  });

  it('supprimée dans Google : l’organisateur l’annule, un invité la décline ; une occurrence vise sa date', async () => {
    const a = monter({ liens: [lien()], google: [] });
    await a.s.synchroniser('C1', MAINTENANT);
    expect(a.agenda.annuler).toHaveBeenCalledWith(expect.anything(), 'R1', undefined, undefined);
    const b = monter({
      liens: [lien()],
      google: [],
      elements: [{ ...REUNION, jeSuisOrganisateur: false, modifiable: false }],
    });
    await b.s.synchroniser('C1', MAINTENANT);
    expect(b.agenda.repondre).toHaveBeenCalledWith(expect.anything(), 'R1', 'non');
    const occ = {
      ...REUNION,
      id: 'S1:2026-11-20T09:00:00.000Z',
      serieId: 'S1',
      occurrence: '2026-11-20T09:00:00.000Z',
    };
    const c = monter({ liens: [{ ...lien(), cle: occ.id }], google: [], elements: [occ] });
    await c.s.synchroniser('C1', MAINTENANT);
    expect(c.agenda.annuler).toHaveBeenCalledWith(expect.anything(), 'S1', 'occurrence', '2026-11-20T09:00:00.000Z');
  });

  it('accès retiré chez Google : la personne est prévenue de reconnecter, rien d’autre ne bouge', async () => {
    const { s, prisma, google, agenda } = monter();
    google.acces.mockRejectedValue(new ErreurGoogle(400, 'invalid_grant', true));
    await s.synchroniser('C1', MAINTENANT);
    expect(prisma.connexionAgenda.update).toHaveBeenCalledWith({
      where: { id: 'C1' },
      data: { erreur: 'L’accès à Google Agenda a été retiré : reconnectez le compte.' },
    });
    expect(agenda.semaine).not.toHaveBeenCalled();
  });

  it('une réunion qui échoue chez Google n’empêche pas les autres', async () => {
    const { s, google, prisma } = monter({ elements: [REUNION, { ...REUNION, id: 'R2' }] });
    google.creer.mockRejectedValueOnce(new ErreurGoogle(500, 'Backend Error')).mockResolvedValueOnce({ id: 'G2' });
    await s.synchroniser('C1', MAINTENANT);
    expect(prisma.lienExportAgenda.create).toHaveBeenCalledTimes(1);
    expect(prisma.lienExportAgenda.create.mock.calls[0][0].data.cle).toBe('R2');
  });

  it('plus d’accès à la société : réunions retirées de Google, accès révoqué, connexion supprimée', async () => {
    const { s, prisma, google, agenda, notifications } = monter({ liens: [lien()] });
    prisma.utilisateurSocieteRole.findMany.mockResolvedValue([]);
    await s.synchroniser('C1', MAINTENANT);
    expect(google.supprimer).toHaveBeenCalledWith('ACCES', 'awa@gc.sn', 'G1');
    expect(google.revoquer).toHaveBeenCalledWith('R');
    expect(prisma.connexionAgenda.delete).toHaveBeenCalledWith({ where: { id: 'C1' } });
    expect(agenda.semaine).not.toHaveBeenCalled();
    // Plus dans la société : pas de notification là.
    expect(notifications.envoyer).not.toHaveBeenCalled();
    expect(ROLE_HUB_ADMIN).toBeTruthy();
  });

  it('sessions coupées depuis l’autorisation (« déconnecter partout ») : nettoyée chez Google, supprimée, la personne prévenue', async () => {
    const { s, prisma, google, notifications } = monter({ liens: [lien()] });
    prisma.utilisateur.findUnique.mockResolvedValue({
      actif: true,
      sessionsValidesDepuis: new Date('2026-11-10T00:00:00Z'),
    });
    google.revoquer.mockRejectedValue(new Error('réseau'));
    await s.synchroniser('C1', MAINTENANT);
    expect(google.supprimer).toHaveBeenCalledWith('ACCES', 'awa@gc.sn', 'G1');
    expect(prisma.connexionAgenda.delete).toHaveBeenCalledWith({ where: { id: 'C1' } });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agenda_deconnecte', destinataireIds: ['U1'], societeId: 'S1' }),
    );
  });

  it('sessions coupées mais Google injoignable : rien n’est abandonné, nouvel essai à la tournée suivante', async () => {
    const { s, prisma, google } = monter({ liens: [lien()] });
    prisma.utilisateur.findUnique.mockResolvedValue({
      actif: true,
      sessionsValidesDepuis: new Date('2026-11-10T00:00:00Z'),
    });
    google.acces.mockRejectedValue(new ErreurGoogle(503, 'indisponible'));
    await s.synchroniser('C1', MAINTENANT);
    expect(prisma.connexionAgenda.delete).not.toHaveBeenCalled();
    expect(prisma.connexionAgenda.update.mock.calls[0][0].data.erreur).toContain('ne répond pas');
  });

  it('compte en pause : rien n’est lu ni écrit chez Google', async () => {
    const { s, prisma, google } = monter();
    prisma.connexionAgenda.findUnique.mockResolvedValue({
      ...(await prisma.connexionAgenda.findUnique()),
      active: false,
    });
    await s.synchroniser('C1', MAINTENANT);
    expect(google.acces).not.toHaveBeenCalled();
    expect(prisma.connexionAgenda.update).not.toHaveBeenCalled();
  });

  it('verrou : une synchronisation déjà en cours n’est pas doublée ; le verrou est rendu à la fin', async () => {
    const a = monter();
    a.prisma.connexionAgenda.updateMany.mockResolvedValueOnce({ count: 0 });
    await a.s.synchroniser('C1', MAINTENANT);
    expect(a.prisma.connexionAgenda.findUnique).not.toHaveBeenCalled();
    const b = monter();
    expect(await b.s.synchroniser('C1', MAINTENANT)).toBe(true);
    // Rendu seulement s'il est encore le sien (pas repris entre-temps après abandon).
    expect(b.prisma.connexionAgenda.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'C1', synchroDepuis: MAINTENANT },
      data: { synchroDepuis: null },
    });
  });

  it('autre erreur que la maintenance : remontée (journalisée par la tournée), verrou rendu', async () => {
    const { s, switches, prisma } = monter();
    switches.refuseDuringMaintenance.mockRejectedValue(new Error('base indisponible'));
    await expect(s.synchroniser('C1', MAINTENANT)).rejects.toThrow('base indisponible');
    expect(prisma.connexionAgenda.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { synchroDepuis: null } }),
    );
  });

  it('liens hors période : relus un à un (réunions du HUB d’abord) ; au-delà de 50, aucune décision cette tournée', async () => {
    // 60 réunions du HUB suivies, toutes absentes de la période lue chez Google.
    const elements = Array.from({ length: 60 }, (_, i) => ({ ...REUNION, id: `R${i}` }));
    const liens = elements.map((e, i) => ({ ...lien(), cle: e.id, idExterne: `G${i}` }));
    const { s, google, agenda, prisma } = monter({ elements, liens, google: [] });
    google.lire.mockImplementation((_a: string, _ag: string, id: string) =>
      Promise.resolve(googleHub({ id, extendedProperties: { private: { hubCle: id.replace('G', 'R') } } })),
    );
    await s.synchroniser('C1', MAINTENANT);
    expect(google.lire).toHaveBeenCalledTimes(50);
    // Relus : toujours là, rien à faire. Non relus : ni annulés, ni recréés.
    expect(agenda.annuler).not.toHaveBeenCalled();
    expect(google.creer).not.toHaveBeenCalled();
    expect(prisma.lienExportAgenda.create).not.toHaveBeenCalled();
  });

  it('maintenance : la tournée est sautée, rien n’est lu chez Google', async () => {
    const { s, switches, google, prisma } = monter();
    switches.refuseDuringMaintenance.mockRejectedValue(new ServiceUnavailableException('maintenance'));
    await s.synchroniser('C1', MAINTENANT);
    expect(google.acces).not.toHaveBeenCalled();
    expect(prisma.connexionAgenda.update).not.toHaveBeenCalled();
  });

  it('plus d’agenda cible : les réunions écrites par le HUB sont retirées de Google', async () => {
    const sansCible = AGENDAS.map((a) => ({ ...a, cible: false }));
    const { s, google, prisma, agenda } = monter({ agendas: sansCible, liens: [lien()] });
    await s.synchroniser('C1', MAINTENANT);
    expect(google.supprimer).toHaveBeenCalledWith('ACCES', 'awa@gc.sn', 'G1');
    expect(prisma.lienExportAgenda.delete).toHaveBeenCalledWith({
      where: { connexionId_cle: { connexionId: 'C1', cle: 'R1' } },
    });
    expect(agenda.semaine).not.toHaveBeenCalled();
  });

  it('agenda devenu partagé (plus propriétaire) : il cesse d’être la cible', async () => {
    const { s, google, prisma } = monter();
    google.agendas.mockResolvedValue([
      { id: 'awa@gc.sn', nom: 'Awa', couleur: null, principal: true, ecriture: true, proprietaire: false },
    ]);
    await s.synchroniser('C1', MAINTENANT);
    expect(prisma.agendaExterne.upsert.mock.calls[0][0].update).toMatchObject({ proprietaire: false, cible: false });
    // « feries » a disparu chez Google : retiré.
    expect(prisma.agendaExterne.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['A2'] } } });
  });

  it('import : ni les invitations envoyées par le HUB (UID @hub360.space) ni les événements annulés', async () => {
    const { s, prisma } = monter({
      elements: [],
      google: [
        {
          id: 'I1',
          iCalUID: 'rdv-R9@hub360.space',
          summary: 'Invitation',
          start: { dateTime: '2026-11-18T08:00:00Z' },
          end: { dateTime: '2026-11-18T09:00:00Z' },
        },
        {
          id: 'X1',
          status: 'cancelled',
          summary: 'Annulé',
          start: { dateTime: '2026-11-18T08:00:00Z' },
          end: { dateTime: '2026-11-18T09:00:00Z' },
        },
      ],
    });
    await s.synchroniser('C1', MAINTENANT);
    expect(prisma.evenementExterne.upsert).not.toHaveBeenCalled();
  });
});

describe('ligneImportee', () => {
  it('horaire ; journée entière (fin exclue) ; sans titre', () => {
    expect(
      ligneImportee({
        id: 'E',
        summary: 'X',
        start: { dateTime: '2026-11-18T08:00:00Z' },
        end: { dateTime: '2026-11-18T09:00:00Z' },
      }),
    ).toMatchObject({
      journee: false,
      debut: new Date('2026-11-18T08:00:00Z'),
    });
    expect(ligneImportee({ id: 'E', start: { date: '2026-11-18' }, end: { date: '2026-11-19' } })).toMatchObject({
      titre: '(sans titre)',
      journee: true,
      debut: new Date('2026-11-18T00:00:00.000Z'),
      fin: new Date('2026-11-19T00:00:00.000Z'),
    });
    expect(ligneImportee({ id: 'E' })).toBeNull();
  });
});
