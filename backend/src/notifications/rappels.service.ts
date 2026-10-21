import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { joursEntre, refDevis, relanceAFaire, JOURS_RELANCE_OFFRE } from '../devis/domaine';
import { refFacture } from '../projets/domaine/config';
import { joursRetardFacture, ventilationTva } from '../projets/domaine/gardes';
import { PrismaService } from '../prisma/prisma.service';
import { moisClos, moisFr } from '../projets/facturation/cloture';
import { echeanceReporting, moisAReporter, rappelsReporting, REPORTINGS } from '../pilotage/pilotage-regles';
import { ReglagesService } from '../reglages/reglages.service';
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
    private reglages: ReglagesService,
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
      const rappels = [
        ...(await this.offres(jour)),
        ...(await this.factures(jour)),
        ...(await this.taches(jour)),
        ...(await this.demandes(jour)),
        ...(await this.clotures(jour)),
        ...(await this.reportings(jour)),
      ];
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
        reference: true,
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

  // Demandes RH en attente (revue RH 20/10/2026) : après N jours ouvrés sans
  // décision (Réglages, 3 par défaut), puis à chaque nouveau palier de N —
  // au N+1 tant qu'il n'a pas décidé, ensuite à la RH (au CEO pour une
  // demande de la RH) ; remboursements et attestations : à la RH.
  async demandes(jour: string): Promise<Rappel[]> {
    const delais = new Map<string, { relance: number; signalement: number }>();
    const delai = async (societeId: string) => {
      if (!delais.has(societeId)) {
        const [relance, signalement] = await Promise.all([
          this.reglages.regle<number>(societeId, 'relance_demandes_jours'),
          this.reglages.regle<number>(societeId, 'signalement_rh_apres_relances'),
        ]);
        delais.set(societeId, { relance, signalement });
      }
      return delais.get(societeId)!;
    };
    const titulaires = new Map<string, string[]>();
    const role = async (societeId: string, nom: string) => {
      const k = `${societeId}:${nom}`;
      if (!titulaires.has(k)) titulaires.set(k, await this.notifications.titulairesRole(societeId, nom));
      return titulaires.get(k)!;
    };
    const DOSSIER = { select: { id: true, societeId: true, prenom: true, nom: true } } as const;
    const [absences, remboursements, attestations, dossiersRh] = await Promise.all([
      this.prisma.demandeAbsence.findMany({
        where: { statut: { in: ['attente_n1', 'accord_n1'] } },
        select: { id: true, statut: true, createdAt: true, decisionN1Le: true, dateDebut: true, dateFin: true, n1CollaborateurId: true, n1Role: true, dossier: DOSSIER },
      }),
      this.prisma.demandeRemboursement.findMany({ where: { statut: 'soumise' }, select: { id: true, createdAt: true, dossier: DOSSIER } }),
      this.prisma.demandeAttestation.findMany({ where: { delivreeLe: null }, select: { id: true, demandeLe: true, dossier: DOSSIER } }),
      // Demandeurs titulaires du rôle RH : leur validation finale revient au CEO.
      this.prisma.dossierPersonnel.findMany({
        where: { OR: [{ utilisateur: { roles: { some: { role: { nom: 'RH' } } } } }, { collaborateur: { utilisateur: { roles: { some: { role: { nom: 'RH' } } } } } }] },
        select: { id: true },
      }),
    ]);
    const demandeurRh = new Set(dossiersRh.map((d) => d.id));
    const rappels: Rappel[] = [];
    // Renvoie le palier atteint (0 : pas encore de relance).
    const ajouter = async (cle: string, depuis: Date, dossier: { societeId: string; prenom: string; nom: string }, objet: string, chez: string, ids: (string | null)[]) => {
      const n = joursOuvresDepuis(depuis.toISOString().slice(0, 10), jour);
      const palier = Math.floor(n / (await delai(dossier.societeId)).relance);
      if (palier < 1) return 0;
      rappels.push({
        cle: `${cle}:${palier}`,
        societeId: dossier.societeId,
        type: 'rappel_demande',
        titre: `Relance · ${objet} de ${`${dossier.prenom} ${dossier.nom}`.trim()} · ${chez} depuis ${n} jours ouvrés`,
        destinataireIds: ids,
      });
      return palier;
    };
    for (const a of absences) {
      const periode = `absence du ${jjmm(a.dateDebut)} au ${jjmm(a.dateFin)}`;
      if (a.statut === 'attente_n1') {
        const ids = a.n1CollaborateurId ? await this.notifications.comptesDe([a.n1CollaborateurId]) : a.n1Role ? await role(a.dossier.societeId, a.n1Role) : [];
        const palier = await ajouter(`demande:absence:${a.id}:n1`, a.createdAt, a.dossier, periode, 'en attente de votre décision', ids);
        // N relances du N+1 restées sans réponse : la demande est signalée
        // aussi à la RH (au CEO si la demandeuse est la RH), une seule fois.
        if (palier > (await delai(a.dossier.societeId)).signalement) {
          const escalade = demandeurRh.has(a.dossier.id) ? 'CEO (transverse)' : 'RH';
          rappels.push({
            cle: `demande:absence:${a.id}:n1:signalee`,
            societeId: a.dossier.societeId,
            type: 'rappel_demande',
            titre: `N+1 sans réponse · ${periode} de ${`${a.dossier.prenom} ${a.dossier.nom}`.trim()} · ${(await delai(a.dossier.societeId)).signalement} relances restées sans décision`,
            destinataireIds: await role(a.dossier.societeId, escalade),
          });
        }
      } else {
        const final = demandeurRh.has(a.dossier.id) ? 'CEO (transverse)' : 'RH';
        await ajouter(`demande:absence:${a.id}:final`, a.decisionN1Le ?? a.createdAt, a.dossier, periode, 'en attente de validation finale', await role(a.dossier.societeId, final));
      }
    }
    for (const r of remboursements) {
      await ajouter(`demande:remboursement:${r.id}`, r.createdAt, r.dossier, 'remboursement', 'à transmettre', await role(r.dossier.societeId, 'RH'));
    }
    for (const t of attestations) {
      await ajouter(`demande:attestation:${t.id}`, t.demandeLe, t.dossier, 'attestation de travail', 'à délivrer', await role(t.dossier.societeId, 'RH'));
    }
    return rappels;
  }

  // Reportings mensuels (revue Dir. GC, 21/10/2026, lot 3) : l'émetteur est
  // rappelé avant le 5, puis relancé chaque semaine en retard ; le
  // destinataire est prévenu du retard une fois. Même règle pour la direction
  // (Dir. GC → CTO) et la RH (RH → CFO).
  async reportings(jour: string): Promise<Rappel[]> {
    const mois = moisAReporter(jour);
    if (!mois.length) return [];
    const [societes, deposes] = await Promise.all([
      this.prisma.societe.findMany({ select: { id: true } }),
      this.prisma.reportingMensuel.findMany({ where: { mois: { in: mois } }, select: { societeId: true, type: true, mois: true } }),
    ]);
    const fait = new Set(deposes.map((d) => `${d.societeId}:${d.type}:${d.mois}`));
    const court = (role: string) => role.replace(/\s*\(transverse\)$/, '');
    const rappels: Rappel[] = [];
    for (const { id: societeId } of societes) {
      const joursAvant = await this.reglages.regle<number>(societeId, 'rappel_reporting_jours_avant');
      for (const [type, { emetteur, destinataire }] of Object.entries(REPORTINGS) as [keyof typeof REPORTINGS, (typeof REPORTINGS)[keyof typeof REPORTINGS]][]) {
        const emetteurs = await this.notifications.titulairesRole(societeId, emetteur);
        if (!emetteurs.length) continue; // pas d'émetteur dans la société : pas de reporting
        const titre = type === 'rh' ? 'Reporting RH' : 'Reporting de la direction';
        for (const m of mois) {
          const echeance = jjmm(echeanceReporting(m));
          for (const r of rappelsReporting(m, fait.has(`${societeId}:${type}:${m}`), jour, joursAvant)) {
            rappels.push({
              cle: `reporting:${societeId}:${type}:${m}:${r.cle}`,
              societeId,
              type: r.cible === 'emetteur' ? 'reporting_a_deposer' : 'reporting_en_retard',
              titre:
                r.cible === 'destinataire'
                  ? `${titre} de ${moisFr(m)} pas encore déposé (dû le ${echeance}) · l’émetteur est relancé chaque semaine`
                  : r.nature === 'avant'
                    ? `${titre} de ${moisFr(m)} à déposer au ${court(destinataire)} avant le ${echeance} · prérempli par le HUB, à compléter`
                    : `${titre} de ${moisFr(m)} en retard (dû le ${echeance}) · à déposer au ${court(destinataire)}`,
              destinataireIds: r.cible === 'emetteur' ? emetteurs : await this.notifications.titulairesRole(societeId, destinataire),
            });
          }
        }
      }
    }
    return rappels;
  }

  // Clôture mensuelle (revue CFO 20/10/2026) : à partir du jour réglé, le
  // CFO est relancé chaque semaine tant que le mois précédent n'est pas clos.
  async clotures(jour: string): Promise<Rappel[]> {
    const [a, m, j] = jour.split('-').map(Number);
    const precedent = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
    const societes = await this.prisma.facture.findMany({ where: { emiseLe: { not: null } }, distinct: ['societeId'], select: { societeId: true } });
    const rappels: Rappel[] = [];
    for (const { societeId } of societes) {
      const depuis = await this.reglages.regle<number>(societeId, 'rappel_cloture_jour');
      if (j < depuis || (await moisClos(this.prisma, societeId)).has(precedent)) continue;
      rappels.push({
        cle: `cloture:${societeId}:${precedent}:${Math.floor((j - depuis) / 7)}`,
        societeId,
        type: 'cloture_a_faire',
        titre: `Clôture de ${moisFr(precedent)} à faire · paiements et factures du mois à figer`,
        destinataireIds: await this.notifications.titulairesRole(societeId, 'CFO'),
      });
    }
    return rappels;
  }
}

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Jours ouvrés (lundi → vendredi) écoulés après `depuis`, jusqu'à `jour` inclus.
export function joursOuvresDepuis(depuis: string, jour: string): number {
  let n = 0;
  for (let d = new Date(`${decaler(depuis, 1)}T00:00:00Z`); d <= new Date(`${jour}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const js = d.getUTCDay();
    if (js !== 0 && js !== 6) n++;
  }
  return n;
}
