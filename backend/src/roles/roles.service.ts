import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  decodeRights,
  describeRightsChange,
  encodeRights,
  normalizeRights,
  RIGHTS,
  ROLE_CEO,
  ROLE_CIO,
  ROLE_COMPANY_ADMIN,
  ROLE_HOLDING_ADMIN,
  ROLE_HUB_ADMIN,
  type Right,
  type RightSet,
} from '@hub/domain';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RightsService } from '../rights/rights.service';

const libelleRole = (nom: string) => nom.replace(/\s*\(transverse\)$/, '');

// Rôles hors matrice : les comptes d'administration (secours) et l'ancien
// rôle socle « collaborateur » gardent leurs droits fixés au socle ;
// l'Administrateur HUB et le CIO ont carte blanche (31/10/2026). Aucune de
// ces lignes ne se règle depuis la matrice.
const HORS_MATRICE = new Set([ROLE_HOLDING_ADMIN, ROLE_COMPANY_ADMIN, ROLE_HUB_ADMIN, 'collaborateur']);

export type Libelles = Partial<Record<Right, string>>;

// Phrases d'une étape ; un droit sans phrase est « sans objet ».
const libellesDe = (json: unknown): Libelles => {
  const l = (json ?? {}) as Record<string, unknown>;
  return Object.fromEntries(RIGHTS.filter((r) => typeof l[r] === 'string').map((r) => [r, l[r] as string]));
};
const applicables = (l: Libelles): RightSet =>
  Object.fromEntries(RIGHTS.map((r) => [r, l[r] !== undefined])) as RightSet;

