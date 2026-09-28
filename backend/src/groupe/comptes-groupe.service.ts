import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
// - Le salaire vit dans sa propre table (Remuneration), jamais recopié dans
//   le journal d'audit.

const ROLES_ADMINISTRATION = new Set(['holding_admin', 'societe_admin']);

type StatutCompte = 'actif' | 'en_attente' | 'desactive';

type UtilisateurLu = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  actif: boolean;
  motDePasseHash: string | null;
  remuneration: { salaireBrutMensuel: number } | null;
};

const SELECT_UTILISATEUR = {
  id: true,
  prenom: true,
  nom: true,
  email: true,
  actif: true,
  motDePasseHash: true,
  remuneration: { select: { salaireBrutMensuel: true } },
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
    salaireBrutMensuel: u.remuneration?.salaireBrutMensuel ?? null,
  };
}

@Injectable()
export class ComptesGroupeService {
  constructor(private prisma: PrismaService) {}

  async lister() {
    const [societes, roles, affectations] = await Promise.all([
      this.prisma.societe.findMany({
        where: { actif: true },
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
      throw new BadRequestException(
        "Les rôles d'administration ne s'attribuent pas depuis cet écran.",
      );
    }
    if (role.societeId !== null && role.societeId !== societeId) {
      throw new BadRequestException('Ce rôle appartient à une autre société.');
    }
    if (affectations.length === 0) {
      throw new NotFoundException("Ce compte n'est pas rattaché à cette société.");
    }
    if (affectations.some((a) => ROLES_ADMINISTRATION.has(a.role.nom))) {
      throw new ConflictException(
        "Compte d'administration : son rôle ne se modifie pas depuis cet écran.",
      );
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

  async definirSalaire(utilisateurId: string, salaireBrutMensuel: number | null, acteurId: string) {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { id: true, remuneration: { select: { salaireBrutMensuel: true } } },
    });
    if (!utilisateur) throw new NotFoundException('Compte introuvable.');

    const actuel = utilisateur.remuneration?.salaireBrutMensuel ?? null;
    if (actuel === salaireBrutMensuel) return { salaireBrutMensuel };

    await this.prisma.$transaction([
      salaireBrutMensuel === null
        ? this.prisma.remuneration.deleteMany({ where: { utilisateurId } })
        : this.prisma.remuneration.upsert({
            where: { utilisateurId },
            create: { utilisateurId, salaireBrutMensuel, majParId: acteurId },
            update: { salaireBrutMensuel, majParId: acteurId },
          }),
      this.prisma.evenementCompte.create({
        data: {
          utilisateurId,
          type: 'salaire_modifie',
          parId: acteurId,
          detail: salaireBrutMensuel === null ? 'Salaire retiré' : 'Salaire brut mensuel mis à jour',
        },
      }),
    ]);
    return { salaireBrutMensuel };
  }
}
