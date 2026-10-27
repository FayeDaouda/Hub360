import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

// Seul rôle qui travaille en cellule (fiche d'équipe, tâches de projet).
const ROLE_SALARIE = 'Salarié';
import { ComptesService } from '../auth/comptes.service';
import { estVerrouille } from '../auth/verrouillage';

// Comptes & rôles du HUB (sept. 2026) — le super admin (le CIO ; ou le
// compte technique holding_admin, cf. AdministrationHubGuard) attribue à
// chaque compte son rôle dans une société et saisit son salaire brut
// mensuel. Règles :
// - UN rôle par personne et par société : la connexion lit une seule
//   affectation (cf. AuthService.login) ; changer de rôle remplace l'ancien.
// - Les rôles d'administration (holding_admin, societe_admin) ne s'attribuent
//   ni ne se retirent ici : c'est le socle qui garde l'accès aux sociétés.
// - Personne ne change son PROPRE rôle : le CIO se retirerait lui-même ses
//   pouvoirs d'administration d'un clic.
// - Un rôle transverse (CEO/CTO/CIO — définition partagée par le groupe) est
//   attribué DANS la société de la ligne, comme les autres.
// - Pas de salaire ici : sa seule source est le dossier RH (revue RH
//   20/10/2026, D19) — la rémunération saisie par le CIO a été retirée.

const ROLES_ADMINISTRATION = new Set(['holding_admin', 'societe_admin']);

type StatutCompte = 'actif' | 'en_attente' | 'desactive';

type UtilisateurLu = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  actif: boolean;
  motDePasseHash: string | null;
  totpActifLe?: Date | null;
  verrouilleJusquau?: Date | null;
};

const SELECT_UTILISATEUR = {
  id: true,
  prenom: true,
  nom: true,
  email: true,
  actif: true,
  motDePasseHash: true,
  totpActifLe: true,
  verrouilleJusquau: true,
} as const;

// Invité pas encore activé = pas de mot de passe ; désactivé = en avait un.
function statut(u: UtilisateurLu): StatutCompte {
  if (u.actif) return 'actif';
  return u.motDePasseHash ? 'desactive' : 'en_attente';
}

function versCompte(u: UtilisateurLu, role: { id: string; nom: string }) {
  return {
    id: u.id,
    prenom: u.prenom,
    nom: u.nom,
    email: u.email,
    statut: statut(u),
    role: { id: role.id, nom: role.nom },
    administration: ROLES_ADMINISTRATION.has(role.nom),
    doubleFacteur: !!u.totpActifLe,
    // Verrouillage en cours (lot C) : fin, pour le bouton « Débloquer ».
    verrouilleJusquau:
      u.verrouilleJusquau && estVerrouille(u.verrouilleJusquau) ? u.verrouilleJusquau.toISOString() : null,
  };
}

@Injectable()
export class ComptesGroupeService {
  constructor(
    private prisma: PrismaService,
    private comptes: ComptesService,
    private notifications: NotificationsService,
  ) {}

