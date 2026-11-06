import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ETAPE, hasRight } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import type { Temps } from '../reglages/gabarit';
import { ProjectStatesService } from './project-states.service';
import type { Actor } from './project-query';
import { dateOfDay } from './work-calendar';
import type { CustomLineDto, UpdateLineDto } from './open-projects.dto';

const MAX_LINES_PER_CARD = 60;

// « Documents du client » → « documents_du_client » (clé d'une ligne ajoutée).
const toKey = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'ligne';
const hoursLabel = (h: number | null) => (h === null ? 'sans temps atelier' : `${String(h).replace('.', ',')} h`);
const windowLabel = (d: number | null, f: number | null) =>
  d !== null && f !== null ? `J${d} → J${f}` : 'sans fenêtre';

// Personnalisation d'un projet (01/11/2026) : la direction ajoute, modifie
// ou retire des lignes d'un projet en cours, sans toucher au gabarit — le
// projet garde par défaut les lignes de sa version. Une ligne déjà remise ou
// validée ne se retire pas (son historique reste) : on la marque « Non
// nécessaire ». Chaque changement entre au journal du projet.
@Injectable()
export class ProjectCustomizationService {
  constructor(
    private prisma: PrismaService,
    private states: ProjectStatesService,
  ) {}

  async addLine(companyId: string, actor: Actor, projectId: string, cardId: string, dto: CustomLineDto) {
    this.check(actor);
    const card = await this.prisma.carteProjet.findFirst({
      where: { id: cardId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      include: {
        taches: { select: { cle: true, libelle: true, ordre: true } },
        projet: { select: { ouvertLe: true } },
      },
    });
    if (!card) throw new NotFoundException('Carte introuvable');
    if (card.fichiers || card.desactivation) throw new ConflictException('Cette carte ne reçoit pas de ligne.');
    const label = dto.libelle.trim();
    if (card.taches.some((t) => t.libelle.toLowerCase() === label.toLowerCase())) {
      throw new ConflictException(`La ligne « ${label} » existe déjà dans cette carte.`);
    }
    if (card.taches.length >= MAX_LINES_PER_CARD)
      throw new ConflictException(`${MAX_LINES_PER_CARD} lignes au plus par carte.`);
    const window = await this.window(companyId, card.projet.ouvertLe!, dto.debutJ, dto.finJ);
    const hours = this.hours(dto.heures);

    const base = `p_${toKey(label)}`;
    let key = base;
    for (let i = 2; card.taches.some((t) => t.cle === key); i++) key = `${base}_${i}`;
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tacheProjet.create({
        data: {
          projetId: projectId,
          carteId: card.id,
          cle: key,
          libelle: label,
          ordre: Math.max(-1, ...card.taches.map((t) => t.ordre)) + 1,
          descriptif: dto.descriptif?.trim() || null,
          ...window,
          temps: (hours === null
            ? { type: 'sans' }
            : { type: 'heures', heures: hours }) satisfies Temps as Prisma.InputJsonValue,
          heures: hours,
          visaRequis: !!dto.visaRequis,
          fichierObligatoire: dto.fichierObligatoire ?? true,
          ajouteeAuProjet: true,
        },
        select: { id: true, libelle: true },
      });
      await tx.modificationProjet.create({
        data: {
          projetId: projectId,
          libelle: `${card.libelle} · ${label} — ligne ajoutée (${windowLabel(window.debutJ, window.finJ)}, ${hoursLabel(hours)}${dto.visaRequis ? ', visa DPLG' : ''})`,
          parId: actor.userId,
        },
      });
      return created;
    });
    return { ok: true, tacheId: task.id };
  }

  async updateLine(companyId: string, actor: Actor, projectId: string, taskId: string, dto: UpdateLineDto) {
    this.check(actor);
    const t = await this.task(companyId, projectId, taskId);
    const done = t.statut === 'validee' || t.statut === 'non_necessaire';
    const changes: string[] = [];
    const data: Prisma.TacheProjetUpdateInput = {};

    if (dto.libelle !== undefined && dto.libelle.trim() !== t.libelle) {
      const label = dto.libelle.trim();
      const twin = await this.prisma.tacheProjet.findFirst({
        where: { carteId: t.carteId, id: { not: t.id }, libelle: { equals: label, mode: 'insensitive' } },
        select: { id: true },
      });
      if (twin) throw new ConflictException(`La ligne « ${label} » existe déjà dans cette carte.`);
      data.libelle = label;
      changes.push(`intitulé : « ${t.libelle} » → « ${label} »`);
    }
    if (dto.descriptif !== undefined && (dto.descriptif.trim() || null) !== t.descriptif) {
      data.descriptif = dto.descriptif.trim() || null;
      changes.push('descriptif modifié');
    }
    // Fenêtre et temps : pas sur une ligne déjà validée (délais et heures comptés).
    const windowChanged = dto.debutJ !== undefined || dto.finJ !== undefined;
    if (windowChanged && ((dto.debutJ ?? null) !== t.debutJ || (dto.finJ ?? null) !== t.finJ)) {
      if (done) throw new ConflictException('Ligne déjà validée ou non nécessaire : sa fenêtre ne change plus.');
      const window = await this.window(companyId, t.projet.ouvertLe!, dto.debutJ ?? undefined, dto.finJ ?? undefined);
      Object.assign(data, window);
      changes.push(`fenêtre : ${windowLabel(t.debutJ, t.finJ)} → ${windowLabel(window.debutJ, window.finJ)}`);
    }
    if (dto.heures !== undefined) {
      const hours = this.hours(dto.heures);
      const before = t.heures === null ? null : Number(t.heures);
      if (hours !== before) {
        if (done) throw new ConflictException('Ligne déjà validée ou non nécessaire : son temps ne change plus.');
        data.heures = hours;
        data.temps = (hours === null
          ? { type: 'sans' }
          : { type: 'heures', heures: hours }) satisfies Temps as Prisma.InputJsonValue;
        changes.push(`temps : ${hoursLabel(before)} → ${hoursLabel(hours)}`);
      }
    }
    if (dto.visaRequis !== undefined && dto.visaRequis !== t.visaRequis) {
      if (done) throw new ConflictException('Ligne déjà validée ou non nécessaire : le visa ne change plus.');
      data.visaRequis = dto.visaRequis;
      changes.push(`visa DPLG : ${t.visaRequis ? 'oui' : 'non'} → ${dto.visaRequis ? 'oui' : 'non'}`);
    }
    if (dto.fichierObligatoire !== undefined && dto.fichierObligatoire !== t.fichierObligatoire) {
      data.fichierObligatoire = dto.fichierObligatoire;
      changes.push(
        `fichier obligatoire : ${t.fichierObligatoire ? 'oui' : 'non'} → ${dto.fichierObligatoire ? 'oui' : 'non'}`,
      );
    }
    if (!changes.length) throw new BadRequestException('Aucune modification.');
    await this.prisma.$transaction([
      this.prisma.tacheProjet.update({ where: { id: t.id }, data }),
      this.prisma.modificationProjet.create({
        data: {
          projetId: projectId,
          libelle: `${t.carte.libelle} · ${t.libelle} — ${changes.join(', ')}`,
          parId: actor.userId,
        },
      }),
    ]);
    return { ok: true };
  }

  async removeLine(companyId: string, actor: Actor, projectId: string, taskId: string) {
    this.check(actor);
    const t = await this.task(companyId, projectId, taskId);
    if (t.statut !== 'a_faire' || t.version > 0) {
      throw new ConflictException(
        'Ligne déjà remise ou validée : marquez-la « Non nécessaire » plutôt que de la retirer.',
      );
    }
    if (t.devisTsId) throw new ConflictException('Élément ajouté en TS : il se retire de l’avenant, pas d’ici.');
    const condition = await this.prisma.carteProjet.findFirst({
      where: { projetId: projectId, ouvreApres: { has: `${t.carte.cle}.${t.cle}` } },
      select: { libelle: true },
    });
    if (condition) throw new ConflictException(`Elle conditionne l’ouverture de la carte « ${condition.libelle} ».`);
    const others = await this.prisma.tacheProjet.count({ where: { carteId: t.carteId, id: { not: t.id } } });
    if (!others) throw new ConflictException('Une carte garde au moins une ligne.');
    await this.prisma.$transaction([
      this.prisma.tacheProjet.delete({ where: { id: t.id } }),
      this.prisma.modificationProjet.create({
        data: {
          projetId: projectId,
          libelle: `${t.carte.libelle} · ${t.libelle} — ligne retirée`,
          parId: actor.userId,
        },
      }),
    ]);
    return { ok: true };
  }

  private check(actor: Actor) {
    if (!hasRight(actor.permissions, ETAPE.projetsPersonnalisation, 'ecriture')) {
      throw new ForbiddenException('Personnaliser un projet demande l’Écriture de « Personnalisation du projet ».');
    }
  }

  private async task(companyId: string, projectId: string, taskId: string) {
    const t = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      include: { carte: { select: { cle: true, libelle: true } }, projet: { select: { ouvertLe: true } } },
    });
    if (!t) throw new NotFoundException('Ligne introuvable');
    return t;
  }

  // Fenêtre en jours ouvrés depuis J1 (les deux, ou aucune) et ses dates.
  private async window(companyId: string, day1: string, start?: number, end?: number) {
    if (start === undefined && end === undefined) return { debutJ: null, finJ: null, debutLe: null, finLe: null };
    if (start === undefined || end === undefined || start < 1 || start > end || end > 999) {
      throw new BadRequestException('Fenêtre invalide : J début et J fin, à partir de J1, début avant la fin.');
    }
    const holidays = await this.states.holidays(companyId);
    return {
      debutJ: start,
      finJ: end,
      debutLe: dateOfDay(day1, start, holidays),
      finLe: dateOfDay(day1, end, holidays),
    };
  }

  private hours(h: number | null | undefined): number | null {
    if (h === null || h === undefined) return null;
    if (!(h > 0 && h <= 999) || Math.abs(Math.round(h * 10) - h * 10) > 1e-9) {
      throw new BadRequestException('Temps invalide : heures positives, une décimale au plus.');
    }
    return h;
  }
}
