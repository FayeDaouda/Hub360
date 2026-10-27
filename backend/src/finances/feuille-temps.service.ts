import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { refFacture, type PartsFactures } from '../projets/domaine/config';
import { echeancierOffre, lignesOffreDepuisDevis } from '../projets/domaine/facturation-offre';
import { ventilationTva } from '../projets/domaine/gardes';
import { refDevis } from '../devis/domaine';
import { delaiTranche, prevueLe, tempsImpute, tempsPipe } from './feuille-temps';
import { daysBetween, todayIso, toIsoDay } from '@hub/domain';

const jour = (d: Date | string | null | undefined) =>
  d ? (typeof d === 'string' ? d.slice(0, 10) : toIsoDay(d)) : null;
const premier = (dates: (string | null)[]) => dates.filter((d): d is string => !!d).sort()[0] ?? null;

// Finances · Feuille de temps d'un dossier (maquette du boss, oct. 2026) :
// pipe commercial, facturation de l'offre acceptée tranche par tranche,
// temps imputé sur le projet (tâches assignées du gabarit). Lecture seule.
@Injectable()
export class FeuilleTempsService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  async pourDossier(societeId: string, dossierId: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id: dossierId, societeId },
      select: {
        id: true,
        code: true,
        statut: true,
        createdAt: true,
        client: { select: { id: true, nom: true } },
        projet: { select: { id: true, code: true, budgetHeures: true } },
        transitions: { select: { vers: true, creeLe: true }, orderBy: { creeLe: 'asc' } },
        offres: {
          orderBy: { creeLe: 'desc' },
          include: {
            lignes: {
              orderBy: { ordre: 'asc' },
              include: { produitService: { select: { code: true, famille: true } } },
            },
          },
        },
      },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    const aujourdhui = todayIso();

    // Offre de référence : l'acceptée, sinon la plus récente.
    const offre =
      dossier.offres.find((o) => o.statut === 'accepte' || o.statut === 'transforme') ?? dossier.offres[0] ?? null;
    const accord =
      offre && (offre.statut === 'accepte' || offre.statut === 'transforme') ? jour(offre.dateReponse) : null;
    const factures = await this.prisma.facture.findMany({
      where: {
        societeId,
        estAvoir: false,
        OR: [{ dossierCrmId: dossier.id }, ...(dossier.projet ? [{ projetId: dossier.projet.id }] : [])],
      },
      include: { paiements: { orderBy: { date: 'asc' } } },
    });
    const emises = factures.filter((f) => f.statut !== 'brouillon');
    const envoi = jour(offre?.dateEnvoi);
    const soumissions = dossier.transitions.filter((t) => t.vers === 'en_validation').map((t) => jour(t.creeLe)!);
    const dates = {
      lead: jour(dossier.createdAt),
      // Dernière soumission avant l'envoi (une offre renvoyée se resoumet).
      soumission: (envoi ? soumissions.filter((d) => d <= envoi) : soumissions).pop() ?? null,
      envoi,
      accord,
      facture: premier(emises.map((f) => jour(f.emiseLe))),
      encaissement: premier(emises.flatMap((f) => f.paiements.map((p) => p.date))),
    };

    // Facturation de l'offre acceptée : une ligne par échéance du plan.
    const parts = (offre?.partsFactures as PartsFactures | null) ?? (await this.reglages.partsFactures(societeId));
    const delais = (offre?.delaisEcheancier as Record<string, number> | null) ?? {};
    const echeances =
      offre && accord ? echeancierOffre(lignesOffreDepuisDevis(offre.lignes), parts, delais).filter((e) => e.cle) : [];
    const facturation = echeances.map((e) => {
      const f = factures.find((x) => x.devisEcheancierId === offre!.id && x.cleEcheance === e.cle);
      const facturee = f && f.statut !== 'brouillon' ? jour(f.emiseLe) : null;
      const { montantTtc } = f
        ? ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber())
        : { montantTtc: e.montantTtc };
      const paye = f ? f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0) : 0;
      const payee = f && facturee && paye >= montantTtc ? (f.paiements.at(-1)?.date ?? null) : null;
      const t = {
        prevue: prevueLe(accord, e.delaiJours),
        facturee,
        echeance: facturee ? (f!.echeanceLe ?? null) : null,
        payee,
      };
      return {
        cle: e.cle!,
        famille: e.famille,
        tranche: e.echeance, // F1, Avance, Unique…
        declencheur: e.declencheur,
        reference: f && facturee ? refFacture(f) : null,
        montantTtc,
        ...t,
        delai: delaiTranche(t, aujourdhui),
      };
    });

    // Temps imputé : tâches assignées du projet ouvert (gabarit).
    const temps = dossier.projet ? await this.tempsProjet(societeId, dossier.projet.id, aujourdhui) : null;
    const heuresPrevues = dossier.projet?.budgetHeures ?? null;
    const montantHt = offre ? lignesOffreDepuisDevis(offre.lignes).reduce((s, l) => s + l.montantHt, 0) : 0;

    return {
      dossier: {
        id: dossier.id,
        code: dossier.code,
        statut: dossier.statut,
        client: dossier.client,
        projet: dossier.projet ? { id: dossier.projet.id, code: dossier.projet.code } : null,
      },
      offre: offre ? { id: offre.id, reference: refDevis(offre), statut: offre.statut, montantHt } : null,
      dernierEvenement: jour(dossier.transitions.at(-1)?.creeLe ?? dossier.createdAt),
      pipe: tempsPipe(dates),
      indicateurs: {
        cycleCommercialJours: dates.lead && accord ? daysBetween(dates.lead, accord) : null,
        signatureEncaissementJours: accord && dates.encaissement ? daysBetween(accord, dates.encaissement) : null,
        heuresImputees: temps?.total ?? null,
        heuresPrevues,
        // Honoraires HT signés par heure imputée (rentabilité).
        honorairesParHeure: accord && temps && temps.total > 0 ? Math.round(montantHt / temps.total) : null,
      },
      facturation,
      temps: temps ? { ...temps, prevues: heuresPrevues } : null,
    };
  }

  private async tempsProjet(societeId: string, projetId: string, aujourdhui: string) {
    const [taches, feries] = await Promise.all([
      this.prisma.tacheProjet.findMany({
        where: { projetId, assigneId: { not: null }, statut: { not: 'non_necessaire' } },
        include: {
          carte: { select: { etapeLibelle: true, etapeNumero: true } },
          assigne: {
            select: {
              prenom: true,
              nom: true,
              dossierPersonnel: {
                select: { absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } } },
              },
            },
          },
        },
      }),
      this.reglages.joursFeries([societeId]),
    ]);
    return tempsImpute(
      taches.map((t) => ({
        id: t.id,
        etape: t.carte.etapeLibelle,
        etapeNumero: t.carte.etapeNumero,
        libelle: t.libelle,
        debut: t.debutLe,
        echeance: t.finLe,
        heures: t.heures?.toNumber() ?? null,
        assigne: {
          nom: `${t.assigne!.prenom} ${t.assigne!.nom}`,
          absences: (t.assigne!.dossierPersonnel?.absences ?? []).map((a) => ({ debut: a.dateDebut, fin: a.dateFin })),
        },
      })),
      aujourdhui,
      feries.get(societeId) ?? new Set(),
    );
  }
}
