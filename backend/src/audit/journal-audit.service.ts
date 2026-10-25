import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { ActionPaie, EvenementCompteType, NiveauPermission } from '@prisma/client';
import { refFacture } from '../projets/domaine/config';
import { ventilationTva } from '../projets/domaine/gardes';
import { moisFr } from '../projets/facturation/cloture';
import { formaterNumero } from '../projets/facturation/numerotation';
import { LIBELLE_MOTIF_AVOIR } from '../projets/facturation/controle-interne.service';
import { titreReporting } from '../pilotage/suivi-reporting.service';
import { PARAMETRES, type CleParametre } from '../finances/rentabilite/regles-rentabilite';
import { PrismaService } from '../prisma/prisma.service';

type Acteur = { userId: string; societeId: string; role: string };
export type CategorieAudit = 'comptes' | 'droits' | 'finances' | 'reglages' | 'rh' | 'paie' | 'pilotage';
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
  connexion_secours: 'Connexion du compte de secours',
  deconnexion_partout: 'Toutes les sessions coupées par le titulaire',
};
// Journal de la paie (revue RH 20/10/2026) : jamais de montant.
const ACTIONS_PAIE: Record<ActionPaie, string> = {
  salaire_consulte: 'Salaire consulté',
  salaire_modifie: 'Changement de salaire validé',
  salaire_propose: 'Changement de salaire proposé',
  salaire_refuse: 'Changement de salaire refusé',
  cout_consulte: 'Coût sur un projet consulté',
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
// Champs du profil de facturation suivis au journal (libellés lisibles).
const CHAMPS_PROFIL_AUDIT: [
  'raisonSociale' | 'adresse' | 'ninea' | 'cofi' | 'rccm' | 'capital' | 'telephone' | 'email' | 'banque' | 'rib' | 'wave' | 'orangeMoney' | 'conditionsPaiement' | 'mentionsPied' | 'logoDocument' | 'cgvAnnexe',
  string,
][] = [
  ['raisonSociale', 'raison sociale'],
  ['adresse', 'adresse'],
  ['ninea', 'NINEA'],
  ['cofi', 'COFI'],
  ['rccm', 'RCCM'],
  ['capital', 'capital'],
  ['telephone', 'téléphone'],
  ['email', 'e-mail'],
  ['banque', 'banque'],
  ['rib', 'RIB'],
  ['wave', 'Wave'],
  ['orangeMoney', 'Orange Money'],
  ['conditionsPaiement', 'conditions de paiement'],
  ['mentionsPied', 'mentions de pied'],
  ['logoDocument', 'logo'],
  ['cgvAnnexe', 'CGV en annexe'],
];

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
        select: { id: true, type: true, detail: true, parId: true, createdAt: true, ordreJournal: true, utilisateur: { select: { prenom: true, nom: true } } },
      }),
      this.prisma.journalDroit.findMany({ where: { societeId: S, createdAt: dans } }),
      this.prisma.facture.findMany({
        where: { societeId: S, emiseLe: dans },
        select: { id: true, numero: true, reference: true, emiseLe: true, ordreEmission: true, estAvoir: true, montantHt: true, tauxTva: true, emiseParId: true, libelle: true },
      }),
      this.prisma.paiement.findMany({
        where: { creeLe: dans, facture: { societeId: S } },
        select: { id: true, montant: true, date: true, creeLe: true, ordreJournal: true, creeParId: true, facture: { select: { numero: true, reference: true, emiseLe: true, estAvoir: true } } },
      }),
      this.prisma.paiementSupprime.findMany({ where: { societeId: S, supprimeLe: dans } }),
      this.prisma.journalReglage.findMany({ where: { societeId: S, createdAt: dans } }),
      this.prisma.dossierPersonnel.findMany({
        where: { societeId: S, archiveLe: dans },
        select: { id: true, prenom: true, nom: true, poste: true, archiveLe: true, ordreArchivage: true, archiveParId: true },
      }),
      this.prisma.journalPaie.findMany({
        where: { createdAt: dans, dossier: { societeId: S } },
        select: { id: true, action: true, mois: true, parId: true, createdAt: true, ordreJournal: true, dossier: { select: { prenom: true, nom: true, matricule: true } } },
      }),
    ]);
    // Contrôle interne (revue CFO 20/10/2026) : demandes d'avoir et clôtures.
    // Suivi des reportings (lot 5) : qui a lu, questionné, répondu — jamais le texte.
    const reportingSel = { select: { type: true, mois: true } } as const;
    const [lecturesReporting, questionsReporting] = await Promise.all([
      this.prisma.lectureReporting.findMany({ where: { luLe: dans, reporting: { societeId: S } }, include: { reporting: reportingSel } }),
      this.prisma.questionReporting.findMany({
        where: { reporting: { societeId: S }, OR: [{ creeLe: dans }, { reponduLe: dans }] },
        select: { id: true, auteurId: true, creeLe: true, ordreJournal: true, reponduParId: true, reponduLe: true, ordreReponse: true, reporting: reportingSel },
      }),
    ]);
    const nomReporting = (r: { type: 'direction' | 'rh'; mois: string }) => `${titreReporting(r.type)} · ${moisFr(r.mois)}`;
    // Paramètres de rentabilité (lot 7) : valeur, date d'effet, motif — jamais un salaire.
    const [parametresRentabilite, numerotations, profils] = await Promise.all([
      this.prisma.parametreRentabilite.findMany({ where: { societeId: S, createdAt: dans } }),
      // Paramètres de facturation (lot 6) : format de numérotation, profil imprimé.
      this.prisma.numerotationFactures.findMany({ where: { societeId: S, createdAt: dans } }),
      // Toutes les versions : chacune se compare à la précédente (champs modifiés).
      this.prisma.profilFacturation.findMany({ where: { societeId: S, createdAt: { lt: jusque } }, orderBy: { createdAt: 'asc' } }),
    ]);
    const [demandesAvoir, clotures] = await Promise.all([
      this.prisma.demandeAvoir.findMany({
        where: { societeId: S, OR: [{ demandeLe: dans }, { decideLe: dans }] },
        include: { facture: { select: { numero: true, reference: true, emiseLe: true, estAvoir: true } } },
      }),
      this.prisma.journalCloture.findMany({ where: { societeId: S, createdAt: dans } }),
    ]);

    // Facture d'un paiement supprimé : sa référence, si elle existe encore.
    const facturesSupprimes = new Map(
      (
        await this.prisma.facture.findMany({
          where: { id: { in: [...new Set(supprimes.map((p) => p.factureId))] } },
          select: { id: true, numero: true, reference: true, emiseLe: true, estAvoir: true },
        })
      ).map((f) => [f.id, refFacture(f)]),
    );

    const lignes: (Omit<LigneAudit, 'par'> & { parId: string | null; ordre: bigint | null })[] = [
      ...comptes.map((e) => ({
        id: `compte:${e.id}`,
        le: e.createdAt, ordre: e.ordreJournal,
        categorie: 'comptes' as const,
        action: ACTIONS_COMPTE[e.type],
        detail: [nomDe(e.utilisateur), e.detail].filter(Boolean).join(' · '),
        parId: e.parId,
      })),
      ...droits.map((d) => ({
        id: `droit:${d.id}`,
        le: d.createdAt, ordre: d.ordreJournal,
        categorie: 'droits' as const,
        action: 'Droits modifiés',
        detail: `${d.roleNom} · ${d.module} : ${d.avant ? NIVEAUX[d.avant] : 'aucun'} → ${NIVEAUX[d.apres]}`,
        parId: d.parId,
      })),
      ...emises.map((f) => ({
        id: `facture:${f.id}`,
        le: f.emiseLe!, ordre: f.ordreEmission,
        categorie: 'finances' as const,
        action: f.estAvoir ? 'Avoir émis' : 'Facture émise',
        detail: `${refFacture(f) ?? 'sans numéro'} · ${fcfa(ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc)} TTC · ${f.libelle}`,
        parId: f.emiseParId,
      })),
      ...paiements.map((p) => ({
        id: `paiement:${p.id}`,
        le: p.creeLe, ordre: p.ordreJournal,
        categorie: 'finances' as const,
        action: 'Paiement enregistré',
        detail: `${fcfa(p.montant.toNumber())} · ${refFacture(p.facture) ?? 'facture sans numéro'} · versé le ${p.date.split('-').reverse().join('/')}`,
        parId: p.creeParId,
      })),
      ...supprimes.map((p) => ({
        id: `paiement-supprime:${p.id}`,
        le: p.supprimeLe, ordre: p.ordreJournal,
        categorie: 'finances' as const,
        action: 'Paiement supprimé',
        detail: [fcfa(p.montant.toNumber()), facturesSupprimes.get(p.factureId) ?? 'facture', p.motif ? `motif : ${p.motif}` : null].filter(Boolean).join(' · '),
        parId: p.supprimeParId,
      })),
      ...demandesAvoir.flatMap((d) => {
        const quoi = `${refFacture(d.facture) ?? 'facture'} · ${fcfa(d.montantTtc.toNumber())} TTC · ${LIBELLE_MOTIF_AVOIR[d.motif]} : ${d.commentaire}`;
        const lignesDemande = [];
        if (d.demandeLe >= de && d.demandeLe < jusque) {
          lignesDemande.push({ id: `avoir-demande:${d.id}`, le: d.demandeLe, ordre: d.ordreDemande, categorie: 'finances' as const, action: 'Avoir demandé', detail: quoi, parId: d.demandeParId });
        }
        // Décision du CEO (au-delà du seuil) ; en deçà, l'avoir émis suffit.
        if (d.decideParId && d.decideLe && d.decideLe >= de && d.decideLe < jusque) {
          lignesDemande.push({
            id: `avoir-decision:${d.id}`,
            le: d.decideLe, ordre: d.ordreDecision,
            categorie: 'finances' as const,
            action: d.statut === 'valide' ? 'Avoir validé par le CEO' : 'Avoir refusé par le CEO',
            detail: d.statut === 'refuse' ? `${quoi} · refus : ${d.motifRefus}` : quoi,
            parId: d.decideParId,
          });
        }
        return lignesDemande;
      }),
      ...lecturesReporting.map((l) => ({
        id: `reporting-lu:${l.id}`,
        le: l.luLe, ordre: l.ordreJournal,
        categorie: 'pilotage' as const,
        action: 'Reporting lu',
        detail: nomReporting(l.reporting),
        parId: l.lecteurId,
      })),
      ...questionsReporting.flatMap((q) => [
        ...(q.creeLe >= de && q.creeLe < jusque
          ? [{ id: `reporting-q:${q.id}`, le: q.creeLe, ordre: q.ordreJournal, categorie: 'pilotage' as const, action: 'Question sur un reporting', detail: nomReporting(q.reporting), parId: q.auteurId }]
          : []),
        ...(q.reponduLe && q.reponduLe >= de && q.reponduLe < jusque
          ? [{ id: `reporting-r:${q.id}`, le: q.reponduLe, ordre: q.ordreReponse, categorie: 'pilotage' as const, action: 'Réponse à une question', detail: nomReporting(q.reporting), parId: q.reponduParId }]
          : []),
      ]),
      ...parametresRentabilite.map((r) => {
        const def = PARAMETRES[r.cle as CleParametre];
        return {
          id: `rentabilite:${r.id}`,
          le: r.createdAt, ordre: r.ordreJournal,
          categorie: 'finances' as const,
          action: 'Paramètre de rentabilité modifié',
          detail: `${def?.libelle ?? r.cle} : ${r.valeur === null ? 'désactivé' : `${r.valeur} ${def?.unite ?? ''}`.trim()} dès ${moisFr(r.dateEffet.slice(0, 7))} · motif : ${r.motif}`,
          parId: r.parId,
        };
      }),
      ...numerotations.map((n) => ({
        id: `numerotation:${n.id}`,
        le: n.createdAt, ordre: n.ordreJournal,
        categorie: 'finances' as const,
        action: 'Numérotation des factures modifiée',
        detail: `prochain format : ${formaterNumero({ prefixe: n.prefixe, formatAnnee: n.formatAnnee as 'AAAA' | 'AA', separateur: n.separateur, chiffres: n.chiffres, numeroDepart: n.numeroDepart }, n.createdAt.getUTCFullYear(), n.numeroDepart)} · motif : ${n.motif}`,
        parId: n.parId,
      })),
      ...profils.flatMap((p, i) => {
        if (p.createdAt < de) return [];
        const avant = profils[i - 1];
        const changes = CHAMPS_PROFIL_AUDIT.filter(([c]) => !avant || String(avant[c] ?? '') !== String(p[c] ?? ''));
        const paiement = changes.some(([c]) => ['banque', 'rib', 'wave', 'orangeMoney'].includes(c));
        const confirme = p.confirmation === 'code' ? 'confirmé par code de double authentification' : p.confirmation === 'mot_de_passe' ? 'confirmé par mot de passe' : null;
        return [
          {
            id: `profil-facturation:${p.id}`,
            le: p.createdAt, ordre: p.ordreJournal,
            categorie: 'finances' as const,
            action: paiement ? 'Coordonnées de paiement des factures modifiées' : 'Profil de facturation modifié',
            detail: [avant ? changes.map(([, l]) => l).join(', ') || 'aucun champ modifié' : 'premier profil', confirme].filter(Boolean).join(' · '),
            parId: p.parId,
          },
        ];
      }),
      ...clotures.map((c) => ({
        id: `cloture:${c.id}`,
        le: c.createdAt, ordre: c.ordreJournal,
        categorie: 'finances' as const,
        action: c.action === 'cloture' ? 'Mois clôturé' : 'Mois rouvert',
        detail: [moisFr(c.mois), c.motif && `motif : ${c.motif}`].filter(Boolean).join(' · '),
        parId: c.parId,
      })),
      ...reglages.map((r) => ({
        id: `reglage:${r.id}`,
        le: r.createdAt, ordre: r.ordreJournal,
        categorie: 'reglages' as const,
        action: 'Réglage modifié',
        detail: `${r.libelle} · motif : ${r.motif}`,
        parId: r.parId,
      })),
      ...departs.map((d) => ({
        id: `depart:${d.id}`,
        le: d.archiveLe!, ordre: d.ordreArchivage,
        categorie: 'rh' as const,
        action: 'Départ enregistré',
        detail: [`${d.prenom} ${d.nom}`.trim(), d.poste].filter(Boolean).join(' · '),
        parId: d.archiveParId,
      })),
      ...paie.map((p) => ({
        id: `paie:${p.id}`,
        le: p.createdAt, ordre: p.ordreJournal,
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
        // Plus récent d'abord ; à horodatage égal, ordre réel des événements
        // (séquence commune posée par la base, cf. migration ordre_journal).
        .sort((x, y) => y.le.getTime() - x.le.getTime() || plusRecentDabord(x.ordre, y.ordre))
        .map(({ parId, ordre: _ordre, ...l }): LigneAudit => ({ ...l, par: parId ? (auteurs.get(parId) ?? 'compte supprimé') : null })),
    };
  }
}

// Ordre d'insertion décroissant ; un événement sans ordre (antérieur à la
// numérotation, ou données de test) ne précède jamais un événement numéroté.
function plusRecentDabord(a: bigint | null | undefined, b: bigint | null | undefined): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a === b ? 0 : a > b ? -1 : 1;
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
