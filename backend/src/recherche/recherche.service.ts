import { Injectable } from '@nestjs/common';
import type { NiveauPermission, Prisma } from '@prisma/client';
import { aLaPermission } from '../commun/permission.guard';
import { chercherCollegues } from '../contacts/contacts.service';
import { refDevis } from '../devis/domaine';
import { refFacture } from '../projets/domaine/config';
import { collaborateurDuCompte, perimetreProjets } from '../projets/gabarit/validation';
import { PrismaService } from '../prisma/prisma.service';

export type Acteur = { userId: string; societeId: string; role: string; permissions?: Record<string, NiveauPermission> };
export type TypeResultat = 'dossier' | 'projet' | 'devis' | 'facture' | 'salarie' | 'collegue';
export type Resultat = { type: TypeResultat; id: string; titre: string; detail: string };

// Résultats par type : de quoi reconnaître la fiche, pas une liste complète.
const PAR_TYPE = 5;
export const LONGUEUR_MIN = 2;

const contient = (q: string) => ({ contains: q, mode: 'insensitive' as const });
// « DEV2026-0004 », « F2026-12 », « 4 » : le rang séquentiel en fin de saisie.
const numeroDe = (q: string) => {
  const m = /(\d{1,6})$/.exec(q);
  return m ? Number(m[1]) : null;
};

// Recherche globale (barre du haut, Ctrl+K) : chaque type n'est interrogé que
// si la personne en a la lecture dans la matrice — mêmes règles que les pages
// (périmètre Projets du Salarié compris). Rien n'est indexé : quelques
// requêtes « contient » bornées, suffisantes à l'échelle d'une société.
@Injectable()
export class RechercheService {
  constructor(private prisma: PrismaService) {}

  async chercher(a: Acteur, saisie: string): Promise<Resultat[]> {
    const q = saisie.trim();
    if (q.length < LONGUEUR_MIN) return [];
    const peut = (module: string) => aLaPermission(a.permissions, module, 'lecture');
    const groupes = await Promise.all([
      peut('crm') ? this.dossiers(a.societeId, q) : [],
      peut('projets') ? this.projets(a, q) : [],
      peut('finances_devis') ? this.devis(a.societeId, q) : [],
      peut('finances_factures') ? this.factures(a.societeId, q) : [],
      // Dossiers du personnel avec la RH ; sinon l'annuaire (fiche contact).
      peut('rh') ? this.salaries(q) : this.collegues(a, q),
    ]);
    return groupes.flat();
  }

  private async dossiers(societeId: string, q: string): Promise<Resultat[]> {
    const l = await this.prisma.dossierCrm.findMany({
      where: { societeId, OR: [{ code: contient(q) }, { client: { nom: contient(q) } }, { programme: contient(q) }] },
      select: { id: true, code: true, archiveLe: true, client: { select: { nom: true } } },
      orderBy: { createdAt: 'desc' },
      take: PAR_TYPE,
    });
    return l.map((d) => ({ type: 'dossier', id: d.id, titre: d.code, detail: `${d.client.nom}${d.archiveLe ? ' · archivé' : ''}` }));
  }

  private async projets(a: Acteur, q: string): Promise<Resultat[]> {
    const collaborateurId = await collaborateurDuCompte(this.prisma, a.societeId, a.userId);
    const l = await this.prisma.projet.findMany({
      where: {
        societeId: a.societeId,
        ouvertLe: { not: null },
        // AND : le périmètre du Salarié est lui-même un OR — ne pas l'écraser.
        AND: [perimetreProjets(a.role, collaborateurId), { OR: [{ code: contient(q) }, { client: { nom: contient(q) } }, { programme: contient(q) }] }],
      },
      select: { id: true, code: true, programme: true, client: { select: { nom: true } } },
      orderBy: { ouvertLe: 'desc' },
      take: PAR_TYPE,
    });
    return l.map((p) => ({ type: 'projet', id: p.id, titre: p.code, detail: [p.client.nom, p.programme].filter(Boolean).join(' · ') }));
  }

  private async devis(societeId: string, q: string): Promise<Resultat[]> {
    const numero = numeroDe(q);
    const ou: Prisma.DevisWhereInput[] = [{ codeDossier: contient(q) }, { client: { nom: contient(q) } }, { objet: contient(q) }];
    if (numero !== null) ou.push({ numero });
    const l = await this.prisma.devis.findMany({
      where: { societeId, OR: ou },
      select: { id: true, numero: true, dateEnvoi: true, codeDossier: true, rangDossier: true, objet: true, client: { select: { nom: true } } },
      orderBy: { creeLe: 'desc' },
      take: PAR_TYPE,
    });
    return l.map((d) => ({ type: 'devis', id: d.id, titre: refDevis(d) ?? 'Devis en préparation', detail: [d.client.nom, d.objet].filter(Boolean).join(' · ') }));
  }

  private async factures(societeId: string, q: string): Promise<Resultat[]> {
    const numero = numeroDe(q);
    // Client : celui du projet, ou du dossier pour une facture directe.
    const ou: Prisma.FactureWhereInput[] = [
      { codeDossier: contient(q) },
      { libelle: contient(q) },
      { projet: { client: { nom: contient(q) } } },
      { dossierCrm: { client: { nom: contient(q) } } },
    ];
    if (numero !== null) ou.push({ numero });
    const l = await this.prisma.facture.findMany({
      where: { societeId, OR: ou },
      select: {
        id: true,
        numero: true,
        emiseLe: true,
        estAvoir: true,
        codeDossier: true,
        rangDossier: true,
        libelle: true,
        projet: { select: { client: { select: { nom: true } } } },
        dossierCrm: { select: { client: { select: { nom: true } } } },
      },
      orderBy: { creeLe: 'desc' },
      take: PAR_TYPE,
    });
    return l.map((f) => ({
      type: 'facture',
      id: f.id,
      titre: refFacture(f) ?? 'Facture en préparation',
      detail: [f.projet?.client.nom ?? f.dossierCrm?.client.nom, f.libelle].filter(Boolean).join(' · '),
    }));
  }

  // Collègues : ouvrent leur fiche contact (nom, poste, cellule, téléphone).
  private async collegues(a: Acteur, q: string): Promise<Resultat[]> {
    const l = await chercherCollegues(this.prisma, a, q, PAR_TYPE);
    return l.map((c) => ({
      type: 'collegue',
      id: c.utilisateurId,
      titre: `${c.prenom} ${c.nom}`.trim(),
      detail: [c.poste, c.cellule].filter(Boolean).join(' · '),
    }));
  }

  // Dossiers du personnel : périmètre du module RH = tout le groupe.
  private async salaries(q: string): Promise<Resultat[]> {
    const mots = q.split(/\s+/).filter(Boolean);
    const l = await this.prisma.dossierPersonnel.findMany({
      where: {
        AND: mots.map((m) => ({ OR: [{ prenom: contient(m) }, { nom: contient(m) }, { matricule: contient(m) }, { poste: contient(m) }] })),
      },
      select: { id: true, prenom: true, nom: true, matricule: true, poste: true, archiveLe: true, societe: { select: { nom: true } } },
      orderBy: [{ archiveLe: { sort: 'desc', nulls: 'first' } }, { nom: 'asc' }],
      take: PAR_TYPE,
    });
    return l.map((d) => ({
      type: 'salarie',
      id: d.id,
      titre: `${d.prenom} ${d.nom}`.trim() || d.matricule,
      detail: [d.matricule, d.poste, d.societe.nom, d.archiveLe ? 'parti' : null].filter(Boolean).join(' · '),
    }));
  }
}
