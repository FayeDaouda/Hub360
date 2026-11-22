import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { cheminPhoto } from '../auth/profil';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_COMPANY_ADMIN, ROLE_HOLDING_ADMIN } from '@hub/domain';

export type FicheContact = {
  utilisateurId: string;
  prenom: string;
  nom: string;
  poste: string | null;
  cellule: string | null;
  chef: string | null; // chef d’équipe de sa cellule (null s'il l'est lui-même, ou sans cellule)
  estChef: boolean;
  telephone: string | null; // téléphone professionnel (annuaire)
  email: string;
  // Nom choisi par la personne et photo : la fiche est la même partout.
  nomAffiche: string | null;
  photoUrl: string | null;
};

// Membres de la société : même règle que l'annuaire du chat et le login
// (rôle de la société ou transverse, hors holding_admin). Comptes actifs ou
// invitation en attente ; un compte désactivé (départ) n'apparaît plus —
// y compris une invitation jamais activée puis coupée par un départ
// (audit annuaire, 22/11/2026 : le mot de passe reste vide dans ce cas).
export const membreDe = (societeId: string): Prisma.UtilisateurWhereInput => ({
  roles: {
    some: { OR: [{ societeId }, { societeId: null }], role: { nom: { not: ROLE_HOLDING_ADMIN }, supprimeLe: null } },
  },
  OR: [{ actif: true }, { motDePasseHash: null, desactiveLe: null }],
});

// Le téléphone professionnel seulement (décision du 22/11/2026) : le
// téléphone personnel du dossier ne sort jamais vers les collègues.
const DOSSIER = { select: { poste: true, telephonePro: true, emailPro: true } } as const;

export const selectContact = (societeId: string) =>
  ({
    id: true,
    prenom: true,
    nom: true,
    email: true,
    // Annuaire (22/11/2026) : le nom choisi par la personne et sa photo.
    nomAffiche: true,
    photoCle: true,
    roles: {
      where: { OR: [{ societeId }, { societeId: null }] },
      select: { role: { select: { nom: true } } },
      take: 1,
    },
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

export type LigneContact = Prisma.UtilisateurGetPayload<{ select: ReturnType<typeof selectContact> }>;

export function versFiche(u: LigneContact): FicheContact {
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
    poste: dossier?.poste.trim() || collab?.role.trim() || (role === ROLE_COMPANY_ADMIN ? 'Administration' : role),
    cellule: collab?.cellule?.nom ?? null,
    chef: chef && !estChef ? `${chef.prenom} ${chef.nom}`.trim() : null,
    estChef,
    telephone: dossier?.telephonePro.trim() || null,
    nomAffiche: u.nomAffiche,
    photoUrl: cheminPhoto(u.photoCle),
    email: dossier?.emailPro.trim() || u.email,
  };
}

// Fiche contact d'un collègue (revue Salarié 19/10/2026) : l'annuaire de la
// société — nom, poste, cellule, chef d’équipe, téléphone (décision du user :
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
