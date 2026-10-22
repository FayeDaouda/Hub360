import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { aTraiterCommercial, performanceCommerciale, type DossierCommercial } from './commercial';

const jourIso = (d: Date) => d.toISOString().slice(0, 10);

// Vue commerciale (revue COO, 22/10/2026) : « À traiter aujourd'hui » du CRM
// et performance de l'année par apporteur. Aucun montant d'offre ici : les
// totaux HT viennent avec le droit correspondant (lot D).
@Injectable()
export class CommercialService {
  constructor(private prisma: PrismaService) {}

  async vue(societeId: string, annee: string) {
    const maintenant = new Date();
    const jour = jourIso(maintenant);
    const [enCours, delAnnee] = await Promise.all([
      this.dossiers(societeId, { archiveLe: null, statut: { in: ['nouveau_projet', 'en_validation', 'offre_envoyee'] } }),
      this.dossiers(societeId, { createdAt: { gte: new Date(`${annee}-01-01T00:00:00Z`), lt: new Date(`${Number(annee) + 1}-01-01T00:00:00Z`) } }),
    ]);
    return {
      aTraiter: aTraiterCommercial(enCours, jour, maintenant.getTime()),
      performance: { annee, ...performanceCommerciale(delAnnee) },
    };
  }

  private async dossiers(societeId: string, where: object): Promise<DossierCommercial[]> {
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
        offres: { orderBy: { creeLe: 'desc' }, take: 1, select: { statut: true, dateEnvoi: true, dateValidite: true } },
        transitions: { where: { vers: 'onboard' }, orderBy: { creeLe: 'desc' }, take: 1, select: { creeLe: true } },
      },
    });
    return lignes.map((d) => ({
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
          ? { type: 'interne', id: d.apporteurUtilisateur?.id ?? null, nom: d.apporteurUtilisateur ? `${d.apporteurUtilisateur.prenom} ${d.apporteurUtilisateur.nom}` : 'Apporteur interne' }
          : d.apporteurType === 'externe'
            ? { type: 'externe', nom: d.apporteurNom ?? 'Apporteur', structure: d.apporteurStructure, telephone: d.apporteurTelephone, email: d.apporteurEmail }
            : null,
      commission: d.commissionApporteur === null ? null : Number(d.commissionApporteur),
      offre: d.offres[0]
        ? { statut: d.offres[0].statut, envoyeeLe: d.offres[0].dateEnvoi ? jourIso(d.offres[0].dateEnvoi) : null, valideJusquau: d.offres[0].dateValidite }
        : null,
      signeLe: d.transitions[0] ? jourIso(d.transitions[0].creeLe) : null,
    }));
  }
}
