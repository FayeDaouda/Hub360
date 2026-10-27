import { Injectable } from '@nestjs/common';
import type { NiveauPermission } from '@prisma/client';
import { aLaPermission } from '../commun/permission.guard';
import { montantHtLignes } from '../devis/domaine';
import { PrismaService } from '../prisma/prisma.service';
import { aTraiterCommercial, performanceCommerciale, totauxPipeline, type DossierCommercial } from './commercial';
import { CommissionsService } from './commissions.service';
import { toIsoDay } from '@hub/domain';

type Acteur = { societeId: string; role: string; permissions?: Record<string, NiveauPermission> };

// Montants du pipeline (revue COO, lot D) : totaux HT, jamais le détail des
// offres — module « crm_totaux » de la matrice, ou déjà les offres (finances_devis).
export const voitMontantsPipeline = (a: Acteur) =>
  a.role === 'societe_admin' ||
  aLaPermission(a.permissions, 'crm_totaux', 'lecture') ||
  aLaPermission(a.permissions, 'finances_devis', 'lecture');

// Vue commerciale (revue COO, 22/10/2026) : « À traiter aujourd'hui » du CRM,
// performance de l'année par apporteur et, avec le droit, totaux HT par étape.
@Injectable()
export class CommercialService {
  constructor(
    private prisma: PrismaService,
    private commissions: CommissionsService,
  ) {}

  async vue(a: Acteur, annee: string) {
    const maintenant = new Date();
    const jour = toIsoDay(maintenant);
    const montants = voitMontantsPipeline(a);
    // Commissions à jour des derniers encaissements avant de les additionner.
    if (montants) await this.commissions.synchroniser(a.societeId);
    const [enCours, delAnnee] = await Promise.all([
      this.dossiers(
        a.societeId,
        { archiveLe: null, statut: { in: ['nouveau_projet', 'en_validation', 'offre_envoyee'] } },
        false,
      ),
      this.dossiers(
        a.societeId,
        {
          createdAt: {
            gte: new Date(`${annee}-01-01T00:00:00Z`),
            lt: new Date(`${Number(annee) + 1}-01-01T00:00:00Z`),
          },
        },
        montants,
      ),
    ]);
    return {
      aTraiter: aTraiterCommercial(enCours, jour, maintenant.getTime()),
      performance: { annee, montants, ...performanceCommerciale(delAnnee) },
      // null = pas le droit de voir les montants.
      pipelineHt: montants ? totauxPipeline(delAnnee, jour) : null,
    };
  }

  private async dossiers(societeId: string, where: object, montants: boolean): Promise<DossierCommercial[]> {
    const lignes = await this.prisma.dossierCrm.findMany({
      where: { societeId, ...where },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        code: true,
        categorie: true,
        localiteId: true,
        type: true,
        surfaceTerrain: true,
        nbPlanches: true,
        clientId: true,
        standing: true,
        gamme: true,
        programme: true,
        statut: true,
        createdAt: true,
        archiveLe: true,
        proprietaireId: true,
        apporteurType: true,
        apporteurNom: true,
        apporteurStructure: true,
        apporteurTelephone: true,
        apporteurEmail: true,
        apporteurUtilisateur: { select: { id: true, prenom: true, nom: true } },
        commissionApporteur: true,
        client: { select: { nom: true } },
        offres: {
          orderBy: { creeLe: 'desc' },
          select: {
            statut: true,
            dateEnvoi: true,
            dateValidite: true,
            lignes: { select: { quantite: true, prixUnitaire: true } },
          },
        },
        transitions: { where: { vers: 'onboard' }, orderBy: { creeLe: 'desc' }, take: 1, select: { creeLe: true } },
        commissions: { select: { statut: true, montant: true } },
      },
    });
    return lignes.map((d) => {
      // Signé : l'offre acceptée fait foi ; sinon l'offre en cours.
      const offreMontant =
        (d.statut === 'onboard' ? d.offres.find((o) => o.statut === 'accepte') : undefined) ?? d.offres[0];
      return {
        id: d.id,
        code: d.code,
        categorie: d.categorie,
        localiteId: d.localiteId,
        type: d.type,
        surfaceTerrain: d.surfaceTerrain,
        nbPlanches: d.nbPlanches,
        clientId: d.clientId,
        standing: d.standing,
        gamme: d.gamme,
        programme: d.programme,
        client: d.client.nom,
        statut: d.statut,
        creeLe: d.createdAt,
        archive: !!d.archiveLe,
        proprietaireId: d.proprietaireId,
        apporteur:
          d.apporteurType === 'interne'
            ? {
                type: 'interne',
                id: d.apporteurUtilisateur?.id ?? null,
                nom: d.apporteurUtilisateur
                  ? `${d.apporteurUtilisateur.prenom} ${d.apporteurUtilisateur.nom}`
                  : 'Apporteur interne',
              }
            : d.apporteurType === 'externe'
              ? {
                  type: 'externe',
                  nom: d.apporteurNom ?? 'Apporteur',
                  structure: d.apporteurStructure,
                  telephone: d.apporteurTelephone,
                  email: d.apporteurEmail,
                }
              : null,
        commission: d.commissionApporteur === null ? null : Number(d.commissionApporteur),
        offre: d.offres[0]
          ? {
              statut: d.offres[0].statut,
              envoyeeLe: d.offres[0].dateEnvoi ? toIsoDay(d.offres[0].dateEnvoi) : null,
              valideJusquau: d.offres[0].dateValidite,
            }
          : null,
        signeLe: d.transitions[0] ? toIsoDay(d.transitions[0].creeLe) : null,
        montantHt: montants && offreMontant ? montantHtLignes(offreMontant.lignes) : null,
        commissions: {
          versees: montants
            ? d.commissions.filter((c) => c.statut === 'payee').reduce((s, c) => s + c.montant.toNumber(), 0)
            : 0,
          aPayer: montants
            ? d.commissions.filter((c) => c.statut === 'a_payer').reduce((s, c) => s + c.montant.toNumber(), 0)
            : 0,
        },
      };
    });
  }
}
