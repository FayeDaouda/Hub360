import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TypeReporting } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { REPORTINGS } from './pilotage-regles';

type Acteur = { userId: string; societeId: string; role: string };
type Position = 'destinataire' | 'emetteur' | null;

const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();
const moisLong = (mois: string) =>
  new Date(`${mois}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const titreReporting = (type: TypeReporting) => (type === 'rh' ? 'Reporting RH' : 'Reporting de la direction');

// Suivi d'un reporting déposé (revue CFO 20/10/2026, lot 5) : le destinataire
// (CFO pour le reporting RH) accuse réception ou pose une question ;
// l'émetteur (RH) répond dans le même fil. Personne d'autre n'accède au fil :
// chaque action est vérifiée ici, par la fonction de l'acteur.
@Injectable()
export class SuiviReportingService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  position(a: Pick<Acteur, 'role'>, type: TypeReporting): Position {
    const r = REPORTINGS[type];
    return a.role === r.destinataire ? 'destinataire' : a.role === r.emetteur ? 'emetteur' : null;
  }

  private async depot(a: Acteur, type: TypeReporting, mois: string) {
    const d = await this.prisma.reportingMensuel.findUnique({
      where: { societeId_type_mois: { societeId: a.societeId, type, mois } },
      select: { id: true, deposeLe: true },
    });
    if (!d) throw new NotFoundException('Ce reporting n’est pas encore déposé.');
    return d;
  }

  // Accusé de lecture : une ligne par lecteur et par dépôt ; un second clic
  // ne change rien (la première lecture fait foi).
  async lire(a: Acteur, type: TypeReporting, mois: string) {
    if (this.position(a, type) !== 'destinataire')
      throw new ForbiddenException(
        `Seul le destinataire (${REPORTINGS[type].destinataire}) accuse réception de ce reporting.`,
      );
    const d = await this.depot(a, type, mois);
    await this.prisma.lectureReporting.upsert({
      where: { reportingId_lecteurId: { reportingId: d.id, lecteurId: a.userId } },
      create: { reportingId: d.id, lecteurId: a.userId, version: d.deposeLe },
      update: {},
    });
  }

  async questionner(a: Acteur, type: TypeReporting, mois: string, texte: string) {
    if (this.position(a, type) !== 'destinataire')
      throw new ForbiddenException('Seul le destinataire pose une question sur ce reporting.');
    if (texte.trim().length < 3) throw new BadRequestException('La question est vide.');
    const d = await this.depot(a, type, mois);
    await this.prisma.questionReporting.create({
      data: { reportingId: d.id, auteurId: a.userId, texte: texte.trim() },
    });
    // Le titre ne recopie pas la question : elle se lit dans le reporting.
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'reporting_question',
      titre: `Question sur votre ${titreReporting(type)} · ${moisLong(mois)} · à traiter dans Pilotage`,
      destinataireIds: await this.notifications.titulairesRole(a.societeId, REPORTINGS[type].emetteur),
      parId: a.userId,
    });
  }

  async repondre(a: Acteur, type: TypeReporting, mois: string, questionId: string, texte: string) {
    if (this.position(a, type) !== 'emetteur')
      throw new ForbiddenException('Seul l’émetteur du reporting répond aux questions.');
    if (texte.trim().length < 3) throw new BadRequestException('La réponse est vide.');
    const d = await this.depot(a, type, mois);
    const q = await this.prisma.questionReporting.findFirst({
      where: { id: questionId, reportingId: d.id },
      select: { id: true, auteurId: true },
    });
    if (!q) throw new NotFoundException('Question introuvable.');
    // Conditionné sur « sans réponse » : deux réponses simultanées → une seule.
    const maj = await this.prisma.questionReporting.updateMany({
      where: { id: q.id, reponse: null },
      data: { reponse: texte.trim(), reponduParId: a.userId, reponduLe: new Date() },
    });
    if (!maj.count) throw new ConflictException('Cette question a déjà reçu une réponse.');
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'reporting_reponse',
      titre: `Réponse reçue · ${titreReporting(type)} · ${moisLong(mois)}`,
      destinataireIds: [q.auteurId],
      parId: a.userId,
    });
  }

  // Pour la vue Pilotage : lecture (visible de tous ceux qui voient le
  // reporting) ; fil et actions (destinataire et émetteur seulement).
  async suivi(a: Acteur, depots: { id: string; type: TypeReporting }[]) {
    if (!depots.length) return new Map<string, Suivi>();
    const ids = depots.map((d) => d.id);
    const [lectures, questions] = await Promise.all([
      this.prisma.lectureReporting.findMany({ where: { reportingId: { in: ids } }, orderBy: { luLe: 'asc' } }),
      this.prisma.questionReporting.findMany({ where: { reportingId: { in: ids } }, orderBy: { creeLe: 'asc' } }),
    ]);
    const noms = await this.noms([
      ...lectures.map((l) => l.lecteurId),
      ...questions.flatMap((q) => [q.auteurId, q.reponduParId]),
    ]);
    const nom = (id: string | null) => (id ? (noms.get(id) ?? 'compte supprimé') : null);
    return new Map(
      depots.map((d) => {
        const position = this.position(a, d.type);
        const lecture = lectures.find((l) => l.reportingId === d.id) ?? null;
        const fil = questions.filter((q) => q.reportingId === d.id);
        return [
          d.id,
          {
            lecture: lecture ? { le: lecture.luLe, par: nom(lecture.lecteurId) } : null,
            luParMoi: lectures.some((l) => l.reportingId === d.id && l.lecteurId === a.userId),
            questionsOuvertes: fil.filter((q) => !q.reponse).length,
            // Le fil ne part qu'aux deux parties du reporting.
            fil: position
              ? fil.map((q) => ({
                  id: q.id,
                  texte: q.texte,
                  le: q.creeLe,
                  par: nom(q.auteurId),
                  reponse: q.reponse,
                  reponduLe: q.reponduLe,
                  reponduPar: nom(q.reponduParId),
                }))
              : null,
            peutLire: position === 'destinataire',
            peutQuestionner: position === 'destinataire',
            peutRepondre: position === 'emetteur',
          },
        ] as const;
      }),
    );
  }

  // Questions qui attendent l'émetteur (« À traiter » de la RH).
  async questionsOuvertes(a: Acteur) {
    const types = (Object.keys(REPORTINGS) as TypeReporting[]).filter((t) => this.position(a, t) === 'emetteur');
    if (!types.length) return [];
    const questions = await this.prisma.questionReporting.findMany({
      where: { reponse: null, reporting: { societeId: a.societeId, type: { in: types } } },
      include: { reporting: { select: { type: true, mois: true } } },
      orderBy: { creeLe: 'asc' },
    });
    const noms = await this.noms(questions.map((q) => q.auteurId));
    return questions.map((q) => ({
      id: q.id,
      type: q.reporting.type,
      mois: q.reporting.mois,
      periode: moisLong(q.reporting.mois),
      titre: titreReporting(q.reporting.type),
      le: q.creeLe,
      par: noms.get(q.auteurId) ?? null,
    }));
  }

  private async noms(ids: (string | null)[]) {
    const uniques = [...new Set(ids.filter((x): x is string => !!x))];
    const u = uniques.length
      ? await this.prisma.utilisateur.findMany({
          where: { id: { in: uniques } },
          select: { id: true, prenom: true, nom: true },
        })
      : [];
    return new Map(u.map((x) => [x.id, nomDe(x)]));
  }
}

export type Suivi = {
  lecture: { le: Date; par: string | null } | null;
  luParMoi: boolean;
  questionsOuvertes: number;
  fil:
    | {
        id: string;
        texte: string;
        le: Date;
        par: string | null;
        reponse: string | null;
        reponduLe: Date | null;
        reponduPar: string | null;
      }[]
    | null;
  peutLire: boolean;
  peutQuestionner: boolean;
  peutRepondre: boolean;
};
