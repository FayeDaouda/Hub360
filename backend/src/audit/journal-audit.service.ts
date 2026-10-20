import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { ActionPaie, EvenementCompteType, NiveauPermission } from '@prisma/client';
import { refFacture } from '../projets/domaine/config';
import { ventilationTva } from '../projets/domaine/gardes';
import { PrismaService } from '../prisma/prisma.service';

type Acteur = { userId: string; societeId: string; role: string };
export type CategorieAudit = 'comptes' | 'droits' | 'finances' | 'reglages' | 'rh' | 'paie';
export type LigneAudit = { id: string; le: Date; categorie: CategorieAudit; action: string; detail: string; par: string | null };

// Qui lit le journal : CEO et CIO (phase 4), et l'administration de la société.
export const ROLES_JOURNAL = new Set(['CEO (transverse)', 'CIO (transverse)', 'societe_admin']);
// Période par défaut et plafond : le journal se lit par tranches.
const JOURS_PAR_DEFAUT = 30;
const JOURS_MAX = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ACTIONS_COMPTE: Record<EvenementCompteType, string> = {
  invitation_envoyee: 'Invitation envoyée',
  compte_active: 'Compte activé',
  mdp_reinitialise: 'Mot de passe changé',
  compte_desactive: 'Compte désactivé',
  compte_reactive: 'Compte réactivé',
  role_modifie: 'Rôle modifié',
  salaire_modifie: 'Salaire modifié',
  double_facteur_active: 'Double authentification activée',
  double_facteur_reinitialise: 'Double authentification réinitialisée',
};
// Journal de la paie (revue RH 20/10/2026) : jamais de montant.
const ACTIONS_PAIE: Record<ActionPaie, string> = {
  salaire_consulte: 'Salaire consulté',
  salaire_modifie: 'Salaire modifié',
  bulletin_consulte: 'Bulletin consulté',
  bulletin_depose: 'Bulletin déposé',
  bulletin_retire: 'Bulletin retiré',
};
const NIVEAUX: Record<NiveauPermission, string> = { aucun: 'aucun', lecture: 'lecture', ecriture: 'écriture', validation: 'validation' };
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
const nomDe = (u: { prenom: string; nom: string } | null | undefined) => (u ? `${u.prenom} ${u.nom}`.trim() : null);

// Journal d'audit : ce que le HUB enregistre déjà, réuni en une seule liste
// datée (comptes, droits, finances, réglages, départs). Lecture seule —
// aucune de ces traces ne se modifie ni ne se supprime.
@Injectable()
export class JournalAuditService {
  constructor(private prisma: PrismaService) {}