// Matrice des droits (décision du 31/10/2026) : visible et modifiable par le
// CIO et l'Administrateur HUB seuls (garde du contrôleur). Une case change :
// elle s'applique dès la requête suivante (RightsService vidé), chaque
// titulaire du rôle reçoit l'avis « Vos droits ont changé », le CEO en garde
// la trace (journal d'audit et notification).
@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private rights: RightsService,
  ) {}

  // Rôles de la société (les siens + les transverses) × étapes des modules.
  async matrice(societeId: string) {
    const [roles, modules] = await Promise.all([
      this.prisma.role.findMany({
        where: { OR: [{ societeId }, { societeId: null }], supprimeLe: null },
        orderBy: { nom: 'asc' },
        include: { droits: { include: { etape: { select: { cle: true } } } } },
      }),
      this.prisma.module.findMany({
        orderBy: { nom: 'asc' },
        include: { etapes: { orderBy: [{ ordre: 'asc' }, { nom: 'asc' }] } },
      }),
    ]);

    return {
      modules: modules
        .filter((m) => m.etapes.length)
        .map((m) => ({
          cle: m.cle,
          nom: m.nom,
          etapes: m.etapes.map((e) => ({ cle: e.cle, nom: e.nom, libelles: libellesDe(e.libelles) })),
        })),
      roles: roles
        .filter((r) => !HORS_MATRICE.has(r.nom))
        .map((r) => ({
          id: r.id,
          nom: libelleRole(r.nom),
          transverse: r.societeId === null,
          carteBlanche: r.nom === ROLE_CIO,
          droits: Object.fromEntries(
            r.droits.map(({ etape, lecture, ecriture, validation, suppression }) => [
              etape.cle,
              { lecture, ecriture, validation, suppression },
            ]),
          ) as Record<string, RightSet>,
        })),
    };
  }

  // « Enregistrer » de l'écran : toutes les cases changées, vérifiées d'abord
  // (une seule refusée = rien n'est écrit), puis écrites ensemble. Règle de
  // cohérence appliquée : agir donne la lecture, un droit sans objet n'est
  // jamais donné. Chaque titulaire reçoit UN avis qui résume ses changements.
  async enregistrer(
    societeId: string,
    changements: { roleId: string; etapeCle: string; droits: RightSet }[],
    parId: string,
  ) {
    const retenus: {
      role: { id: string; nom: string };
      etapeId: string;
      ou: string;
      avant: RightSet;
      apres: RightSet;
      texte: string;
    }[] = [];
    for (const c of changements) {
      const role = await this.prisma.role.findUnique({ where: { id: c.roleId } });
      if (!role || role.supprimeLe) throw new NotFoundException('Rôle introuvable');
      if (role.societeId !== null && role.societeId !== societeId) {
        throw new ForbiddenException("Ce rôle n'appartient pas à cette société.");
      }
      if (HORS_MATRICE.has(role.nom) || role.nom === ROLE_CIO) {
        throw new ForbiddenException(
          role.nom === ROLE_CIO
            ? 'Le CIO a carte blanche : ses droits ne se règlent pas dans la matrice.'
            : 'Les comptes d’administration ne se règlent pas dans la matrice.',
        );
      }
      const etape = await this.prisma.moduleStep.findUnique({ where: { cle: c.etapeCle }, include: { module: true } });
      if (!etape) throw new NotFoundException('Étape introuvable');
      const actuelle = await this.prisma.roleRight.findUnique({
        where: { roleId_etapeId: { roleId: role.id, etapeId: etape.id } },
      });
      const avant: RightSet = actuelle
        ? {
            lecture: actuelle.lecture,
            ecriture: actuelle.ecriture,
            validation: actuelle.validation,
            suppression: actuelle.suppression,
          }
        : decodeRights('');
      const apres = normalizeRights(c.droits, applicables(libellesDe(etape.libelles)));
      const texte = describeRightsChange(avant, apres);
      if (!texte) continue;
      const ou = etape.cle === etape.module.cle ? etape.module.nom : `${etape.module.nom} › ${etape.nom}`;
      retenus.push({ role, etapeId: etape.id, ou, avant, apres, texte });
    }
    if (!retenus.length) return this.matrice(societeId);

    await this.prisma.$transaction(
      retenus.flatMap((r) => [
        this.prisma.roleRight.upsert({
          where: { roleId_etapeId: { roleId: r.role.id, etapeId: r.etapeId } },
          update: r.apres,
          create: { roleId: r.role.id, etapeId: r.etapeId, ...r.apres },
        }),
        // Trace pour le journal d'audit (CEO, CIO).
        this.prisma.journalDroit.create({
          data: {
            societeId,
            roleNom: r.role.nom,
            module: r.ou,
            droitsAvant: encodeRights(r.avant),
            droitsApres: encodeRights(r.apres),
            parId,
          },
        }),
      ]),
    );
    // Vaut dès la requête suivante : plus de reconnexion forcée.
    this.rights.invalidate();

    const parRole = new Map<string, { nom: string; lignes: string[] }>();
    for (const r of retenus) {
      const g = parRole.get(r.role.id) ?? { nom: r.role.nom, lignes: [] };
      g.lignes.push(`${r.ou} : ${r.texte}`);
      parRole.set(r.role.id, g);
    }
    await this.avertirTitulaires(parRole, societeId, parId);
    const auteur = await this.nom(parId);
    const ceo = await this.notifications.titulairesRole(societeId, ROLE_CEO);
    for (const { nom, lignes } of parRole.values()) {
      await this.notifications.envoyer({
        societeId,
        type: 'droits_modifies',
        titre: `Droits modifiés · ${libelleRole(nom)} · ${lignes.join(' ; ')} · par ${auteur}`,
        destinataireIds: ceo,
        parId,
      });
    }
    return this.matrice(societeId);
  }

  // Chaque titulaire actif d'un rôle changé, dans toutes ses sociétés (un
  // rôle transverse vaut partout) : un avis en haut de page jusqu'à « J'ai
  // compris », et une ligne dans la cloche de la société où il porte le rôle.
  private async avertirTitulaires(parRole: Map<string, { lignes: string[] }>, societeId: string, parId: string) {
    const affectations = await this.prisma.utilisateurSocieteRole.findMany({
      where: { roleId: { in: [...parRole.keys()] }, utilisateur: { actif: true } },
      select: { utilisateurId: true, societeId: true, roleId: true },
    });
    const parPersonne = new Map<string, { societes: Set<string>; lignes: Set<string> }>();
    for (const a of affectations) {
      const p = parPersonne.get(a.utilisateurId) ?? { societes: new Set(), lignes: new Set() };
      p.societes.add(a.societeId ?? societeId);
      for (const l of parRole.get(a.roleId)?.lignes ?? []) p.lignes.add(l);
      parPersonne.set(a.utilisateurId, p);
    }
    if (!parPersonne.size) return;
    const message = (lignes: Set<string>) => `Vos droits ont changé · ${[...lignes].join(' ; ')}`;
    await this.prisma.rightsNotice.createMany({
      data: [...parPersonne].map(([utilisateurId, p]) => ({ utilisateurId, message: message(p.lignes) })),
    });
    for (const [utilisateurId, p] of parPersonne) {
      for (const s of p.societes) {
        await this.notifications.envoyer({
          societeId: s,
          type: 'own_rights_changed',
          titre: message(p.lignes),
          destinataireIds: [utilisateurId],
          parId,
        });
      }
    }
  }

  private async nom(id: string | null): Promise<string> {
    if (!id) return 'le HUB';
    const u = await this.prisma.utilisateur.findUnique({ where: { id }, select: { prenom: true, nom: true } });
    return u ? `${u.prenom} ${u.nom}` : 'un compte supprimé';
  }
}
