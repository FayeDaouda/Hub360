import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { joursEntre, refDevis, relanceAFaire, JOURS_RELANCE_OFFRE } from '../devis/domaine';
import { refFacture } from '../projets/domaine/config';
import { joursRetardFacture, ventilationTva } from '../projets/domaine/gardes';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

// Heure de la tournée (Dakar = UTC, pas d'heure d'été).
const HEURE_TOURNEE = 7;
// Facture échue : premier rappel le lendemain de l'échéance, puis chaque semaine.
const JOURS_ENTRE_RAPPELS_FACTURE = 7;

const jourCourant = () => new Date().toISOString().slice(0, 10);
const decaler = (jour: string, n: number) => {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

type Rappel = {
  cle: string;
  societeId: string;
  type: NotificationType;
  titre: string;
  destinataireIds: (string | null | undefined)[];
  projetId?: string | null;
  factureId?: string | null;
  dossierCrmId?: string | null;
};

// Rappels quotidiens : ce que les pages affichent déjà (relance d'offre due,
// facture échue, tâche en retard) arrive aussi dans la cloche de la bonne
// personne, sans qu'elle ait à ouvrir la page. Chaque rappel a une clé
// (RappelEnvoye) : rejouer la tournée n'envoie jamais un doublon.
@Injectable()
export class RappelsService implements OnApplicationBootstrap {
  private readonly log = new Logger('Rappels');
  private enCours = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Serveur redémarré après l'heure : la tournée du jour est rattrapée.
  // Jamais pendant les tests (un minuteur resterait ouvert après eux).
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    if (new Date().getUTCHours() >= HEURE_TOURNEE) setTimeout(() => void this.tournee(), 30_000);
  }

  @Cron(`0 ${HEURE_TOURNEE} * * *`, { timeZone: 'Africa/Dakar' })
  async tournee(jour = jourCourant()): Promise<number> {
    if (this.enCours) return 0;
    this.enCours = true;
    try {
      const rappels = [...(await this.offres(jour)), ...(await this.factures(jour)), ...(await this.taches(jour))];
      let envoyes = 0;
      for (const r of rappels) if (await this.envoyer(r)) envoyes++;
      if (envoyes) this.log.log(`${envoyes} rappel(s) envoyé(s)`);
      return envoyes;
    } catch (e) {
      this.log.error(`Tournée des rappels interrompue : ${e instanceof Error ? e.message : e}`);
      return 0;
    } finally {
      this.enCours = false;
    }
  }

  // La clé est réservée avant l'envoi : deux tournées concurrentes (ou un
  // rejeu) ne l'envoient qu'une fois.
  private async envoyer(r: Rappel): Promise<boolean> {
    const { count } = await this.prisma.rappelEnvoye.createMany({ data: [{ cle: r.cle }], skipDuplicates: true });
    if (!count) return false;
    const { cle: _c, ...notification } = r;
    await this.notifications.envoyer(notification);
    return true;
  }

  // Offre envoyée sans réponse : un rappel par palier (J+3, J+6) tant que la
  // relance correspondante n'est pas faite — même règle que le bouton Relancer.
  async offres(jour: string): Promise<Rappel[]> {
    const devis = await this.prisma.devis.findMany({
      where: { statut: 'envoye', dateEnvoi: { not: null } },
      select: {
        id: true,
        societeId: true,
        projetId: true,
        dossierCrmId: true,
        statut: true,
        dateEnvoi: true,
        dateValidite: true,
        relancesEnvoyees: true,
        numero: true,
        codeDossier: true,
        rangDossier: true,
        client: { select: { nom: true } },
        dossierCrm: { select: { proprietaireId: true } },
        projet: { select: { dossierCrm: { select: { proprietaireId: true } } } },
      },
    });
    return devis
      .filter((d) => relanceAFaire(d, jour))
      .map((d) => {
        const jours = joursEntre(d.dateEnvoi!.toISOString().slice(0, 10), jour);
        const palier = JOURS_RELANCE_OFFRE.filter((j) => jours >= j).length;
        return {
          cle: `offre:${d.id}:${palier}`,
          societeId: d.societeId,
          type: 'rappel_offre' as const,
          titre: `Relance à faire · ${refDevis(d) ?? 'offre'} · ${d.client.nom} · sans réponse depuis ${jours} jours`,
          destinataireIds: [d.dossierCrm?.proprietaireId ?? d.projet?.dossierCrm.proprietaireId],
          projetId: d.projetId,
          dossierCrmId: d.dossierCrmId,
        };
      });
  }

  // Facture émise, échue et non soldée : au propriétaire du dossier et au CFO.
  async factures(jour: string): Promise<Rappel[]> {
    const factures = await this.prisma.facture.findMany({
      where: { statut: 'emise', estAvoir: false, echeanceLe: { lt: jour } },
      select: {
        id: true,
        societeId: true,
        projetId: true,
        echeanceLe: true,
        montantHt: true,
        tauxTva: true,
        numero: true,
        emiseLe: true,
        estAvoir: true,
        codeDossier: true,
        rangDossier: true,
        paiements: { select: { montant: true } },
        dossierCrm: { select: { proprietaireId: true } },
        projet: { select: { dossierCrm: { select: { proprietaireId: true } } } },
      },
    });
    const cfo = new Map<string, string[]>();
    const rappels: Rappel[] = [];
    for (const f of factures) {
      const { montantTtc } = ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber());
      const reste = montantTtc - f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      if (reste <= 0) continue;
      const retard = joursRetardFacture(f.echeanceLe, jour);
      if (!cfo.has(f.societeId)) cfo.set(f.societeId, await this.notifications.titulairesRole(f.societeId, 'CFO'));
      rappels.push({
        cle: `facture:${f.id}:${Math.floor((retard - 1) / JOURS_ENTRE_RAPPELS_FACTURE)}`,
        societeId: f.societeId,
        type: 'rappel_facture',
        titre: `Facture échue · ${refFacture(f) ?? 'sans numéro'} · ${retard} jour${retard > 1 ? 's' : ''} de retard · reste ${fcfa(reste)}`,
        destinataireIds: [f.projet?.dossierCrm.proprietaireId ?? f.dossierCrm?.proprietaireId, ...cfo.get(f.societeId)!],
        projetId: f.projetId,
        factureId: f.id,
      });
    }
    return rappels;
  }

  // Tâche encore à rendre : la veille de l'échéance, puis une fois en retard.
  // L'échéance fait partie de la clé : une prolongation accordée relance le cycle.
  async taches(jour: string): Promise<Rappel[]> {
    const demain = decaler(jour, 1);
    const taches = await this.prisma.tacheProjet.findMany({
      where: { assigneId: { not: null }, statut: { in: ['a_faire', 'reprise'] }, finLe: { not: null, lte: demain } },
      select: {
        id: true,
        libelle: true,
        finLe: true,
        assigneId: true,
        carte: { select: { libelle: true } },
        projet: { select: { id: true, code: true, societeId: true } },
      },
    });
    const comptes = new Map(
      (
        await this.prisma.collaborateur.findMany({
          where: { id: { in: [...new Set(taches.map((t) => t.assigneId!))] } },
          select: { id: true, utilisateurId: true },
        })
      ).map((c) => [c.id, c.utilisateurId]),
    );
    return taches
      .filter((t) => t.finLe! === demain || t.finLe! < jour)
      .map((t) => {
        const veille = t.finLe === demain;
        return {
          cle: `tache:${t.id}:${veille ? 'veille' : 'retard'}:${t.finLe}`,
          societeId: t.projet.societeId,
          type: 'rappel_tache' as const,
          titre: `${veille ? 'À rendre demain' : 'En retard'} · ${t.projet.code} · ${t.carte.libelle} · ${t.libelle}`,
          destinataireIds: [comptes.get(t.assigneId!)],
          projetId: t.projet.id,
        };
      });
  }
}
