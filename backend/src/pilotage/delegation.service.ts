import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ROLE_CEO, ROLES_DELEGATAIRES } from '../commun/delegation-ceo';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type Acteur = { userId: string; societeId: string; role: string };
const ROLE_CIO = 'CIO (transverse)';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (j: string) => j.split('-').reverse().join('/');
const libelleRole = (r: string) => r.replace(/\s*\(transverse\)$/, '');

// Ce que le délégataire peut décider, selon sa fonction (ses propres droits
// font foi : le CTO n'a pas la main sur les finances).
export const PERIMETRE_DELEGATION: Record<string, string[]> = {
  CFO: ['avoirs au-delà du seuil', 'décisions proposées', 'absences des directeurs'],
  'CTO (transverse)': ['décisions proposées', 'absences des directeurs'],
};
export const JAMAIS_DELEGUE = ['droits du CIO', 'ses propres demandes', 'salaire du CFO'];

// Délégation du CEO (revue CEO, 22/10/2026) : aucune par défaut ; le CEO
// désigne un délégataire (CTO ou CFO) pour une période ; il peut la révoquer.
@Injectable()
export class DelegationService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async lire(a: Acteur) {
    const jour = aujourdhui();
    const delegations = await this.prisma.delegationCeo.findMany({
      where: { societeId: a.societeId, revoqueLe: null, au: { gte: jour } },
      orderBy: { du: 'asc' },
    });
    const noms = await this.noms(delegations.map((d) => d.delegataireId));
    const vers = (d: (typeof delegations)[number]) => ({
      id: d.id,
      delegataire: noms.get(d.delegataireId) ?? 'compte supprimé',
      role: libelleRole(d.roleDelegataire),
      du: d.du,
      au: d.au,
      enCours: d.du <= jour,
      perimetre: PERIMETRE_DELEGATION[d.roleDelegataire] ?? [],
    });
    if (a.role === ROLE_CEO || a.role === 'societe_admin') {
      const candidats = await this.prisma.utilisateurSocieteRole.findMany({
        where: { societeId: a.societeId, role: { nom: { in: [...ROLES_DELEGATAIRES] } }, utilisateur: { actif: true } },
        select: { role: { select: { nom: true } }, utilisateur: { select: { id: true, prenom: true, nom: true } } },
      });
      return {
        peutGerer: a.role === ROLE_CEO,
        delegations: delegations.map(vers),
        candidats: candidats.map((c) => ({ id: c.utilisateur.id, nom: `${c.utilisateur.prenom} ${c.utilisateur.nom}`, role: libelleRole(c.role.nom) })),
        jamais: JAMAIS_DELEGUE,
      };
    }
    // Le délégataire voit la sienne ; le CIO, toutes (contrôle).
    const visibles = a.role === ROLE_CIO ? delegations : delegations.filter((d) => d.delegataireId === a.userId);
    return { peutGerer: false, delegations: visibles.map(vers), candidats: [], jamais: JAMAIS_DELEGUE };
  }

  async creer(a: Acteur, dto: { delegataireId: string; du: string; au: string }) {
    if (a.role !== ROLE_CEO) throw new ForbiddenException('Seul le CEO délègue ses décisions.');
    if (!DATE.test(dto.du) || !DATE.test(dto.au)) throw new BadRequestException('Dates invalides (AAAA-MM-JJ).');
    if (dto.du < aujourdhui()) throw new BadRequestException('Une délégation ne commence pas dans le passé.');
    if (dto.au < dto.du) throw new BadRequestException('La fin précède le début.');
    if (dto.delegataireId === a.userId) throw new BadRequestException('Le CEO ne se délègue pas à lui-même.');
    const affectation = await this.prisma.utilisateurSocieteRole.findFirst({
      where: { societeId: a.societeId, utilisateurId: dto.delegataireId, role: { nom: { in: [...ROLES_DELEGATAIRES] } }, utilisateur: { actif: true } },
      select: { role: { select: { nom: true } }, utilisateur: { select: { prenom: true, nom: true } } },
    });
    if (!affectation) throw new BadRequestException('Le délégataire est le CTO ou le CFO, avec un compte HUB actif.');
    const chevauche = await this.prisma.delegationCeo.count({
      where: { societeId: a.societeId, revoqueLe: null, du: { lte: dto.au }, au: { gte: dto.du } },
    });
    if (chevauche) throw new ConflictException('Une délégation couvre déjà une partie de cette période : révoquez-la d’abord.');
    await this.prisma.delegationCeo.create({
      data: { societeId: a.societeId, delegataireId: dto.delegataireId, roleDelegataire: affectation.role.nom, du: dto.du, au: dto.au, creeParId: a.userId },
    });
    const perimetre = (PERIMETRE_DELEGATION[affectation.role.nom] ?? []).join(', ');
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'delegation_ceo',
      titre: `Délégation du CEO à ${affectation.utilisateur.prenom} ${affectation.utilisateur.nom} du ${dateFr(dto.du)} au ${dateFr(dto.au)} · ${perimetre} · jamais : ${JAMAIS_DELEGUE.join(', ')}`,
      destinataireIds: [dto.delegataireId, ...(await this.notifications.titulairesRole(a.societeId, ROLE_CIO))],
      parId: a.userId,
    });
    return this.lire(a);
  }

  async revoquer(a: Acteur, id: string) {
    if (a.role !== ROLE_CEO) throw new ForbiddenException('Seul le CEO révoque une délégation.');
    const d = await this.prisma.delegationCeo.findFirst({ where: { id, societeId: a.societeId } });
    if (!d) throw new NotFoundException('Délégation introuvable.');
    if (d.revoqueLe) throw new ConflictException('Délégation déjà révoquée.');
    await this.prisma.delegationCeo.update({ where: { id }, data: { revoqueLe: new Date(), revoqueParId: a.userId } });
    await this.notifications.envoyer({
      societeId: a.societeId,
      type: 'delegation_ceo',
      titre: `Délégation du CEO révoquée (prévue du ${dateFr(d.du)} au ${dateFr(d.au)}) · les décisions reviennent au CEO`,
      destinataireIds: [d.delegataireId, ...(await this.notifications.titulairesRole(a.societeId, ROLE_CIO))],
      parId: a.userId,
    });
    return this.lire(a);
  }

  private async noms(ids: string[]) {
    const u = ids.length ? await this.prisma.utilisateur.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, prenom: true, nom: true } }) : [];
    return new Map(u.map((x) => [x.id, `${x.prenom} ${x.nom}`]));
  }
}
