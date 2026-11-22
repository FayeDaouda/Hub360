import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ETAPE, hasRight, ROLES_DIRECTION_GROUPE, todayIso } from '@hub/domain';
import { membreDe, selectContact, versFiche, type LigneContact } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { runInGroupScope } from '../tenancy/tenant-context';
import {
  PERIMETRES_ANNUAIRE,
  type AnnuaireDto,
  type MembreAnnuaireDto,
  type PerimetreAnnuaire,
  type SocieteAnnuaireDto,
} from './annuaire.dto';

export const CLE_PERIMETRE = 'annuaire_perimetre';
const LIBELLES: Record<PerimetreAnnuaire, string> = {
  societe: 'la société seulement',
  societe_direction: 'la société et la direction du groupe',
  groupe: 'tout le groupe',
};

// Une valeur inconnue (ou absente) vaut « la société seulement ».
const lirePerimetre = (v: unknown): PerimetreAnnuaire =>
  typeof v === 'string' && (PERIMETRES_ANNUAIRE as readonly string[]).includes(v)
    ? (v as PerimetreAnnuaire)
    : 'societe';

export type ActeurAnnuaire = { userId: string; societeId: string; permissions?: Record<string, string> };
type Societe = SocieteAnnuaireDto & { id: string };

// Annuaire du HUB (22/11/2026) : les collègues, avec les seuls champs
// d'annuaire (nom, poste, cellule, chef d'équipe, téléphone et e-mail pro
// saisis par la RH, nom affiché et photo choisis par la personne) et leur
// absence du jour, sans motif. Le périmètre est réglé par société (CIO,
// Administrateur HUB) : les autres sociétés ne sont lues qu'en lecture
// transverse déclarée (ADR 0001), et seulement si le réglage l'ouvre.
@Injectable()
export class AnnuaireService {
  constructor(private prisma: PrismaService) {}

  async perimetre(societeId: string): Promise<PerimetreAnnuaire> {
    const l = await this.prisma.reglageSociete.findUnique({
      where: { societeId_cle: { societeId, cle: CLE_PERIMETRE } },
    });
    return lirePerimetre(l?.valeur);
  }

