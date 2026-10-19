import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FicheContact = {
  utilisateurId: string;
  prenom: string;
  nom: string;
  poste: string | null;
  cellule: string | null;
  chef: string | null; // chef de team de sa cellule (null s'il l'est lui-même, ou sans cellule)
  estChef: boolean;
  telephone: string | null;
  email: string;
};

// Membres de la société : même règle que l'annuaire du chat et le login
// (rôle de la société ou transverse, hors holding_admin). Comptes actifs ou
// invitation en attente ; un compte désactivé (départ) n'apparaît plus.
const membreDe = (societeId: string): Prisma.UtilisateurWhereInput => ({
  roles: { some: { OR: [{ societeId }, { societeId: null }], role: { nom: { not: 'holding_admin' }, supprimeLe: null } } },
  OR: [{ actif: true }, { motDePasseHash: null }],
});

const DOSSIER = { select: { poste: true, telephone: true, emailPro: true } } as const;

const selectContact = (societeId: string) =>
  ({
    id: true,
    prenom: true,
    nom: true,
    email: true,
    roles: { where: { OR: [{ societeId }, { societeId: null }] }, select: { role: { select: { nom: true } } }, take: 1 },
    dossierPersonnel: DOSSIER,
    collaborations: {
      where: { societeId },
      select: {
        id: true,
        role: true,
        dossierPersonnel: DOSSIER,
        cellule: { select: { nom: true, dispatcher: { select: { id: true, prenom: true, nom: true } } } },
      },
      take: 1,
    },
  }) satisfies Prisma.UtilisateurSelect;

type LigneContact = Prisma.UtilisateurGetPayload<{ select: ReturnType<typeof selectContact> }>;

function versFiche(u: LigneContact): FicheContact {
  const collab = u.collaborations[0];
  // Dossier RH relié au compte directement, ou via la fiche d'équipe.
  const dossier = u.dossierPersonnel ?? collab?.dossierPersonnel ?? null;
  const role = u.roles[0]?.role.nom ?? null;
  const chef = collab?.cellule?.dispatcher ?? null;
  const estChef = !!chef && chef.id === collab?.id;
  return {
    utilisateurId: u.id,
    prenom: u.prenom,
    nom: u.nom,
    poste: dossier?.poste.trim() || collab?.role.trim() || (role === 'societe_admin' ? 'Administration' : role),
    cellule: collab?.cellule?.nom ?? null,
    chef: chef && !estChef ? `${chef.prenom} ${chef.nom}`.trim() : null,
    estChef,
    telephone: dossier?.telephone.trim() || null,
    email: dossier?.emailPro.trim() || u.email,
  };
}

// Fiche contact d'un collègue (revue Salarié 19/10/2026) : l'annuaire de la
// société — nom, poste, cellule, chef de team, téléphone (décision du user :
// visible de tous les collègues) et e-mail. Rien d'autre du dossier RH.
@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async fiche(societeId: string, utilisateurId: string): Promise<FicheContact> {
    const u = await this.prisma.utilisateur.findFirst({
      where: { id: utilisateurId, ...membreDe(societeId) },
      select: selectContact(societeId),
    });
    if (!u) throw new NotFoundException('Contact introuvable.');
    return versFiche(u);
  }
}

// Recherche globale (Ctrl+K) : les collègues dont le prénom ou le nom
// contient chaque mot saisi, hors la personne connectée.
export async function chercherCollegues(
  prisma: PrismaService,
  a: { societeId: string; userId: string },
  q: string,
  limite: number,
): Promise<FicheContact[]> {
  const mots = q.split(/\s+/).filter(Boolean);
  const contient = (m: string) => ({ contains: m, mode: 'insensitive' as const });
  const l = await prisma.utilisateur.findMany({
    where: {
      id: { not: a.userId },
      AND: [membreDe(a.societeId), ...mots.map((m) => ({ OR: [{ prenom: contient(m) }, { nom: contient(m) }] }))],
    },
    select: selectContact(a.societeId),
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    take: limite,
  });
  return l.map(versFiche);
}
