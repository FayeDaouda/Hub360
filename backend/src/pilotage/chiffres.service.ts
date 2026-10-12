import { Injectable } from '@nestjs/common';
import type { NiveauPermission } from '@prisma/client';
import { aLaPermission } from '../commun/permission.guard';
import { champsManquants } from '../crm/fiche';
import { DELAI_RELANCE_FICHE_MS } from '../crm/notifications-crm';
import { statutDevisEffectif } from '../devis/domaine';
import { PrismaService } from '../prisma/prisma.service';
import { ventilationTva } from '../projets/domaine/gardes';
import { IntegrationService } from '../rh/integration.service';
import { bornesMois, moisDe } from '../rh/regles-temps';

// Tuiles du Pilotage (décision du 12/10/2026, option A) : des chiffres clés
// au lieu des compteurs déjà présents plus bas. La rangée suit la matrice :
//  · Finances et Projets (CEO, CFO, CTO, CIO, Dir. GC) : facturé du mois,
//    encaissé du mois, reste à encaisser en retard, projets ouverts ;
//  · CRM sans Finances (COO) : pipeline actif, fiches à compléter (72 h),
//    en attente CFO (48 h), offres chez le client ;
//  · RH : absences à valider, remboursements à traiter, feuilles de temps à
//    contrôler, points d'intégration à faire.
// Couleur = sens : risque (délai dépassé, hors objectif), attention (à
// traiter dans les délais), succes (rien en retard), marque (chiffre sans
// objectif). Libellés, icônes et liens : côté écran (components/pilotage).

export type EtatTuile = 'risque' | 'attention' | 'succes' | 'marque';
export type JeuTuiles = 'finances' | 'crm' | 'rh';
export type TuileChiffre = { cle: string; valeur: number; aide: string; etat: EtatTuile };

type Acteur = { societeId: string; role: string; permissions?: Record<string, NiveauPermission> };

// Délai de validation d'une offre par le CFO (tuile CRM de la maquette :
// « offres soumises · délai 48 h »).
export const DELAI_VALIDATION_CFO_MS = 48 * 3600 * 1000;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const aTraiter = (n: number): EtatTuile => (n > 0 ? 'attention' : 'succes');
const enRetard = (n: number): EtatTuile => (n > 0 ? 'risque' : 'succes');
// Rouge si un délai est dépassé, ambre s'il reste à traiter dans les délais.
const selonDelai = (total: number, depasses: number): EtatTuile => (depasses > 0 ? 'risque' : aTraiter(total));

@Injectable()
export class ChiffresPilotageService {
  constructor(
    private prisma: PrismaService,
    private integration: IntegrationService,
  ) {}

  async tuiles(a: Acteur, jour: string, feuilles: { total: number; controlees: number }): Promise<{ jeu: JeuTuiles; tuiles: TuileChiffre[] } | null> {
    const voit = (module: string) => a.role === 'societe_admin' || aLaPermission(a.permissions, module, 'lecture');
    if (voit('finances_factures') && voit('projets')) return { jeu: 'finances', tuiles: await this.finances(a.societeId, jour) };
    if (voit('crm')) return { jeu: 'crm', tuiles: await this.crm(a.societeId, jour) };
    if (voit('rh')) return { jeu: 'rh', tuiles: await this.rh(jour, feuilles) };
    return null;
  }

