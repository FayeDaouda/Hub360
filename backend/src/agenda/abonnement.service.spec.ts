import { NotFoundException } from '@nestjs/common';
import { ROLE_HUB_ADMIN } from '@hub/domain';
import { hacherJeton } from '../auth/jetons';
import { AbonnementAgendaService, evenementsDuFlux } from './abonnement.service';
import type { ElementAgendaDto } from './agenda.dto';

// Abonnement à son agenda depuis Google, Apple ou Outlook (12/11/2026).
const AB = {
  id: 'A1',
  societeId: 'S1',
  utilisateurId: 'U1',
  jetonHash: 'H1',
  creeLe: new Date('2026-11-10T09:00:00.000Z'),
  dernierAccesLe: null as Date | null,
};

const monter = (
  o: {
    actif?: boolean;
    droits?: Record<string, string>;
    role?: string;
    affecte?: boolean;
    sessionsValidesDepuis?: Date;
  } = {},
) => {
  const prisma = {
    abonnementAgenda: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    utilisateur: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ actif: o.actif ?? true, sessionsValidesDepuis: o.sessionsValidesDepuis ?? null }),
    },
    societe: {
      findUnique: jest.fn().mockResolvedValue({ nom: 'Grey Concrete', slug: 'grey-concrete', actif: true }),
    },
    utilisateurSocieteRole: {
      findMany: jest
        .fn()
        .mockResolvedValue(o.affecte === false ? [] : [{ societeId: 'S1', role: { nom: o.role ?? 'Salarié' } }]),
    },
  };
  const agenda = { semaine: jest.fn().mockResolvedValue({ elements: [] }) };
  const rights = { forUser: jest.fn().mockResolvedValue(o.droits ?? { agenda: 'L' }) };
  const switches = { refuseDuringMaintenance: jest.fn() };
  const s = new AbonnementAgendaService(prisma as never, agenda as never, rights as never, switches as never);
  return { s, prisma, agenda, rights, switches };
};
const moi = { userId: 'U1', societeId: 'S1', role: 'Salarié', permissions: { agenda: 'L' } };

const el = (e: Partial<ElementAgendaDto> & Pick<ElementAgendaDto, 'id' | 'type' | 'jour'>): ElementAgendaDto => ({
  titre: 'x',
  debut: null,
  fin: null,
  lieu: null,
  detail: null,
  organisateur: null,
  invites: [],
  annulable: false,
  modifiable: false,
  entretien: false,
  description: null,
  inviteIds: [],
  ...e,
});

describe('AbonnementAgendaService', () => {
  it('le lien porte un jeton dont seule l’empreinte est gardée ; régénérer la remplace', async () => {
    const { s, prisma } = monter();
    const { url } = await s.creer(moi);
    const jeton = /\/agenda-abonnement\/([A-Za-z0-9_-]{43})\.ics$/.exec(url)?.[1];
    expect(jeton).toBeDefined();
    const appel = prisma.abonnementAgenda.upsert.mock.calls[0][0];
    expect(appel.create.jetonHash).toBe(hacherJeton(jeton!));
    expect(appel.update).toMatchObject({ jetonHash: hacherJeton(jeton!), dernierAccesLe: null });
    expect(JSON.stringify(appel)).not.toContain(jeton);
  });

  it('le flux relit son agenda, sans les demandes à trancher, et le publie', async () => {
    const { s, agenda, prisma } = monter();
    const ics = await s.flux(AB);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('X-WR-CALNAME:HUB · Grey Concrete');
    const [acteur, , personne, , options] = agenda.semaine.mock.calls[0];
    expect(acteur).toMatchObject({ userId: 'U1', societeId: 'S1' });
    expect(personne).toBeUndefined();
    expect(options).toEqual({ sansDemandes: true });
    // Dernière relecture tracée, pour ce jeton seulement.
    expect(prisma.abonnementAgenda.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'A1', jetonHash: 'H1' } }),
    );
  });

  it('la dernière relecture n’est réécrite qu’au-delà de 10 minutes', async () => {
    const { s, prisma } = monter();
    await s.flux({ ...AB, dernierAccesLe: new Date(Date.now() - 60_000) });
    expect(prisma.abonnementAgenda.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['compte désactivé', { actif: false }],
    ['plus d’accès à la société', { affecte: false }],
    ['plus la Lecture de « Mon agenda »', { droits: {} }],
    ['sessions coupées après la création du lien', { sessionsValidesDepuis: new Date('2026-11-11T09:00:00.000Z') }],
  ])('%s : introuvable, comme un jeton faux', async (_, o) => {
    const { s, agenda } = monter(o);
    await expect(s.flux(AB)).rejects.toThrow(NotFoundException);
    expect(agenda.semaine).not.toHaveBeenCalled();
  });

  it('sessions coupées AVANT la création du lien : il reste valable', async () => {
    const { s } = monter({ sessionsValidesDepuis: new Date('2026-11-09T09:00:00.000Z') });
    await expect(s.flux(AB)).resolves.toContain('BEGIN:VCALENDAR');
  });

  it('la maintenance s’applique ; l’Administrateur HUB garde sa carte blanche', async () => {
    const { s, switches, rights } = monter({ role: ROLE_HUB_ADMIN });
    await s.flux(AB);
    expect(switches.refuseDuringMaintenance).toHaveBeenCalledWith(true);
    expect(rights.forUser).toHaveBeenCalledWith(expect.objectContaining({ adminHub: true }));
  });
});