  // Le périmètre change : la valeur, et une intervention au journal d'audit
  // (qui, quand, de quoi à quoi, pourquoi), dans la même transaction.
  async regler(societeId: string, perimetre: PerimetreAnnuaire, motif: string, parId: string) {
    // Valeur d'avant relue dans la transaction (sérialisable) : deux réglages
    // simultanés ne laissent jamais une trace « de X à Y » fausse.
    await this.prisma.$transaction(
      async (tx) => {
        const l = await tx.reglageSociete.findUnique({ where: { societeId_cle: { societeId, cle: CLE_PERIMETRE } } });
        const avant = lirePerimetre(l?.valeur);
        if (avant === perimetre) return;
        await tx.reglageSociete.upsert({
          where: { societeId_cle: { societeId, cle: CLE_PERIMETRE } },
          create: { societeId, cle: CLE_PERIMETRE, valeur: perimetre, majParId: parId },
          update: { valeur: perimetre, majParId: parId },
        });
        await tx.interventionHub.create({
          data: {
            societeId,
            parId,
            type: 'annuaire_perimetre',
            cible: CLE_PERIMETRE,
            detail: `Annuaire : ${LIBELLES[avant]} → ${LIBELLES[perimetre]}`,
            motif,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { perimetre };
  }

  async lister(a: ActeurAnnuaire): Promise<AnnuaireDto> {
    const perimetre = await this.perimetre(a.societeId);
    const ici = await this.prisma.societe.findUniqueOrThrow({
      where: { id: a.societeId },
      select: { id: true, slug: true, nom: true },
    });
    // Les autres sociétés ouvertes du groupe, si le réglage les fait entrer.
    const autres: Societe[] =
      perimetre === 'societe'
        ? []
        : await runInGroupScope(() =>
            this.prisma.societe.findMany({
              where: { id: { not: a.societeId }, actif: true, accesOuvert: true },
              select: { id: true, slug: true, nom: true },
              orderBy: { nom: 'asc' },
            }),
          );

    // Les sociétés lues en parallèle (la sienne, puis les autres).
    const roles = perimetre === 'groupe' ? null : ROLES_DIRECTION_GROUPE;
    const [siens, ailleurs] = await Promise.all([
      this.membres(ici.id, null),
      Promise.all(autres.map((s) => runInGroupScope(() => this.membres(s.id, roles)))),
    ]);
    const lignes: { u: LigneContact; societe: Societe }[] = [
      ...siens.map((u) => ({ u, societe: ici })),
      ...autres.flatMap((s, i) => ailleurs[i].map((u) => ({ u, societe: s }))),
    ];
    // Une personne de plusieurs sociétés (rôle transverse) n'apparaît qu'une
    // fois : dans la société de la session d'abord.
    const vus = new Set<string>();
    const uniques = lignes.filter(({ u }) => !vus.has(u.id) && vus.add(u.id));

    const absences = await this.absences(
      uniques.map(({ u }) => u.id),
      perimetre !== 'societe',
    );
    const membres: MembreAnnuaireDto[] = uniques.map(({ u, societe }) => ({
      ...versFiche(u),
      societe: { slug: societe.slug, nom: societe.nom },
      memeSociete: societe.id === a.societeId,
      absentJusquau: absences.get(u.id) ?? null,
    }));
    membres.sort((x, y) => `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`, 'fr'));

    return {
      perimetre,
      // Seulement les sociétés qui ont quelqu'un dans l'annuaire (« direction » :
      // une société sans dirigeant n'apparaît pas dans le filtre).
      societes: [ici, ...autres.filter((s) => membres.some((m) => m.societe.slug === s.slug))].map(({ slug, nom }) => ({
        slug,
        nom,
      })),
      membres,
      peutVoirAgendas: hasRight(a.permissions, ETAPE.agendaAutres, 'lecture'),
    };
  }

  // Membres d'une société (même règle que le login et la fiche contact) ;
  // `roles` : seulement les titulaires de ces rôles dans cette société.
  private membres(societeId: string, roles: readonly string[] | null) {
    const where: Prisma.UtilisateurWhereInput = roles
      ? {
          AND: [
            membreDe(societeId),
            {
              roles: {
                some: {
                  OR: [{ societeId }, { societeId: null }],
                  role: { nom: { in: [...roles] }, supprimeLe: null },
                },
              },
            },
          ],
        }
      : membreDe(societeId);
    return this.prisma.utilisateur.findMany({
      where,
      select: selectContact(societeId),
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
  }

  // Absences validées par la RH qui couvrent aujourd'hui : la date de fin
  // seulement (jamais le motif). Dossiers de toutes les sociétés de
  // l'annuaire : lecture transverse déclarée (la RH est commune, ADR 0001 §5).
  // `groupe` : d'autres sociétés sont dans l'annuaire, lecture transverse
  // déclarée. (Les absences n'ont pas de société propre : la lecture est de
  // toute façon bornée aux comptes de l'annuaire.)
  private async absences(ids: string[], groupe: boolean): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const jour = todayIso();
    const lire = () =>
      this.prisma.demandeAbsence.findMany({
        where: {
          statut: 'validee',
          dateDebut: { lte: jour },
          dateFin: { gte: jour },
          dossier: {
            archiveLe: null,
            OR: [{ utilisateurId: { in: ids } }, { collaborateur: { utilisateurId: { in: ids } } }],
          },
        },
        select: {
          dateFin: true,
          dossier: { select: { utilisateurId: true, collaborateur: { select: { utilisateurId: true } } } },
        },
      });
    const lignes = groupe ? await runInGroupScope(lire) : await lire();
    const parId = new Map<string, string>();
    for (const l of lignes) {
      const id = l.dossier.utilisateurId ?? l.dossier.collaborateur?.utilisateurId;
      // La plus longue si plusieurs se chevauchent.
      if (id && (!parId.has(id) || l.dateFin > parId.get(id)!)) parId.set(id, l.dateFin);
    }
    return parId;
  }
}
