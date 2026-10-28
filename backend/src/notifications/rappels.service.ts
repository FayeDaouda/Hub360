import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { refDevis, relanceAFaire, JOURS_RELANCE_OFFRE } from '../devis/domaine';
import { refFacture } from '../projets/domaine/config';
import { joursRetardFacture, ventilationTva } from '../projets/domaine/gardes';
import { PrismaService } from '../prisma/prisma.service';
import { moisClos } from '../projets/facturation/cloture';
import {
  DECISION_EN_VIGUEUR,
  echeanceReporting,
  moisAReporter,
  numeroDecision,
  rappelsReporting,
  relanceDecision,
  RELANCES_AVANT_AUTEUR,
  REPORTINGS,
} from '../pilotage/pilotage-regles';
import { planNotificationsCrm } from '../crm/notifications-crm';
import { ROLE_PROPRIETAIRE_DOSSIER } from '../crm/cycle';
import { ReglagesService } from '../reglages/reglages.service';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { NotificationsService } from './notifications.service';
import { avecDelegataire } from '../commun/delegation-ceo';
import { runAsSystem } from '../tenancy/tenant-context';
import {
  addDays,
  daysBetween,
  daysSince,
  formatAmount,
  formatDayMonth,
  formatMonthYear,
  plural,
  ROLE_CEO,
  ROLE_CFO,
  ROLE_HR,
  todayIso,
  toIsoDay,
} from '@hub/domain';

