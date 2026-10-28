import { Injectable } from '@nestjs/common';
import type { JalonFacture, NiveauPermission } from '@prisma/client';
import { aLaPermission } from '../commun/permission.guard';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { PrismaService } from '../prisma/prisma.service';
import { refFacture } from '../projets/domaine/config';
import { joursRetardFacture, ventilationTva } from '../projets/domaine/gardes';
import { ProjectAlertsService } from '../projects/project-alerts.service';
import { DemandesService } from '../rh/demandes.service';
import { ROLE_CEO, ROLE_COMPANY_ADMIN, todayIso } from '@hub/domain';

export type ActeurAttention = {
  userId: string;
  societeId: string;
  role: string;
  permissions?: Record<string, NiveauPermission>;
};

const TRANCHE_PAR_JALON: Partial<Record<JalonFacture, 'F1' | 'F2' | 'F3'>> = {
  signature: 'F1',
  avant_projet: 'F2',
  livraison: 'F3',
};

// « À votre attention » (accueil du CEO, Pilotage) : ce qui attend une
// décision ou une relance, rassemblé depuis les modules — projets en retard
// (dont retards qualifiés), factures F1 à F3 prêtes à émettre ou impayées
// après échéance, avenants TS non acceptés, absences dont on est le N+1.
// Chaque rubrique suit la matrice de l'acteur (null = rubrique hors de ses
// droits) ; décisions et reportings viennent de la vue Pilotage elle-même.
@Injectable()
export class AttentionService {
  constructor(
    private prisma: PrismaService,
    private projectAlerts: ProjectAlertsService,
    private seuilCeo: SeuilCeoService,
    private demandes: DemandesService,
  ) {}

  async attention(a: ActeurAttention) {
    const voit = (module: string, niveau: NiveauPermission = 'lecture') =>
      a.role === ROLE_COMPANY_ADMIN || aLaPermission(a.permissions, module, niveau);
    const [projets, factures, ts] = [voit('projets'), voit('finances_factures'), voit('finances_devis')];
    const jour = todayIso();
    const [alertes, impayees, absences] = await Promise.all([
      projets || factures || ts ? this.projectAlerts.alerts(a.societeId) : null,
      factures ? this.impayees(a.societeId, jour) : [],
      this.demandes.aValider(a),
    ]);
    return {
      retards: projets ? alertes!.retards : null,
      factures: factures
        ? [...(await this.tranchesAEmettre(a, alertes!.tranches, voit('finances_factures', 'validation'))), ...impayees]
        : null,
      ts: ts ? alertes!.ts : null,
      absences: absences.map((d) => ({
        id: d.id,
        salarie: `${d.salarie.prenom} ${d.salarie.nom}`,
        type: d.type,
        dateDebut: d.dateDebut,
        dateFin: d.dateFin,
        jours: d.jours,
      })),
    };
  }

  // Tranches prêtes (conditions du gabarit remplies) et pas encore émises ;
  // « par vous » quand l'acteur peut les valider — le CEO seulement au-delà
  // du seuil de contresignature (finances/seuil-ceo.service.ts).
  private async tranchesAEmettre(
    a: ActeurAttention,
    tranches: Awaited<ReturnType<ProjectAlertsService['alerts']>>['tranches'],
    validation: boolean,
  ) {
    const ids = tranches.map((t) => t.factureId).filter((x): x is string => !!x);
    const [brouillons, seuil] = await Promise.all([
      ids.length
        ? this.prisma.facture.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              montantHt: true,
              tauxTva: true,
              devisEcheancierId: true,
              devisOrigineId: true,
              dossierCrmId: true,
              projetId: true,
            },
          })
        : [],
      a.role === ROLE_CEO ? this.seuilCeo.seuil(a.societeId) : null,
    ]);
    const affaires = await this.seuilCeo.montantsAffaire(brouillons);
    const ttc = new Map(
      brouillons.map((f) => [f.id, ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc]),
    );
    return tranches.map((t) => ({
      etat: 'a_emettre' as const,
      factureId: t.factureId,
      projetId: t.projetId,
      code: t.code,
      client: t.client,
      tranche: t.tranche,
      reference: null,
      montantTtc: t.factureId ? (ttc.get(t.factureId) ?? null) : null,
      joursRetard: 0,
      parVous: validation && !!t.factureId && (seuil === null || (affaires.get(t.factureId) ?? 0) > seuil),
    }));
  }

  // Factures émises, échéance passée, pas soldées.
  private async impayees(societeId: string, jour: string) {
    const emises = await this.prisma.facture.findMany({
      where: { societeId, statut: 'emise', estAvoir: false, echeanceLe: { lt: jour } },
      select: {
        id: true,
        jalon: true,
        libelle: true,
        numero: true,
        reference: true,
        codeDossier: true,
        rangDossier: true,
        emiseLe: true,
        estAvoir: true,
        echeanceLe: true,
        montantHt: true,
        tauxTva: true,
        paiements: { select: { montant: true } },
        projet: { select: { id: true, code: true, client: { select: { nom: true } } } },
        dossierCrm: { select: { code: true, client: { select: { nom: true } } } },
      },
      orderBy: { echeanceLe: 'asc' },
    });
    return emises.flatMap((f) => {
      const ttc = ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc;
      const reste = ttc - f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      if (reste <= 0) return [];
      return [
        {
          etat: 'impayee' as const,
          factureId: f.id,
          projetId: f.projet?.id ?? null,
          code: f.projet?.code ?? f.dossierCrm?.code ?? '—',
          client: f.projet?.client.nom ?? f.dossierCrm?.client.nom ?? '—',
          tranche: f.jalon ? (TRANCHE_PAR_JALON[f.jalon] ?? null) : null,
          reference: refFacture(f),
          montantTtc: reste,
          joursRetard: joursRetardFacture(f.echeanceLe, jour),
          parVous: false,
        },
      ];
    });
  }
}
