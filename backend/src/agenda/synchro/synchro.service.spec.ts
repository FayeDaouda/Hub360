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
  entretien: false,
  inviteIds: ['U2'],
  serieId: null,
  occurrence: null,
};

const monter = (x: { liens?: unknown[]; elements?: unknown[]; google?: unknown[] } = {}) => {
  const prisma = {
    connexionAgenda: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'C1',
        societeId: 'S1',
        utilisateurId: 'U1',
        fournisseur: 'google',
        accesChiffre: chiffrer('R', CLE),
        agendas: [
          { id: 'A1', idExterne: 'awa@gc.sn', importe: true, cible: true },
          { id: 'A2', idExterne: 'feries', importe: false, cible: false },
        ],
        liens: x.liens ?? [],
      }),
      update: jest.fn(),
    },
    // acteurAgenda
    utilisateur: { findUnique: jest.fn().mockResolvedValue({ actif: true, sessionsValidesDepuis: null }) },
    societe: { findUnique: jest.fn().mockResolvedValue({ nom: 'Grey Concrete', slug: 'gc', actif: true }) },
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ societeId: 'S1', role: { nom: 'Salarié' } }]) },
    evenementExterne: { deleteMany: jest.fn().mockReturnValue('del'), upsert: jest.fn().mockReturnValue('up') },
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
    evenements: jest
      .fn()
      .mockImplementation((_a: string, agendaId: string) =>
        Promise.resolve(agendaId === 'awa@gc.sn' ? (x.google ?? []) : []),
      ),
    creer: jest.fn().mockResolvedValue({ id: 'G-NOUVEAU' }),
    modifier: jest.fn(),
    supprimer: jest.fn(),
  };
  const s = new SynchroAgendaService(prisma as never, rights as never, agenda as never, google as never);
  return { s, prisma, agenda, google };
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

  it('plus d’accès à la société : synchronisation arrêtée, la personne le sait', async () => {
    const { s, prisma, google } = monter();
    prisma.utilisateurSocieteRole.findMany.mockResolvedValue([]);
    await s.synchroniser('C1', MAINTENANT);
    expect(google.acces).not.toHaveBeenCalled();
    expect(prisma.connexionAgenda.update.mock.calls[0][0].data.erreur).toContain('plus accès');
    expect(ROLE_HUB_ADMIN).toBeTruthy();
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
