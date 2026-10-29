import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_CEO, ROLE_CIO, ROLE_COMPANY_ADMIN, ROLE_HOLDING_ADMIN, ROLE_HUB_ADMIN } from '@hub/domain';

const LIBELLE_NIVEAU: Record<NiveauPermission, string> = {
  aucun: 'aucun',
  lecture: 'lecture',
  ecriture: 'écriture',
  validation: 'validation',
};
const libelleRole = (nom: string) => nom.replace(/\s*\(transverse\)$/, '');

// Rôles socles : leur accès ne passe pas par la matrice (administration =
// tout) — jamais modifiables ici, même par
// le CIO : une case changée sur societe_admin couperait l'accès de toutes
// les administrations de société.
// L'Administrateur HUB non plus : ses droits ne viennent pas de la matrice.
const ROLES_SOCLE = new Set([ROLE_HOLDING_ADMIN, ROLE_COMPANY_ADMIN, ROLE_HUB_ADMIN]);

type RoleLu = { nom: string; societeId: string | null };

// Qui modifie quelle ligne de la matrice (gouvernance Bloc A, CIO = super
// admin du HUB, 28/09/2026) : les rôles propres à la société → son admin ou
// le CIO ; les rôles transverses (CEO/CTO/CIO) → le CIO seul.
// L'Administrateur HUB (`adminHub`) modifie toute ligne métier, transverse comprise.
function motifRefus(role: RoleLu, societeId: string, acteurRole: string, adminHub = false): string | null {
  if (ROLES_SOCLE.has(role.nom)) {
    return 'Les rôles d’administration ne se modifient pas depuis la matrice.';
  }
  if (role.societeId === societeId) return null;
  if (role.societeId === null) {
    return adminHub || acteurRole === ROLE_CIO ? null : 'Les rôles transverses (CEO, CTO, CIO) se gèrent par le CIO.';
  }
  return "Ce rôle n'appartient pas à cette société.";
}

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Rôles visibles pour une société : les siens (societeId = societeId) +
  // les rôles transverses (societeId null, ex. CEO/CTO/CIO). `modifiable`
  // est calculé pour l'appelant (même règle que majPermission) : le front
  // l'affiche tel quel, sans refaire la règle de son côté.
  async listerAvecPermissions(societeId: string, acteurRole: string, adminHub = false) {
    const [roles, modules] = await Promise.all([
      this.prisma.role.findMany({
        where: { OR: [{ societeId }, { societeId: null }], supprimeLe: null },
        orderBy: { nom: 'asc' },
        include: { permissions: { include: { module: true } } },
      }),
      this.prisma.module.findMany({ orderBy: { cle: 'asc' } }),
    ]);

    return {
      modules: modules.map((m) => ({ cle: m.cle, nom: m.nom })),
      roles: roles.map((r) => ({
        id: r.id,
        nom: r.nom,
        transverse: r.societeId === null,
        modifiable: motifRefus(r, societeId, acteurRole, adminHub) === null,
        permissions: Object.fromEntries(r.permissions.map((p) => [p.module.cle, p.niveau])) as Record<
          string,
          NiveauPermission
        >,
      })),
    };
  }

  // Règle revérifiée ici même si le front ne propose que les lignes
  // `modifiable` : cf. motifRefus. Le rôle CIO ne se modifie pas
  // directement (revue CIO, 22/10/2026) : la demande attend le CEO.
  async majPermission(
    societeId: string,
    roleId: string,
    moduleCle: string,
    niveau: NiveauPermission,
    acteurRole: string,
    acteurId: string | null = null,
    adminHub = false,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.supprimeLe) throw new NotFoundException('Rôle introuvable');
    const refus = motifRefus(role, societeId, acteurRole, adminHub);
    if (refus) throw new ForbiddenException(refus);

    const module = await this.prisma.module.findUnique({ where: { cle: moduleCle } });
    if (!module) throw new NotFoundException('Module introuvable');

    const actuelle = await this.prisma.rolePermission.findUnique({
      where: { roleId_moduleId: { roleId, moduleId: module.id } },
    });
    if (actuelle?.niveau === niveau) return { roleId, moduleCle, niveau, enAttente: false };

    // L'Administrateur HUB applique directement, sans passer par le CEO.
    if (role.nom === ROLE_CIO && !adminHub) {
      const enCours = await this.prisma.demandeDroit.findFirst({
        where: { societeId, roleId, module: moduleCle, statut: 'en_attente' },
      });
      if (enCours) throw new ConflictException('Une demande sur cette case attend déjà la validation du CEO.');
      await this.prisma.demandeDroit.create({
        data: {
          societeId,
          roleId,
          roleNom: role.nom,
          module: moduleCle,
          avant: actuelle?.niveau ?? null,
          apres: niveau,
          demandeParId: acteurId,
        },
      });
      await this.notifications.envoyer({
        societeId,
        type: 'demande_droit_a_valider',
        titre: `Droits du CIO à valider · ${module.nom} : ${LIBELLE_NIVEAU[actuelle?.niveau ?? 'aucun']} → ${LIBELLE_NIVEAU[niveau]} · demandé par ${await this.nom(acteurId)}`,
        destinataireIds: await this.notifications.titulairesRole(societeId, ROLE_CEO),
        parId: acteurId,
      });
      return { roleId, moduleCle, niveau: actuelle?.niveau ?? 'aucun', enAttente: true };
    }

    await this.appliquer(societeId, role, module, actuelle?.niveau ?? null, niveau, acteurId, null);
    return { roleId, moduleCle, niveau, enAttente: false };
  }

  // Écrit la case, coupe les sessions du rôle, trace, prévient le CEO.
  private async appliquer(
    societeId: string,
    role: { id: string; nom: string },
    module: { id: string; cle: string; nom: string },
    avant: NiveauPermission | null,
    apres: NiveauPermission,
    parId: string | null,
    valideParId: string | null,
  ) {
    const cle = { roleId_moduleId: { roleId: role.id, moduleId: module.id } };
    await this.prisma.$transaction([
      this.prisma.rolePermission.upsert({
        where: cle,
        update: { niveau: apres },
        create: { roleId: role.id, moduleId: module.id, niveau: apres },
      }),
      // Les permissions voyagent dans le jeton (émis à la connexion) : sans
      // cette coupure, chaque titulaire du rôle garderait l'ancien niveau
      // jusqu'à expiration (7 jours). Même mécanisme que le changement de
      // rôle d'un compte (comptes-groupe.service) ; l'auteur de la
      // modification est inclus s'il porte ce rôle, il se reconnecte aussi.
      this.prisma.utilisateur.updateMany({
        where: { roles: { some: { roleId: role.id } } },
        data: { sessionsValidesDepuis: new Date() },
      }),
      // Trace pour le journal d'audit (CEO, CIO).
      this.prisma.journalDroit.create({
        data: { societeId, roleNom: role.nom, module: module.cle, avant, apres, parId, valideParId },
      }),
    ]);
    // Revue CIO : le CEO est prévenu de chaque changement de la matrice
    // (sauf celui qu'il vient lui-même de valider).
    if (!valideParId) {
      await this.notifications.envoyer({
        societeId,
        type: 'droits_modifies',
        titre: `Droits modifiés · ${libelleRole(role.nom)} · ${module.nom} : ${LIBELLE_NIVEAU[avant ?? 'aucun']} → ${LIBELLE_NIVEAU[apres]} · par ${await this.nom(parId)}`,
        destinataireIds: await this.notifications.titulairesRole(societeId, ROLE_CEO),
        parId,
      });
    }
  }

  // Demandes sur le rôle CIO (CEO : à valider ; CIO : les siennes en attente).
  async demandes(societeId: string, acteurRole: string) {
    if (acteurRole !== ROLE_CEO && acteurRole !== ROLE_CIO && acteurRole !== ROLE_COMPANY_ADMIN) {
      throw new ForbiddenException('Réservé au CEO et au CIO.');
    }
    const lignes = await this.prisma.demandeDroit.findMany({
      where: { societeId, statut: 'en_attente' },
      orderBy: { createdAt: 'asc' },
    });
    const modules = new Map(
      (await this.prisma.module.findMany({ select: { cle: true, nom: true } })).map((m) => [m.cle, m.nom]),
    );
    return Promise.all(
      lignes.map(async (d) => ({
        id: d.id,
        role: libelleRole(d.roleNom),
        module: modules.get(d.module) ?? d.module,
        moduleCle: d.module,
        avant: d.avant ?? 'aucun',
        apres: d.apres,
        demandePar: await this.nom(d.demandeParId),
        demandeLe: d.createdAt.toISOString(),
        peutDecider: acteurRole === ROLE_CEO,
      })),
    );
  }

  // Le CEO accepte (la case est appliquée, tracée « validée par ») ou refuse
  // (motif obligatoire). Le demandeur est prévenu.
  async decider(
    societeId: string,
    acteurRole: string,
    acteurId: string,
    id: string,
    accepter: boolean,
    motif?: string,
  ) {
    if (acteurRole !== ROLE_CEO) throw new ForbiddenException('Seul le CEO valide les droits du CIO.');
    const d = await this.prisma.demandeDroit.findFirst({ where: { id, societeId } });
    if (!d) throw new NotFoundException('Demande introuvable.');
    if (d.statut !== 'en_attente') throw new ConflictException('Demande déjà tranchée.');
    const texte = motif?.trim() || null;
    if (!accepter && (!texte || texte.length < 3)) throw new BadRequestException('Le motif du refus est obligatoire.');
    const { count } = await this.prisma.demandeDroit.updateMany({
      where: { id, statut: 'en_attente' },
      data: { statut: accepter ? 'acceptee' : 'refusee', decideParId: acteurId, decideLe: new Date(), motif: texte },
    });
    if (!count) throw new ConflictException('Demande déjà tranchée.');
    const module = await this.prisma.module.findUniqueOrThrow({ where: { cle: d.module } });
    if (accepter) {
      // La case a pu changer depuis la demande : on part de sa valeur réelle.
      const actuelle = await this.prisma.rolePermission.findUnique({
        where: { roleId_moduleId: { roleId: d.roleId, moduleId: module.id } },
      });
      await this.appliquer(
        societeId,
        { id: d.roleId, nom: d.roleNom },
        module,
        actuelle?.niveau ?? null,
        d.apres,
        d.demandeParId,
        acteurId,
      );
    }
    await this.notifications.envoyer({
      societeId,
      type: 'demande_droit_decidee',
      titre: `Droits du CIO · ${module.nom} → ${LIBELLE_NIVEAU[d.apres]} : ${accepter ? 'acceptée par le CEO' : `refusée par le CEO · « ${texte} »`}`,
      destinataireIds: [d.demandeParId],
      parId: acteurId,
    });
    return this.demandes(societeId, acteurRole);
  }

  private async nom(id: string | null): Promise<string> {
    if (!id) return 'le HUB';
    const u = await this.prisma.utilisateur.findUnique({ where: { id }, select: { prenom: true, nom: true } });
    return u ? `${u.prenom} ${u.nom}` : 'un compte supprimé';
  }
}