// Heure de la tournée (Dakar = UTC, pas d'heure d'été).
const HEURE_TOURNEE = 7;
// Facture échue : premier rappel le lendemain de l'échéance, puis chaque semaine.
const JOURS_ENTRE_RAPPELS_FACTURE = 7;
// Revue CEO (22/10/2026) : délai avant de relancer le CEO, hors offres et factures à contresigner.
const JOURS_OUVRES_RELANCE_CEO = 3;

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
    private seuilCeo: SeuilCeoService,
  ) {}

  // Serveur redémarré après l'heure : la tournée du jour est rattrapée.
  // Jamais pendant les tests (un minuteur resterait ouvert après eux).
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    if (new Date().getUTCHours() >= HEURE_TOURNEE) setTimeout(() => void this.tournee(), 30_000);
  }

  @Cron(`0 ${HEURE_TOURNEE} * * *`, { timeZone: 'Africa/Dakar' })
  async tournee(jour = todayIso()): Promise<number> {
    // Tournée globale (toutes sociétés en une passe) : périmètre système
    // déclaré (ADR 0001). La découper par société est un suivi prévu.
    return runAsSystem('rappels quotidiens', () => this.tourneeToutesSocietes(jour));
  }

  private async tourneeToutesSocietes(jour: string): Promise<number> {
    if (this.enCours) return 0;
    this.enCours = true;
    try {
      const rappels = [
        ...(await this.offres(jour)),
        ...(await this.offresExpirees(jour)),
        ...(await this.factures(jour)),
        ...(await this.taches(jour)),
        ...(await this.demandes(jour)),
        ...(await this.clotures(jour)),
        ...(await this.reportings(jour)),
        ...(await this.decisions(jour)),
        ...(await this.ceo(jour)),
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
  // rejeu) ne l'envoient qu'une fois. Rien d'écrit (échec, aucun titulaire) :
  // la clé est rendue, la tournée suivante réessaie au lieu de perdre le rappel.
  private async envoyer(r: Rappel): Promise<boolean> {
    const { count } = await this.prisma.rappelEnvoye.createMany({ data: [{ cle: r.cle }], skipDuplicates: true });
    if (!count) return false;
    const { cle: _c, ...notification } = r;
    if (await this.notifications.envoyer(notification)) return true;
    await this.prisma.rappelEnvoye.deleteMany({ where: { cle: r.cle } });
    return false;
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
        const jours = daysBetween(toIsoDay(d.dateEnvoi!), jour);
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

  // Offre d'un dossier restée sans réponse au-delà de sa validité (revue
  // COO) : propriétaire, créateur du lead et apporteur interne, une fois.
  async offresExpirees(jour: string): Promise<Rappel[]> {
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: {
        statut: 'offre_envoyee',
        archiveLe: null,
        offres: { some: { statut: 'envoye', dateValidite: { lt: jour } } },
      },
      select: {
        id: true,
        societeId: true,
        code: true,
        programme: true,
        proprietaireId: true,
        creeParId: true,
        apporteurType: true,
        apporteurUtilisateurId: true,
        offres: { orderBy: { creeLe: 'desc' }, take: 1, select: { id: true, statut: true, dateValidite: true } },
      },
    });
    const rappels: Rappel[] = [];
    for (const d of dossiers) {
      const offre = d.offres[0];
      // Seule l'offre en cours compte : une offre refaite repart de zéro.
      if (!offre || offre.statut !== 'envoye' || !offre.dateValidite || offre.dateValidite >= jour) continue;
      const proprietaire = d.proprietaireId
        ? [d.proprietaireId]
        : await this.notifications.titulairesRole(d.societeId, ROLE_PROPRIETAIRE_DOSSIER);
      const plan = planNotificationsCrm(
        'offre_expiree',
        { code: d.code, programme: d.programme },
        {
          daf: [],
          proprietaire,
          createur: d.creeParId ? [d.creeParId] : [],
          apporteur: d.apporteurType === 'interne' && d.apporteurUtilisateurId ? [d.apporteurUtilisateurId] : [],
        },
        null,
      );
      for (const p of plan) {
        rappels.push({
          cle: `offre-expiree:${offre.id}:${p.destinataireId}`,
          societeId: d.societeId,
          type: 'offre_expiree',
          titre: p.titre,
          destinataireIds: [p.destinataireId],
          dossierCrmId: d.id,
        });
      }
    }
    return rappels;
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
      if (!cfo.has(f.societeId)) cfo.set(f.societeId, await this.notifications.titulairesRole(f.societeId, ROLE_CFO));
      rappels.push({
        cle: `facture:${f.id}:${Math.floor((retard - 1) / JOURS_ENTRE_RAPPELS_FACTURE)}`,
        societeId: f.societeId,
        type: 'rappel_facture',
        titre: `Facture échue · ${refFacture(f) ?? 'sans numéro'} · ${plural(retard, 'jour')} de retard · reste ${formatAmount(reste)}`,
        destinataireIds: [
          f.projet?.dossierCrm.proprietaireId ?? f.dossierCrm?.proprietaireId,
          ...cfo.get(f.societeId)!,
        ],
        projetId: f.projetId,
        factureId: f.id,
      });
    }
    return rappels;
  }

  // Tâche encore à rendre : la veille de l'échéance, puis une fois en retard.
  // L'échéance fait partie de la clé : une prolongation accordée relance le cycle.
  async taches(jour: string): Promise<Rappel[]> {
    const demain = addDays(jour, 1);
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
        select: {
          id: true,
          statut: true,
          createdAt: true,
          decisionN1Le: true,
          dateDebut: true,
          dateFin: true,
          n1CollaborateurId: true,
          n1Role: true,
          dossier: DOSSIER,
        },
      }),
      this.prisma.demandeRemboursement.findMany({
        where: { statut: 'soumise' },
        select: { id: true, createdAt: true, dossier: DOSSIER },
      }),
      this.prisma.demandeAttestation.findMany({
        where: { delivreeLe: null },
        select: { id: true, demandeLe: true, dossier: DOSSIER },
      }),
      // Demandeurs titulaires du rôle RH : leur validation finale revient au CEO.
      this.prisma.dossierPersonnel.findMany({
        where: {
          OR: [
            { utilisateur: { roles: { some: { role: { nom: ROLE_HR } } } } },
            { collaborateur: { utilisateur: { roles: { some: { role: { nom: ROLE_HR } } } } } },
          ],
        },
        select: { id: true },
      }),
    ]);
    const demandeurRh = new Set(dossiersRh.map((d) => d.id));
    const rappels: Rappel[] = [];
    // Renvoie le palier atteint (0 : pas encore de relance).
    const ajouter = async (
      cle: string,
      depuis: Date,
      dossier: { societeId: string; prenom: string; nom: string },
      objet: string,
      chez: string,
      ids: (string | null)[],
    ) => {
      const n = joursOuvresDepuis(toIsoDay(depuis), jour);
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
      const periode = `absence du ${formatDayMonth(a.dateDebut)} au ${formatDayMonth(a.dateFin)}`;
      if (a.statut === 'attente_n1') {
        const ids = a.n1CollaborateurId
          ? await this.notifications.comptesDe([a.n1CollaborateurId])
          : a.n1Role
            ? await role(a.dossier.societeId, a.n1Role)
            : [];
        const palier = await ajouter(
          `demande:absence:${a.id}:n1`,
          a.createdAt,
          a.dossier,
          periode,
          'en attente de votre décision',
          ids,
        );
        // N relances du N+1 restées sans réponse : la demande est signalée
        // aussi à la RH (au CEO si la demandeuse est la RH), une seule fois.
        if (palier > (await delai(a.dossier.societeId)).signalement) {
          const escalade = demandeurRh.has(a.dossier.id) ? ROLE_CEO : ROLE_HR;
          rappels.push({
            cle: `demande:absence:${a.id}:n1:signalee`,
            societeId: a.dossier.societeId,
            type: 'rappel_demande',
            titre: `N+1 sans réponse · ${periode} de ${`${a.dossier.prenom} ${a.dossier.nom}`.trim()} · ${(await delai(a.dossier.societeId)).signalement} relances restées sans décision`,
            destinataireIds: await role(a.dossier.societeId, escalade),
          });
        }
      } else {
        const final = demandeurRh.has(a.dossier.id) ? ROLE_CEO : ROLE_HR;
        await ajouter(
          `demande:absence:${a.id}:final`,
          a.decisionN1Le ?? a.createdAt,
          a.dossier,
          periode,
          'en attente de validation finale',
          await role(a.dossier.societeId, final),
        );
      }
    }
    for (const r of remboursements) {
      await ajouter(
        `demande:remboursement:${r.id}`,
        r.createdAt,
        r.dossier,
        'remboursement',
        'à transmettre',
        await role(r.dossier.societeId, ROLE_HR),
      );
    }
    for (const t of attestations) {
      await ajouter(
        `demande:attestation:${t.id}`,
        t.demandeLe,
        t.dossier,
        'attestation de travail',
        'à délivrer',
        await role(t.dossier.societeId, ROLE_HR),
      );
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
      // Sociétés « Bientôt » : personne n'y dépose encore de reporting.
      this.prisma.societe.findMany({ where: { accesOuvert: true }, select: { id: true } }),
      this.prisma.reportingMensuel.findMany({
        where: { mois: { in: mois } },
        select: { societeId: true, type: true, mois: true },
      }),
    ]);
    const fait = new Set(deposes.map((d) => `${d.societeId}:${d.type}:${d.mois}`));
    const court = (role: string) => role.replace(/\s*\(transverse\)$/, '');
    const rappels: Rappel[] = [];
    for (const { id: societeId } of societes) {
      const joursAvant = await this.reglages.regle<number>(societeId, 'rappel_reporting_jours_avant');
      for (const [type, { emetteur, destinataire }] of Object.entries(REPORTINGS) as [
        keyof typeof REPORTINGS,
        (typeof REPORTINGS)[keyof typeof REPORTINGS],
      ][]) {
        const emetteurs = await this.notifications.titulairesRole(societeId, emetteur);
        if (!emetteurs.length) continue; // pas d'émetteur dans la société : pas de reporting
        const titre = type === 'rh' ? 'Reporting RH' : 'Reporting de la direction';
        for (const m of mois) {
          const echeance = formatDayMonth(echeanceReporting(m));
          for (const r of rappelsReporting(m, fait.has(`${societeId}:${type}:${m}`), jour, joursAvant)) {
            rappels.push({
              cle: `reporting:${societeId}:${type}:${m}:${r.cle}`,
              societeId,
              type: r.cible === 'emetteur' ? 'reporting_a_deposer' : 'reporting_en_retard',
              titre:
                r.cible === 'destinataire'
                  ? `${titre} de ${formatMonthYear(m)} pas encore déposé (dû le ${echeance}) · l’émetteur est relancé chaque semaine`
                  : r.nature === 'avant'
                    ? `${titre} de ${formatMonthYear(m)} à déposer au ${court(destinataire)} avant le ${echeance} · prérempli par le HUB, à compléter`
                    : `${titre} de ${formatMonthYear(m)} en retard (dû le ${echeance}) · à déposer au ${court(destinataire)}`,
              destinataireIds:
                r.cible === 'emetteur' ? emetteurs : await this.notifications.titulairesRole(societeId, destinataire),
            });
          }
        }
      }
    }
    return rappels;
  }

  // Registre des décisions (revue CTO, 21/10/2026) : le responsable d'une
  // décision ouverte est relancé 3 jours avant l'échéance, le jour même, puis
  // chaque semaine ; après 2 relances sans effet, l'auteur est prévenu (une fois).
  async decisions(jour: string): Promise<Rappel[]> {
    const ouvertes = await this.prisma.decisionRegistre.findMany({
      where: { origine: 'saisie', closeLe: null, echeance: { not: null }, ...DECISION_EN_VIGUEUR },
      select: {
        id: true,
        societeId: true,
        numero: true,
        texte: true,
        echeance: true,
        responsable: true,
        responsableRole: true,
        responsableCollaborateurId: true,
        creeParId: true,
      },
    });
    const rappels: Rappel[] = [];
    for (const d of ouvertes) {
      const suffixe = relanceDecision(d.echeance!, jour);
      if (!suffixe) continue;
      const responsables = d.responsableCollaborateurId
        ? await this.notifications.comptesDe([d.responsableCollaborateurId])
        : await this.notifications.titulairesRole(d.societeId, d.responsableRole ?? '');
      const texte = d.texte.length > 70 ? `${d.texte.slice(0, 69)}…` : d.texte;
      const etat =
        suffixe === 'avant'
          ? `échéance le ${formatDayMonth(d.echeance!)}`
          : suffixe === 'jour'
            ? 'échéance aujourd’hui'
            : `échéance dépassée depuis le ${formatDayMonth(d.echeance!)}`;
      rappels.push({
        cle: `decision:${d.id}:resp:${suffixe}`,
        societeId: d.societeId,
        type: 'rappel_decision',
        titre: `Décision ${numeroDecision(d.numero)} à mettre en œuvre · ${texte} · ${etat}`,
        destinataireIds: responsables,
      });
      // Relances déjà parties (sans compter celle-ci) : au-delà de 2, l'auteur est prévenu.
      const envoyees = await this.prisma.rappelEnvoye.count({
        where: { cle: { startsWith: `decision:${d.id}:resp:` } },
      });
      if (suffixe.startsWith('retard') && envoyees >= RELANCES_AVANT_AUTEUR && d.creeParId) {
        rappels.push({
          cle: `decision:${d.id}:auteur`,
          societeId: d.societeId,
          type: 'decision_en_retard',
          titre: `Décision ${numeroDecision(d.numero)} toujours ouverte après ${envoyees} relances · ${d.responsable} · ${texte}`,
          destinataireIds: [d.creeParId],
        });
      }
    }
    return rappels;
  }

  // Revue CEO (22/10/2026) : ce qui attend le CEO est relancé — 24 h pour
  // une offre à contresigner (une offre n'est valable que 7 jours une fois
  // envoyée), puis chaque jour ; 3 jours ouvrés pour le reste
  // (avoirs, décisions proposées, droits du CIO, salaire du CFO), puis tous
  // les 3 jours ouvrés.
  async ceo(jour: string): Promise<Rappel[]> {
    const maintenant = Date.now();
    const rappels: Rappel[] = [];
    const ceos = new Map<string, Promise<string[]>>();
    const ceoDe = (societeId: string) => {
      if (!ceos.has(societeId)) ceos.set(societeId, this.notifications.titulairesRole(societeId, ROLE_CEO));
      return ceos.get(societeId)!;
    };
    const ouvres = (d: Date) => joursOuvresDepuis(toIsoDay(d), jour);
    // demandeurId : renseigné quand la décision se délègue (avoirs, propositions) —
    // le délégataire en fonction est relancé aussi, jamais sur sa propre demande.
    const pousser = async (r: Omit<Rappel, 'type' | 'destinataireIds'>, demandeurId?: string | null) =>
      rappels.push({
        ...r,
        type: 'attente_ceo',
        destinataireIds:
          demandeurId === undefined
            ? await ceoDe(r.societeId)
            : await avecDelegataire(this.prisma, r.societeId, await ceoDe(r.societeId), demandeurId),
      });

    // 1. Offres soumises au-delà du seuil de contresignature.
    const offres = await this.prisma.dossierCrm.findMany({
      where: { statut: 'en_validation', archiveLe: null },
      select: {
        id: true,
        societeId: true,
        code: true,
        transitions: {
          where: { vers: 'en_validation' },
          orderBy: { creeLe: 'desc' },
          take: 1,
          select: { creeLe: true },
        },
      },
    });
    for (const o of offres) {
      const soumise = o.transitions[0]?.creeLe;
      if (!soumise || maintenant - soumise.getTime() < 86_400_000) continue;
      const montant = await this.seuilCeo.offreAuDelaDuSeuil(o.societeId, o.id);
      if (montant === null) continue;
      const j = daysSince(soumise, maintenant);
      await pousser(
        {
          cle: `ceo:offre:${o.id}:${j}`,
          societeId: o.societeId,
          titre: `Offre à contresigner · ${o.code} · ${formatAmount(montant)} TTC · en attente depuis ${j} j (validité de 7 jours une fois envoyée)`,
          dossierCrmId: o.id,
        },
        null,
      );
    }

    // 2. Factures à contresigner : relancées par le Pilotage (relances-ceo.service.ts),
    // qui sait quelles tranches sont prêtes à émettre.

    // 3. Le reste : 3 jours ouvrés, puis tous les 3 jours ouvrés.
    const palier = (d: Date) => Math.floor(ouvres(d) / JOURS_OUVRES_RELANCE_CEO);
    for (const a of await this.prisma.demandeAvoir.findMany({
      where: { statut: 'a_valider' },
      select: { id: true, societeId: true, factureId: true, montantTtc: true, demandeLe: true, demandeParId: true },
    })) {
      const p = palier(a.demandeLe);
      if (p < 1) continue;
      await pousser(
        {
          cle: `ceo:avoir:${a.id}:${p}`,
          societeId: a.societeId,
          titre: `Avoir à valider · ${formatAmount(a.montantTtc.toNumber())} TTC · en attente depuis ${ouvres(a.demandeLe)} jours ouvrés`,
          factureId: a.factureId,
        },
        a.demandeParId,
      );
    }
    for (const d of await this.prisma.decisionRegistre.findMany({
      where: { proposition: 'proposee' },
      select: { id: true, societeId: true, numero: true, texte: true, createdAt: true, creeParId: true },
    })) {
      const p = palier(d.createdAt);
      if (p < 1) continue;
      const texte = d.texte.length > 70 ? `${d.texte.slice(0, 69)}…` : d.texte;
      await pousser(
        {
          cle: `ceo:decision:${d.id}:${p}`,
          societeId: d.societeId,
          titre: `Décision proposée ${numeroDecision(d.numero)} à arbitrer · ${texte} · en attente depuis ${ouvres(d.createdAt)} jours ouvrés`,
        },
        d.creeParId,
      );
    }
    for (const d of await this.prisma.demandeDroit.findMany({
      where: { statut: 'en_attente' },
      select: { id: true, societeId: true, module: true, createdAt: true },
    })) {
      const p = palier(d.createdAt);
      if (p < 1) continue;
      await pousser({
        cle: `ceo:droit:${d.id}:${p}`,
        societeId: d.societeId,
        titre: `Droits du CIO à valider · ${d.module} · en attente depuis ${ouvres(d.createdAt)} jours ouvrés`,
      });
    }
    // Salaire du CFO : seul cas où le CEO valide un salaire.
    for (const c of await this.prisma.changementSalaire.findMany({
      where: { statut: 'a_valider' },
      select: {
        id: true,
        proposeLe: true,
        dossier: {
          select: {
            societeId: true,
            prenom: true,
            nom: true,
            utilisateurId: true,
            collaborateur: { select: { utilisateurId: true } },
          },
        },
      },
    })) {
      const compte = c.dossier.utilisateurId ?? c.dossier.collaborateur?.utilisateurId ?? null;
      if (!compte || !(await this.notifications.titulairesRole(c.dossier.societeId, ROLE_CFO)).includes(compte))
        continue;
      const p = palier(c.proposeLe);
      if (p < 1) continue;
      await pousser({
        cle: `ceo:salaire:${c.id}:${p}`,
        societeId: c.dossier.societeId,
        titre: `Salaire à valider · ${c.dossier.prenom} ${c.dossier.nom} · en attente depuis ${ouvres(c.proposeLe)} jours ouvrés`,
      });
    }
    return rappels;
  }

  // Clôture mensuelle (revue CFO 20/10/2026) : à partir du jour réglé, le
  // CFO est relancé chaque semaine tant que le mois précédent n'est pas clos.
  async clotures(jour: string): Promise<Rappel[]> {
    const [a, m, j] = jour.split('-').map(Number);
    const precedent = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
    const societes = await this.prisma.facture.findMany({
      where: { emiseLe: { not: null } },
      distinct: ['societeId'],
      select: { societeId: true },
    });
    const rappels: Rappel[] = [];
    for (const { societeId } of societes) {
      const depuis = await this.reglages.regle<number>(societeId, 'rappel_cloture_jour');
      if (j < depuis || (await moisClos(this.prisma, societeId)).has(precedent)) continue;
      rappels.push({
        cle: `cloture:${societeId}:${precedent}:${Math.floor((j - depuis) / 7)}`,
        societeId,
        type: 'cloture_a_faire',
        titre: `Clôture de ${formatMonthYear(precedent)} à faire · paiements et factures du mois à figer`,
        destinataireIds: await this.notifications.titulairesRole(societeId, ROLE_CFO),
      });
    }
    return rappels;
  }
}

// Jours ouvrés (lundi → vendredi) écoulés après `depuis`, jusqu'à `jour` inclus.
export function joursOuvresDepuis(depuis: string, jour: string): number {
  let n = 0;
  for (
    let d = new Date(`${addDays(depuis, 1)}T00:00:00Z`);
    d <= new Date(`${jour}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const js = d.getUTCDay();
    if (js !== 0 && js !== 6) n++;
  }
  return n;
}