  private async finances(societeId: string, jour: string): Promise<TuileChiffre[]> {
    const { debut, fin } = bornesMois(moisDe(jour));
    const [emises, paiements, echues, projets] = await Promise.all([
      // Émises dans le mois, avoirs compris (montant négatif) : net facturé.
      this.prisma.facture.findMany({
        where: { societeId, statut: { not: 'brouillon' }, emiseLe: { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59.999Z`) } },
        select: { montantHt: true, tauxTva: true, estAvoir: true },
      }),
      this.prisma.paiement.findMany({ where: { facture: { societeId }, date: { gte: debut, lte: fin } }, select: { montant: true } }),
      this.prisma.facture.findMany({
        where: { societeId, statut: 'emise', estAvoir: false, echeanceLe: { lt: jour } },
        select: { montantHt: true, tauxTva: true, paiements: { select: { montant: true } } },
      }),
      this.prisma.projet.count({ where: { societeId, ouvertLe: { not: null } } }),
    ]);
    const ttc = (f: { montantHt: { toNumber(): number }; tauxTva: { toNumber(): number } }) =>
      ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc;
    const facture = emises.reduce((s, f) => s + ttc(f), 0);
    const nbEmises = emises.filter((f) => !f.estAvoir).length;
    const encaisse = paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
    const restes = echues.map((f) => ttc(f) - f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0)).filter((r) => r > 0);
    const reste = restes.reduce((s, r) => s + r, 0);
    return [
      { cle: 'facture_mois', valeur: facture, aide: nbEmises ? `${pluriel(nbEmises, 'facture')} émise${nbEmises > 1 ? 's' : ''} ce mois` : 'aucune facture émise ce mois', etat: 'marque' },
      { cle: 'encaisse_mois', valeur: encaisse, aide: paiements.length ? `${pluriel(paiements.length, 'paiement')} ce mois` : 'aucun paiement ce mois', etat: 'marque' },
      { cle: 'reste_retard', valeur: reste, aide: restes.length ? `${pluriel(restes.length, 'facture')} échue${restes.length > 1 ? 's' : ''} non soldée${restes.length > 1 ? 's' : ''}` : 'aucune facture échue', etat: enRetard(restes.length) },
      { cle: 'projets_ouverts', valeur: projets, aide: 'ouverts à l’émission de F1', etat: 'marque' },
    ];
  }

  // Mêmes règles que les tuiles du CRM (pipeline de l'année en cours).
  private async crm(societeId: string, jour: string): Promise<TuileChiffre[]> {
    const annee = jour.slice(0, 4);
    const maintenant = Date.now();
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: { societeId, archiveLe: null, createdAt: { gte: new Date(`${annee}-01-01T00:00:00Z`), lt: new Date(`${Number(annee) + 1}-01-01T00:00:00Z`) } },
      select: {
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
        offres: { orderBy: { creeLe: 'desc' }, take: 1, select: { statut: true, dateValidite: true } },
        transitions: { where: { vers: 'en_validation' }, orderBy: { creeLe: 'desc' }, take: 1, select: { creeLe: true } },
      },
    });
    const expiree = (d: (typeof dossiers)[number]) =>
      d.statut === 'offre_envoyee' && !!d.offres[0] && statutDevisEffectif(d.offres[0], jour) === 'expire';
    const actifs = dossiers.filter((d) => d.statut !== 'perdu' && !expiree(d));
    const fiches = dossiers.filter((d) => d.statut === 'nouveau_projet' && champsManquants(d).length > 0);
    const fichesEchues = fiches.filter((d) => maintenant - d.createdAt.getTime() > DELAI_RELANCE_FICHE_MS);
    const cfo = dossiers.filter((d) => d.statut === 'en_validation');
    const cfoEchues = cfo.filter((d) => d.transitions[0] && maintenant - d.transitions[0].creeLe.getTime() > DELAI_VALIDATION_CFO_MS);
    const client = dossiers.filter((d) => d.statut === 'offre_envoyee' && !expiree(d));
    return [
      { cle: 'pipeline', valeur: actifs.length, aide: 'projets hors Perdu et Expirée', etat: 'marque' },
      { cle: 'fiches', valeur: fiches.length, aide: fichesEchues.length ? `dont ${fichesEchues.length} au-delà de 72 h` : 'fiche incomplète · délai 72 h', etat: selonDelai(fiches.length, fichesEchues.length) },
      { cle: 'cfo', valeur: cfo.length, aide: cfoEchues.length ? `dont ${cfoEchues.length} au-delà de 48 h` : 'offres soumises · délai 48 h', etat: selonDelai(cfo.length, cfoEchues.length) },
      { cle: 'client', valeur: client.length, aide: 'offres envoyées · validité 7 jours', etat: 'marque' },
    ];
  }

  // Périmètre de la page RH · Groupe (demandes et intégration du groupe) ;
  // feuilles : celles de l'indicateur du Pilotage (mois clos de la société).
  private async rh(jour: string, feuilles: { total: number; controlees: number }): Promise<TuileChiffre[]> {
    const [absences, remboursements, integrations] = await Promise.all([
      this.prisma.demandeAbsence.count({ where: { statut: 'accord_n1' } }),
      this.prisma.demandeRemboursement.count({ where: { statut: { in: ['soumise', 'transmise'] } } }),
      this.integration.liste(),
    ]);
    const aControler = feuilles.total - feuilles.controlees;
    const points = integrations.reduce((s, i) => s + i.aTraiter, 0);
    return [
      { cle: 'absences', valeur: absences, aide: 'accord du N+1, validation RH', etat: aTraiter(absences) },
      { cle: 'remboursements', valeur: remboursements, aide: 'soumis ou transmis à l’assurance', etat: aTraiter(remboursements) },
      { cle: 'feuilles', valeur: aControler, aide: `mois clos · ${feuilles.controlees} / ${feuilles.total} contrôlées`, etat: enRetard(aControler) },
      { cle: 'integration', valeur: points, aide: points ? `point${points > 1 ? 's' : ''} J+30 / 60 / 90 échu${points > 1 ? 's' : ''}` : `${pluriel(integrations.length, 'nouvel arrivant')} suivi${integrations.length > 1 ? 's' : ''}`, etat: enRetard(points) },
    ];
  }
}
