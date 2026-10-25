import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuiviReportingService } from './suivi-reporting.service';

const CFO = { userId: 'U-CFO', societeId: 'S1', role: 'CFO' };
const RH = { userId: 'U-RH', societeId: 'S1', role: 'RH' };
const CTO = { userId: 'U-CTO', societeId: 'S1', role: 'CTO (transverse)' };
const DEPOSE = new Date('2026-10-04T09:00:00Z');

function svc(
  o: {
    depot?: object | null;
    question?: object | null;
    repondues?: number;
    lectures?: object[];
    questions?: object[];
  } = {},
) {
  const prisma = {
    reportingMensuel: {
      findUnique: jest.fn().mockResolvedValue(o.depot === undefined ? { id: 'R1', deposeLe: DEPOSE } : o.depot),
    },
    lectureReporting: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue(o.lectures ?? []) },
    questionReporting: {
      create: jest.fn(),
      findFirst: jest
        .fn()
        .mockResolvedValue(o.question === undefined ? { id: 'Q1', auteurId: CFO.userId } : o.question),
      updateMany: jest.fn().mockResolvedValue({ count: o.repondues ?? 1 }),
      findMany: jest.fn().mockResolvedValue(o.questions ?? []),
    },
    utilisateur: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'U-CFO', prenom: 'Bineta', nom: 'Sarr' },
        { id: 'U-RH', prenom: 'Coumba', nom: 'Gaye' },
      ]),
    },
  } as unknown as PrismaService;
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['U-RH']) };
  return {
    s: new SuiviReportingService(prisma, notifications as unknown as NotificationsService),
    prisma,
    notifications,
  };
}

describe('SuiviReportingService (reporting RH lu ou question, revue CFO lot 5)', () => {
  it('accusé de lecture : le destinataire seul, rattaché au dépôt lu, idempotent', async () => {
    const { s, prisma } = svc();
    await s.lire(CFO, 'rh', '2026-09');
    await s.lire(CFO, 'rh', '2026-09'); // double clic
    expect(prisma.lectureReporting.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.lectureReporting.upsert).toHaveBeenLastCalledWith({
      where: { reportingId_lecteurId: { reportingId: 'R1', lecteurId: 'U-CFO' } },
      create: { reportingId: 'R1', lecteurId: 'U-CFO', version: DEPOSE },
      update: {}, // la première lecture fait foi
    });
    await expect(svc().s.lire(RH, 'rh', '2026-09')).rejects.toThrow(ForbiddenException);
    await expect(svc().s.lire(CTO, 'rh', '2026-09')).rejects.toThrow(ForbiddenException);
    await expect(svc({ depot: null }).s.lire(CFO, 'rh', '2026-09')).rejects.toThrow(NotFoundException);
  });

  it('question : du destinataire, l’émetteur est prévenu sans que le texte soit recopié', async () => {
    const { s, prisma, notifications } = svc();
    await s.questionner(CFO, 'rh', '2026-09', 'Pourquoi 18 feuilles sans heures ?');
    await s.questionner(CFO, 'rh', '2026-09', 'Et le CDD de Moussa Camara ?'); // questions successives
    expect(prisma.questionReporting.create).toHaveBeenCalledTimes(2);
    expect(notifications.titulairesRole).toHaveBeenCalledWith('S1', 'RH');
    const notif = notifications.envoyer.mock.calls[0][0];
    expect(notif).toMatchObject({ type: 'reporting_question', destinataireIds: ['U-RH'] });
    expect(notif.titre).not.toContain('feuilles');
    await expect(svc().s.questionner(RH, 'rh', '2026-09', 'Question ?')).rejects.toThrow(ForbiddenException);
  });

  it('réponse : de l’émetteur seul, une fois, l’auteur de la question est prévenu', async () => {
    const { s, prisma, notifications } = svc();
    await s.repondre(RH, 'rh', '2026-09', 'Q1', 'Ce sont des salariés sans blocs planifiés.');
    expect(prisma.questionReporting.updateMany).toHaveBeenCalledWith({
      where: { id: 'Q1', reponse: null },
      data: expect.objectContaining({ reponduParId: 'U-RH' }),
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reporting_reponse', destinataireIds: ['U-CFO'] }),
    );
    await expect(svc({ repondues: 0 }).s.repondre(RH, 'rh', '2026-09', 'Q1', 'Encore')).rejects.toThrow(
      ConflictException,
    );
    await expect(svc().s.repondre(CFO, 'rh', '2026-09', 'Q1', 'Moi')).rejects.toThrow(ForbiddenException);
    await expect(svc({ question: null }).s.repondre(RH, 'rh', '2026-09', 'Q9', 'Réponse')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('vue : « lu » visible de tous, fil réservé aux deux parties, question ouverte sans effacer la lecture', async () => {
    const options = {
      lectures: [{ reportingId: 'R1', lecteurId: 'U-CFO', luLe: new Date('2026-10-05T08:30:00Z') }],
      questions: [
        {
          id: 'Q1',
          reportingId: 'R1',
          auteurId: 'U-CFO',
          texte: 'Pourquoi ?',
          creeLe: new Date('2026-10-05T08:40:00Z'),
          reponse: null,
          reponduParId: null,
          reponduLe: null,
        },
      ],
    };
    const cfo = (await svc(options).s.suivi(CFO, [{ id: 'R1', type: 'rh' }])).get('R1')!;
    expect(cfo).toMatchObject({
      lecture: { par: 'Bineta Sarr' },
      luParMoi: true,
      questionsOuvertes: 1,
      peutQuestionner: true,
      peutRepondre: false,
    });
    expect(cfo.fil).toHaveLength(1);
    const rh = (await svc(options).s.suivi(RH, [{ id: 'R1', type: 'rh' }])).get('R1')!;
    expect(rh).toMatchObject({ peutRepondre: true, peutLire: false });
    const cto = (await svc(options).s.suivi(CTO, [{ id: 'R1', type: 'rh' }])).get('R1')!;
    expect(cto.fil).toBeNull();
    expect(cto.lecture).not.toBeNull();
  });
});