describe('AbonnementAgendaService · état', () => {
  it('un lien coupé avec les sessions n’est plus présenté comme actif', async () => {
    const { s, prisma } = monter();
    const creeLe = new Date('2026-11-10T09:00:00.000Z');
    prisma.abonnementAgenda.findUnique.mockResolvedValueOnce({
      creeLe,
      dernierAccesLe: null,
      utilisateur: { sessionsValidesDepuis: new Date('2026-11-11T09:00:00.000Z') },
    });
    expect(await s.etat(moi)).toEqual({ actif: false, creeLe: null, dernierAccesLe: null });
    prisma.abonnementAgenda.findUnique.mockResolvedValueOnce({
      creeLe,
      dernierAccesLe: null,
      utilisateur: { sessionsValidesDepuis: null },
    });
    expect(await s.etat(moi)).toMatchObject({ actif: true, creeLe: creeLe.toISOString() });
  });
});

describe('evenementsDuFlux', () => {
  const LIEN = 'https://app.hub360.space/admin/grey-concrete/agenda';

  it('un congé jour par jour devient une seule absence, sans son type', () => {
    const evts = evenementsDuFlux(
      [
        el({ id: 'C1:2026-11-03', type: 'conge', jour: '2026-11-03', titre: 'Absence validée', detail: 'du …' }),
        el({ id: 'C1:2026-11-04', type: 'conge', jour: '2026-11-04', titre: 'Absence validée' }),
        el({ id: 'C1:2026-11-02', type: 'conge', jour: '2026-11-02', titre: 'Absence validée' }),
      ],
      LIEN,
    );
    expect(evts).toEqual([
      { uid: 'absence-C1@hub360.space', titre: 'Absence', debut: '2026-11-02', fin: '2026-11-04' },
    ]);
  });

  it('les demandes d’absence à trancher ne sortent jamais', () => {
    expect(
      evenementsDuFlux([el({ id: 'D1:2026-11-02', type: 'demande', jour: '2026-11-02', titre: 'Awa Diop' })], LIEN),
    ).toEqual([]);
  });

  it('rendez-vous : horodaté, participants et lien du HUB ; échéance : journée libre', () => {
    const [rdv, echeance] = evenementsDuFlux(
      [
        el({
          id: 'R1',
          type: 'rendez_vous',
          jour: '2026-11-13',
          titre: 'Point chantier',
          debut: '2026-11-13T09:00:00.000Z',
          fin: '2026-11-13T10:00:00.000Z',
          invites: ['Moussa Sow'],
          organisateur: 'Awa Diop',
        }),
        el({ id: 'T1', type: 'echeance', jour: '2026-11-14', titre: 'Plans RDC', detail: 'Échéance · GC-001' }),
      ],
      LIEN,
    );
    expect(rdv).toMatchObject({ uid: 'rdv-R1@hub360.space', debut: new Date('2026-11-13T09:00:00.000Z') });
    expect(rdv.description).toContain('Avec Moussa Sow');
    expect(rdv.description).toContain(LIEN);
    expect(echeance).toMatchObject({ titre: 'Échéance · GC-001 · Plans RDC', debut: '2026-11-14', libre: true });
  });
});