  async journal(a: Acteur, debut?: string, fin?: string) {
    if (!ROLES_JOURNAL.has(a.role)) throw new ForbiddenException('Journal réservé au CEO et au CIO.');
    const { de, a: jusque } = periode(debut, fin);
    const dans = { gte: de, lt: jusque };
    const S = a.societeId;

    const [comptes, droits, emises, paiements, supprimes, reglages, departs, paie] = await Promise.all([
      // Comptes de la société (ou transverses), où qu'ait eu lieu l'action.
      this.prisma.evenementCompte.findMany({
        where: { createdAt: dans, utilisateur: { roles: { some: { OR: [{ societeId: S }, { societeId: null }] } } } },
        select: { id: true, type: true, detail: true, parId: true, createdAt: true, utilisateur: { select: { prenom: true, nom: true } } },
      }),
      this.prisma.journalDroit.findMany({ where: { societeId: S, createdAt: dans } }),
      this.prisma.facture.findMany({
        where: { societeId: S, emiseLe: dans },
        select: { id: true, numero: true, emiseLe: true, estAvoir: true, montantHt: true, tauxTva: true, emiseParId: true, libelle: true },
      }),
      this.prisma.paiement.findMany({
        where: { creeLe: dans, facture: { societeId: S } },
        select: { id: true, montant: true, date: true, creeLe: true, creeParId: true, facture: { select: { numero: true, emiseLe: true, estAvoir: true } } },
      }),
      this.prisma.paiementSupprime.findMany({ where: { societeId: S, supprimeLe: dans } }),
      this.prisma.journalReglage.findMany({ where: { societeId: S, createdAt: dans } }),
      this.prisma.dossierPersonnel.findMany({
        where: { societeId: S, archiveLe: dans },
        select: { id: true, prenom: true, nom: true, poste: true, archiveLe: true, archiveParId: true },
      }),
      this.prisma.journalPaie.findMany({
        where: { createdAt: dans, dossier: { societeId: S } },
        select: { id: true, action: true, mois: true, parId: true, createdAt: true, dossier: { select: { prenom: true, nom: true, matricule: true } } },
      }),
    ]);

    // Facture d'un paiement supprimé : sa référence, si elle existe encore.
    const facturesSupprimes = new Map(
      (
        await this.prisma.facture.findMany({
          where: { id: { in: [...new Set(supprimes.map((p) => p.factureId))] } },
          select: { id: true, numero: true, emiseLe: true, estAvoir: true },
        })
      ).map((f) => [f.id, refFacture(f)]),
    );

    const lignes: (Omit<LigneAudit, 'par'> & { parId: string | null })[] = [
      ...comptes.map((e) => ({
        id: `compte:${e.id}`,
        le: e.createdAt,
        categorie: 'comptes' as const,
        action: ACTIONS_COMPTE[e.type],
        detail: [nomDe(e.utilisateur), e.detail].filter(Boolean).join(' · '),
        parId: e.parId,
      })),
      ...droits.map((d) => ({
        id: `droit:${d.id}`,
        le: d.createdAt,
        categorie: 'droits' as const,
        action: 'Droits modifiés',
        detail: `${d.roleNom} · ${d.module} : ${d.avant ? NIVEAUX[d.avant] : 'aucun'} → ${NIVEAUX[d.apres]}`,
        parId: d.parId,
      })),
      ...emises.map((f) => ({
        id: `facture:${f.id}`,
        le: f.emiseLe!,
        categorie: 'finances' as const,
        action: f.estAvoir ? 'Avoir émis' : 'Facture émise',
        detail: `${refFacture(f) ?? 'sans numéro'} · ${fcfa(ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc)} TTC · ${f.libelle}`,
        parId: f.emiseParId,
      })),
      ...paiements.map((p) => ({
        id: `paiement:${p.id}`,
        le: p.creeLe,
        categorie: 'finances' as const,
        action: 'Paiement enregistré',
        detail: `${fcfa(p.montant.toNumber())} · ${refFacture(p.facture) ?? 'facture sans numéro'} · versé le ${p.date.split('-').reverse().join('/')}`,
        parId: p.creeParId,
      })),
      ...supprimes.map((p) => ({
        id: `paiement-supprime:${p.id}`,
        le: p.supprimeLe,
        categorie: 'finances' as const,
        action: 'Paiement supprimé',
        detail: [fcfa(p.montant.toNumber()), facturesSupprimes.get(p.factureId) ?? 'facture', p.motif ? `motif : ${p.motif}` : null].filter(Boolean).join(' · '),
        parId: p.supprimeParId,
      })),
      ...reglages.map((r) => ({
        id: `reglage:${r.id}`,
        le: r.createdAt,
        categorie: 'reglages' as const,
        action: 'Réglage modifié',
        detail: `${r.libelle} · motif : ${r.motif}`,
        parId: r.parId,
      })),
      ...departs.map((d) => ({
        id: `depart:${d.id}`,
        le: d.archiveLe!,
        categorie: 'rh' as const,
        action: 'Départ enregistré',
        detail: [`${d.prenom} ${d.nom}`.trim(), d.poste].filter(Boolean).join(' · '),
        parId: d.archiveParId,
      })),
      ...paie.map((p) => ({
        id: `paie:${p.id}`,
        le: p.createdAt,
        categorie: 'paie' as const,
        action: ACTIONS_PAIE[p.action],
        detail: [`${p.dossier.prenom} ${p.dossier.nom}`.trim(), p.dossier.matricule, p.mois && `bulletin ${p.mois.split('-').reverse().join('/')}`].filter(Boolean).join(' · '),
        parId: p.parId,
      })),
    ];

    const auteurs = new Map(
      (
        await this.prisma.utilisateur.findMany({
          where: { id: { in: [...new Set(lignes.map((l) => l.parId).filter((x): x is string => !!x))] } },
          select: { id: true, prenom: true, nom: true },
        })
      ).map((u) => [u.id, nomDe(u)]),
    );
    return {
      debut: de.toISOString().slice(0, 10),
      fin: new Date(jusque.getTime() - 86_400_000).toISOString().slice(0, 10),
      lignes: lignes
        .map(({ parId, ...l }): LigneAudit => ({ ...l, par: parId ? (auteurs.get(parId) ?? 'compte supprimé') : null }))
        .sort((x, y) => y.le.getTime() - x.le.getTime()),
    };
  }
}

// [début 00:00, lendemain de fin 00:00[ ; 30 derniers jours par défaut.
export function periode(debut?: string, fin?: string, maintenant = new Date()) {
  if ((debut && !DATE.test(debut)) || (fin && !DATE.test(fin))) throw new BadRequestException('Dates attendues au format AAAA-MM-JJ.');
  const finJour = fin ?? maintenant.toISOString().slice(0, 10);
  const a = new Date(`${finJour}T00:00:00Z`);
  a.setUTCDate(a.getUTCDate() + 1);
  const de = debut ? new Date(`${debut}T00:00:00Z`) : new Date(a.getTime() - JOURS_PAR_DEFAUT * 86_400_000);
  if (de >= a) throw new BadRequestException('La date de début doit précéder la date de fin.');
  if ((a.getTime() - de.getTime()) / 86_400_000 > JOURS_MAX) throw new BadRequestException('Un an au plus par consultation.');
  return { de, a };
}