  async lister() {
    const [societes, roles, affectations, dossiers, cellules] = await Promise.all([
      this.prisma.societe.findMany({
        where: { actif: true, accesOuvert: true },
        select: { id: true, nom: true, slug: true },
        orderBy: { nom: 'asc' },
      }),
      this.prisma.role.findMany({
        where: { supprimeLe: null, nom: { notIn: [...ROLES_ADMINISTRATION] } },
        select: { id: true, nom: true, societeId: true },
        orderBy: { nom: 'asc' },
      }),
      this.prisma.utilisateurSocieteRole.findMany({
        where: { societeId: { not: null } },
        select: {
          societeId: true,
          role: { select: { id: true, nom: true } },
          utilisateur: { select: SELECT_UTILISATEUR },
        },
      }),
      // Dossiers RH sans compte : ni compte direct, ni compte via la fiche
      // d'équipe — candidats à « Créer le compte ».
      this.prisma.dossierPersonnel.findMany({
        where: {
          archiveLe: null,
          utilisateurId: null,
          OR: [{ collaborateurId: null }, { collaborateur: { utilisateurId: null } }],
        },
        select: { id: true, societeId: true, prenom: true, nom: true, poste: true, emailPro: true, matricule: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      this.prisma.cellule.findMany({ select: { id: true, nom: true, societeId: true }, orderBy: { nom: 'asc' } }),
    ]);

    return {
      societes: societes.map((societe) => {
        // Une ligne par personne : si des affectations multiples subsistent
        // (données antérieures), le rôle d'administration l'emporte — c'est
        // lui qui décide de l'accès.
        const parPersonne = new Map<string, (typeof affectations)[number]>();
        for (const a of affectations) {
          if (a.societeId !== societe.id) continue;
          const deja = parPersonne.get(a.utilisateur.id);
          if (!deja || ROLES_ADMINISTRATION.has(a.role.nom)) parPersonne.set(a.utilisateur.id, a);
        }
        const comptes = [...parPersonne.values()]
          .map((a) => versCompte(a.utilisateur, a.role))
          .sort((x, y) => `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`, 'fr'));

        return {
          ...societe,
          rolesAttribuables: roles
            .filter((r) => r.societeId === null || r.societeId === societe.id)
            .map((r) => ({ id: r.id, nom: r.nom, transverse: r.societeId === null })),
          comptes,
          dossiersSansCompte: dossiers.filter((d) => d.societeId === societe.id).map(({ societeId: _s, ...d }) => d),
          cellules: cellules.filter((c) => c.societeId === societe.id).map(({ id, nom }) => ({ id, nom })),
        };
      }),
    };
  }

  async changerRole(utilisateurId: string, societeId: string, roleId: string, acteurId: string) {
    if (utilisateurId === acteurId) {
      throw new ConflictException('Vous ne pouvez pas modifier votre propre rôle.');
    }
    const [role, societe, affectations] = await Promise.all([
      this.prisma.role.findFirst({ where: { id: roleId, supprimeLe: null } }),
      this.prisma.societe.findUnique({ where: { id: societeId }, select: { id: true, nom: true } }),
      this.prisma.utilisateurSocieteRole.findMany({
        where: { utilisateurId, societeId },
        include: { role: { select: { id: true, nom: true } } },
      }),
    ]);
    if (!role) throw new NotFoundException('Rôle introuvable.');
    if (!societe) throw new NotFoundException('Société introuvable.');
    if (ROLES_ADMINISTRATION.has(role.nom)) {
      throw new BadRequestException("Les rôles d'administration ne s'attribuent pas depuis cet écran.");
    }
    if (role.societeId !== null && role.societeId !== societeId) {
      throw new BadRequestException('Ce rôle appartient à une autre société.');
    }
    if (affectations.length === 0) {
      throw new NotFoundException("Ce compte n'est pas rattaché à cette société.");
    }
    if (affectations.some((a) => ROLES_ADMINISTRATION.has(a.role.nom))) {
      throw new ConflictException("Compte d'administration : son rôle ne se modifie pas depuis cet écran.");
    }

    const inchange = affectations.length === 1 && affectations[0].roleId === roleId;
    if (!inchange) {
      const ancien = affectations.map((a) => a.role.nom).join(', ');
      await this.prisma.$transaction([
        this.prisma.utilisateurSocieteRole.deleteMany({ where: { utilisateurId, societeId } }),
        this.prisma.utilisateurSocieteRole.create({ data: { utilisateurId, societeId, roleId } }),
        // Les permissions voyagent dans le jeton (émis à la connexion) : sans
        // cette coupure, l'ancien rôle resterait actif jusqu'à expiration.
        // Précision milliseconde VOULUE (même choix que la désactivation) : le
        // jeton date son émission à la seconde, donc tout jeton émis dans la
        // seconde de la modification est refusé — y compris un jeton de
        // l'ancien rôle émis juste avant. Tronquer à la seconde laissait
        // passer ce dernier (vérifié en recette) ; le prix est une reconnexion
        // de plus dans ce cas rarissime.
        this.prisma.utilisateur.update({
          where: { id: utilisateurId },
          data: { sessionsValidesDepuis: new Date() },
        }),
        this.prisma.evenementCompte.create({
          data: {
            utilisateurId,
            type: 'role_modifie',
            parId: acteurId,
            detail: `${ancien} → ${role.nom} (${societe.nom})`,
          },
        }),
      ]);
    }

    const utilisateur = await this.prisma.utilisateur.findUniqueOrThrow({
      where: { id: utilisateurId },
      select: SELECT_UTILISATEUR,
    });
    return versCompte(utilisateur, role);
  }

  // Parcours unique de création (phase 1, 14/10/2026) : dossier RH → compte →
  // rôle. Le dossier RH est la seule fiche de la personne. Revue Dir. GC
  // (21/10/2026) : le CIO ne choisit plus de cellule — un compte Salarié reçoit
  // sa fiche d'équipe SANS cellule (« Salariés à affecter ») et le Dir. GC,
  // qui organise les cellules, est prévenu ; les comptes de direction n'ont
  // pas de fiche d'équipe.
  async creerCompte(dto: { dossierId: string; email: string; roleId: string }, acteurId: string) {
    const email = dto.email.trim().toLowerCase();
    const dossier = await this.prisma.dossierPersonnel.findUnique({
      where: { id: dto.dossierId },
      include: { collaborateur: { select: { id: true, utilisateurId: true } } },
    });
    if (!dossier || dossier.archiveLe) throw new NotFoundException('Dossier RH introuvable ou archivé.');
    if (dossier.utilisateurId || dossier.collaborateur?.utilisateurId) {
      throw new ConflictException('Ce dossier a déjà un compte.');
    }
    if (!dossier.prenom.trim() || !dossier.nom.trim()) {
      throw new BadRequestException('Renseignez le prénom et le nom dans le dossier RH.');
    }
    const [role, existant] = await Promise.all([
      this.prisma.role.findFirst({ where: { id: dto.roleId, supprimeLe: null } }),
      this.prisma.utilisateur.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (!role || ROLES_ADMINISTRATION.has(role.nom)) throw new BadRequestException('Rôle invalide.');
    if (role.societeId !== null && role.societeId !== dossier.societeId) {
      throw new BadRequestException('Ce rôle appartient à une autre société.');
    }
    if (existant) throw new ConflictException('Cette adresse e-mail est déjà utilisée par un compte.');

    const utilisateur = await this.prisma.$transaction(async (tx) => {
      const u = await tx.utilisateur.create({
        data: { email, prenom: dossier.prenom.trim(), nom: dossier.nom.trim(), motDePasseHash: null, actif: false },
        select: SELECT_UTILISATEUR,
      });
      await tx.utilisateurSocieteRole.create({
        data: { utilisateurId: u.id, societeId: dossier.societeId, roleId: role.id },
      });
      if (dossier.collaborateur) {
        await tx.collaborateur.update({ where: { id: dossier.collaborateur.id }, data: { utilisateurId: u.id } });
      } else if (role.nom === ROLE_SALARIE) {
        const fiche = await tx.collaborateur.create({
          data: {
            societeId: dossier.societeId,
            prenom: u.prenom,
            nom: u.nom,
            role: dossier.poste.trim() || role.nom,
            dateArrivee: dossier.dateEntree,
            utilisateurId: u.id,
          },
        });
        await tx.dossierPersonnel.update({ where: { id: dossier.id }, data: { collaborateurId: fiche.id } });
      } else {
        await tx.dossierPersonnel.update({ where: { id: dossier.id }, data: { utilisateurId: u.id } });
      }
      return u;
    });

    const invitation = await this.comptes.envoyerInvitation(utilisateur.id, email, utilisateur.prenom, acteurId);
    // Nouvel arrivant à affecter : le Dir. GC choisit sa cellule (Équipes).
    if (role.nom === ROLE_SALARIE && !dossier.collaborateur) {
      await this.notifications.envoyer({
        societeId: dossier.societeId,
        type: 'arrivant_a_affecter',
        titre: `Nouvel arrivant à affecter · ${utilisateur.prenom} ${utilisateur.nom}${dossier.poste.trim() ? ` · ${dossier.poste.trim()}` : ''}`,
        destinataireIds: await this.notifications.titulairesRole(dossier.societeId, 'Dir. GC'),
        parId: acteurId,
      });
    }
    return { compte: versCompte(utilisateur, role), ...invitation };
  }

  async renvoyerInvitation(utilisateurId: string, acteurId: string) {
    const u = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId }, select: SELECT_UTILISATEUR });
    if (!u) throw new NotFoundException('Compte introuvable.');
    if (statut(u) !== 'en_attente') throw new ConflictException('Ce compte est déjà activé.');
    return this.comptes.envoyerInvitation(u.id, u.email, u.prenom, acteurId);
  }

  // Désactiver coupe aussi les sessions vivantes ; même journal que
  // l'archivage RH et l'ancienne page Équipe.
  async changerActif(utilisateurId: string, actif: boolean, acteurId: string) {
    if (utilisateurId === acteurId) throw new ConflictException('Vous ne pouvez pas désactiver votre propre compte.');
    const u = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { ...SELECT_UTILISATEUR, roles: { select: { role: { select: { nom: true } } } } },
    });
    if (!u) throw new NotFoundException('Compte introuvable.');
    if (u.roles.some((r) => ROLES_ADMINISTRATION.has(r.role.nom))) {
      throw new ConflictException("Compte d'administration : il ne se désactive pas depuis cet écran.");
    }
    if (!u.motDePasseHash) throw new ConflictException("Invitation en attente : le compte n'est pas encore activé.");
    if (u.actif === actif) return { id: u.id, statut: statut(u) };
    const maintenant = new Date();
    const [maj] = await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id: utilisateurId },
        data: actif
          ? { actif: true, desactiveLe: null, desactiveParId: null }
          : { actif: false, desactiveLe: maintenant, desactiveParId: acteurId, sessionsValidesDepuis: maintenant },
        select: SELECT_UTILISATEUR,
      }),
      this.prisma.evenementCompte.create({
        data: {
          utilisateurId,
          type: actif ? 'compte_reactive' : 'compte_desactive',
          parId: acteurId,
          detail: 'Administration du HUB',
        },
      }),
    ]);
    return { id: maj.id, statut: statut(maj) };
  }

  // Téléphone perdu ou changé : la double authentification est retirée et
  // les sessions coupées ; la personne la réactive à sa prochaine connexion.
  async reinitialiserDoubleFacteur(utilisateurId: string, acteurId: string) {
    const u = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { totpSecret: true, totpActifLe: true, email: true, prenom: true },
    });
    if (!u) throw new NotFoundException('Compte introuvable.');
    if (!u.totpActifLe && !u.totpSecret)
      throw new ConflictException('Double authentification non activée sur ce compte.');
    const maintenant = new Date();
    await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id: utilisateurId },
        data: {
          totpSecret: null,
          totpActifLe: null,
          totpDernierPas: null,
          totpCodesSecours: [],
          sessionsValidesDepuis: maintenant,
        },
      }),
      this.prisma.evenementCompte.create({
        data: { utilisateurId, type: 'double_facteur_reinitialise', parId: acteurId, detail: 'Administration du HUB' },
      }),
    ]);
    this.comptes.avertirSecurite(u, 'double_facteur_reinitialise');
    return { id: utilisateurId, doubleFacteur: false };
  }

  // Déblocage par l'administration du HUB avant la fin du verrouillage
  // (lot C) : essais et récidives remis à zéro, trace au journal.
  async debloquer(utilisateurId: string, acteurId: string) {
    const u = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { verrouilleJusquau: true },
    });
    if (!u) throw new NotFoundException('Compte introuvable.');
    if (!estVerrouille(u.verrouilleJusquau)) throw new ConflictException('Ce compte n’est pas verrouillé.');
    await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id: utilisateurId },
        data: { verrouilleJusquau: null, echecsConnexion: 0, verrouillages: 0 },
      }),
      this.prisma.evenementCompte.create({
        data: { utilisateurId, type: 'compte_debloque', parId: acteurId, detail: 'Administration du HUB' },
      }),
    ]);
    return { id: utilisateurId, verrouilleJusquau: null };
  }
}
