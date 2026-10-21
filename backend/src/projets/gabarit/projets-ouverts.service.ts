import { Injectable, NotFoundException } from '@nestjs/common';
import { JalonFacture, Phase, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import type { Temps } from '../../reglages/gabarit';
import { alerteAvenant, refDevis, statutDevisEffectif } from '../../devis/domaine';
import { PHASES_PAR_CATEGORIE } from '../domaine/config';
import { dateDuJour, rangOuvre } from './calendrier';
import { estOuvert } from './fil';
import { contexteDecision, dateLivraison, type ContexteDecision } from './suppleance';
import { agitCommeDplg, collaborateurDuCompte, horsCircuit, perimetreProjets, peutDecider, peutQualifier, peutViser, ROLE_CTO, type Decideur } from './validation';
import { UNITE_TS } from './taches-projet.service';
import { chargeSurPeriode } from './charge';
import {
  attendVisa,
  attentesFactures,
  etatCarte,
  etatTache,
  indexTaches,
  resumeEtape,
  type CarteSource,
  type EtatTache,
} from './etats';

// Lecture des projets ouverts selon le gabarit (maquette « Projets » du
// boss) : liste, tuiles, et dossier d'un projet — étapes, cartes, tâches et
// leurs états dérivés du jour.

const HEURES_PAR_JOUR = 8;
const nom = (p: { prenom: string; nom: string } | null | undefined) => (p ? `${p.prenom} ${p.nom}` : null);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const AVEC_TACHES = {
  cartes: {
    orderBy: { ordre: 'asc' },
    include: {
      taches: {
        orderBy: { ordre: 'asc' },
        include: {
          assigne: { select: { id: true, prenom: true, nom: true, cellule: { select: { nom: true } } } },
          valideePar: { select: { prenom: true, nom: true } },
          prolongations: { orderBy: { demandeLe: 'desc' } },
          pieces: { orderBy: [{ version: 'asc' }, { createdAt: 'asc' }], select: { id: true, nom: true, version: true } },
          devisTs: { select: { id: true, statut: true, dateValidite: true, dateEnvoi: true, numero: true, codeDossier: true, rangDossier: true } },
        },
      },
    },
  },
} satisfies Prisma.ProjetInclude;

type ProjetAvecTaches = Prisma.ProjetGetPayload<{ include: typeof AVEC_TACHES }>;
type Acteur = { userId: string; role: string };

type Prolongations = ProjetAvecTaches['cartes'][number]['taches'][number]['prolongations'];
// Dernière prolongation accordée (date jusqu'à laquelle le retard est qualifié)
// et demande en attente de décision.
const prolongationAccordee = (l: Prolongations) => l.find((p) => p.decision === 'accordee')?.jusquau ?? null;
const prolongationEnAttente = (l: Prolongations) => l.find((p) => p.decision === null) ?? null;

const JALON_PAR_FACTURE: Record<'F1' | 'F2' | 'F3', JalonFacture> = { F1: 'signature', F2: 'avant_projet', F3: 'livraison' };

export type StatutChantier = 'conception' | 'chantier' | 'livre';
export function statutChantier(phase: Phase): StatutChantier {
  return phase === 'chantier' || phase === 'livre' ? phase : 'conception';
}

// Carte du gabarit dont les tâches sont dues 24 h après la visite sur site.
export const CARTE_RELEVES = 'releves_existants';

// Jour calendaire suivant (AAAA-MM-JJ), sans jours ouvrés ni fériés.
export function lendemain(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ProjetsOuvertsService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  async tableau(societeId: string, acteur: Acteur) {
    const { decideur, ctx } = await this.decideur(societeId, acteur);
    const projets = await this.prisma.projet.findMany({
      where: { societeId, ouvertLe: { not: null }, ...perimetreProjets(acteur.role, decideur.collaborateurId) },
      orderBy: { ouvertLe: 'asc' },
      include: {
        ...AVEC_TACHES,
        client: { select: { nom: true } },
        cellules: { include: { cellule: { select: { nom: true, dispatcherId: true } } } },
      },
    });
    const feries = await this.feries(societeId);
    const jour = aujourdhui();
    const resumes = projets.map((p) => {
      const { etapes } = this.etats(p, jour, feries);
      const somme = (cle: 'faites' | 'total' | 'enRetard') => etapes.reduce((s, e) => s + e[cle], 0);
      const rang = rangOuvre(p.ouvertLe!, jour, feries);
      const horizon = this.horizon(p.budgetHeures);
      return {
        id: p.id,
        code: p.code,
        client: p.client.nom,
        cellule: p.cellules[0]?.cellule.nom ?? null,
        jour: rang,
        horizon,
        faites: somme('faites'),
        total: somme('total'),
        enRetard: somme('enRetard'),
        // Jour de livraison franchi sans que le projet soit déclaré livré.
        livraisonDepassee: rang > horizon && statutChantier(p.phase) !== 'livre',
      };
    });
    const taches = projets.flatMap((p) => p.cartes.flatMap((c) => c.taches));
    return {
      // En-tête de la page : gabarit et budget atelier en service (Réglages).
      gabarit: 'GC-CONCEPTION',
      budgetHeures: await this.reglages.regle<number>(societeId, 'budget_atelier_heures'),
      projets: resumes,
      kpi: {
        remisesAValider: taches.filter((t) => t.statut === 'a_valider').length,
        // Remises que la personne connectée peut trancher (jamais les siennes).
        aValiderParVous: projets.flatMap((p) =>
          p.cartes.flatMap((c) =>
            c.taches
              .filter((t) => peutDecider(decideur, this.regle(ctx, t), p.cellules[0]?.cellule.dispatcherId ?? null))
              .map((t) => ({ projetId: p.id, tacheId: t.id })),
          ),
        ),
        tachesEnRetard: resumes.reduce((s, r) => s + r.enRetard, 0),
        // Demandes de prolongation en attente de décision (projets visibles).
        prolongations: taches.filter((t) => prolongationEnAttente(t.prolongations)).length,
        tsNonAcceptes: await this.tsNonAcceptes(societeId, projets.map((p) => p.id), jour),
        mentions: await this.mentionsOuvertes(projets.map((p) => p.id)),
      },
    };
  }

  // « À décider » (revue Dir. GC, 21/10/2026) : sur tous les projets visibles,
  // les remises et les demandes de prolongation que la personne connectée peut
  // trancher — mêmes règles que les boutons (peutDecider, peutQualifier).
  async aDecider(societeId: string, acteur: Acteur) {
    const { decideur, ctx } = await this.decideur(societeId, acteur);
    const feries = await this.feries(societeId);
    const projets = await this.prisma.projet.findMany({
      where: { societeId, ouvertLe: { not: null }, ...perimetreProjets(acteur.role, decideur.collaborateurId) },
      include: { ...AVEC_TACHES, client: { select: { nom: true } }, cellules: { include: { cellule: { select: { dispatcherId: true } } } } },
    });
    const lignes = projets.flatMap((p) => {
      const chefId = p.cellules[0]?.cellule.dispatcherId ?? null;
      return p.cartes.flatMap((c) => c.taches.map((t) => ({ p, c, t, chefId })));
    });
    const remises = lignes.filter(({ t, chefId }) => peutDecider(decideur, this.regle(ctx, t), chefId));
    const prolongations = lignes
      .map((l) => {
        const demande = prolongationEnAttente(l.t.prolongations);
        const livraison = dateLivraison(l.p, feries);
        return { ...l, demande, repousse: !!demande && !!livraison && demande.jusquau > livraison, livraison };
      })
      .filter(({ t, chefId, demande, repousse }) => demande && peutQualifier(decideur, this.regle(ctx, t), chefId, repousse));
    // Visas DPLG à apposer (l'architecte DPLG seul).
    const visas = peutViser(acteur.role) ? lignes.filter(({ t }) => t.statut === 'validee' && t.visaRequis && !t.visaLe) : [];
    // Date de la dernière remise de chaque tâche à valider.
    const evenements = await this.prisma.evenementTacheProjet.findMany({
      where: { type: 'remise', tacheId: { in: remises.map((r) => r.t.id) } },
      orderBy: { creeLe: 'desc' },
      select: { tacheId: true, creeLe: true },
    });
    const remiseLe = new Map<string, Date>();
    for (const e of evenements) if (!remiseLe.has(e.tacheId)) remiseLe.set(e.tacheId, e.creeLe);
    const commun = ({ p, c, t }: (typeof lignes)[number]) => ({
      projetId: p.id,
      code: p.code,
      client: p.client.nom,
      tacheId: t.id,
      tache: t.libelle,
      carte: c.libelle,
      assigne: t.assigne ? `${t.assigne.prenom} ${t.assigne.nom}`.trim() : null,
    });
    return {
      remises: remises.map((l) => ({ ...commun(l), version: l.t.version, remiseLe: remiseLe.get(l.t.id) ?? null })),
      prolongations: prolongations.map((l) => ({
        ...commun(l),
        jusquau: l.demande!.jusquau,
        motif: l.demande!.motif,
        demandeLe: l.demande!.demandeLe,
        finPrevue: l.t.finLe,
        // Escalade au CTO : la nouvelle date dépasse la livraison du projet.
        repousseLivraison: l.repousse ? l.livraison : null,
      })),
      visas: visas.map((l) => ({ ...commun(l), valideeLe: l.t.valideeLe })),
      // TS au-delà du seuil, demandés par le Dir. GC : au CTO de trancher.
      ts: await this.demandesTsADecider(societeId, decideur, projets.map((p) => p.id)),
    };
  }

  // Statut simple « En conception / En chantier / Livré » (décision du
  // 14/10/2026) porté par Projet.phase : la facturation mensuelle SU/EX s'y
  // fie (« à facturer ce mois » en chantier). Revenir en conception remet la
  // première phase de la catégorie.
  async definirStatutChantier(societeId: string, projetId: string, statut: StatutChantier) {
    const p = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId, ouvertLe: { not: null } },
      select: { id: true, categorie: true },
    });
    if (!p) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const phase: Phase = statut === 'conception' ? PHASES_PAR_CATEGORIE[p.categorie][0] : statut;
    await this.prisma.projet.update({ where: { id: projetId }, data: { phase } });
    return { statutChantier: statut };
  }

  // Date de visite sur site : la carte « Relevés existants » et ses tâches
  // reçoivent leur fenêtre — du jour de la visite au lendemain (24 h
  // calendaires, week-end compris : règle du gabarit). Effacer la date
  // retire l'échéance.
  async definirDateVisite(societeId: string, projetId: string, date: string | null) {
    const p = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId, ouvertLe: { not: null } },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const fenetre = { debutLe: date, finLe: date ? lendemain(date) : null };
    await this.prisma.$transaction([
      this.prisma.projet.update({ where: { id: projetId }, data: { dateVisiteSite: date } }),
      this.prisma.carteProjet.updateMany({ where: { projetId, cle: CARTE_RELEVES }, data: fenetre }),
      this.prisma.tacheProjet.updateMany({ where: { projetId, carte: { cle: CARTE_RELEVES } }, data: fenetre }),
    ]);
    return { dateVisiteSite: date };
  }

  async dossier(societeId: string, projetId: string, acteur: Acteur) {
    const { decideur, ctx } = await this.decideur(societeId, acteur);
    const p = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId, ouvertLe: { not: null }, ...perimetreProjets(acteur.role, decideur.collaborateurId) },
      include: {
        ...AVEC_TACHES,
        client: { select: { nom: true, type: true } },
        cellules: {
          include: {
            cellule: {
              include: {
                dispatcher: {
                  select: { id: true, prenom: true, nom: true, utilisateur: { select: { actif: true } }, dossierPersonnel: { select: { utilisateur: { select: { actif: true } } } } },
                },
              },
            },
          },
        },
        gabaritVersion: { select: { code: true, libelle: true } },
        factures: { where: { estAvoir: false, statut: { not: 'annulee' } }, select: { jalon: true, statut: true } },
        devis: { where: { statut: 'transforme' }, select: { numero: true, dateEnvoi: true, codeDossier: true, rangDossier: true }, take: 1 },
        societe: { select: { contratSignataireNom: true } },
      },
    });
    if (!p) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const feries = await this.feries(societeId);
    const jour = aujourdhui();
    const { etapes, etatsCartes, etatsTaches } = this.etats(p, jour, feries);
    const cellule = p.cellules[0]?.cellule ?? null;
    const chef = cellule?.dispatcher ?? null;
    // « Ajouter en TS » : l'Architecte DPLG (ou son suppléant) et le CTO.
    const dplgConnecte = agitCommeDplg(decideur) || acteur.role === ROLE_CTO;
    const livraisonLe = dateLivraison(p, feries);
    // Remise et demande de prolongation : jamais pour un rôle hors circuit (CEO).
    const circuit = !horsCircuit(acteur.role);
    const dplg = p.societe.contratSignataireNom?.trim() || null;
    const pilote = await this.reglages.regle<string>(societeId, 'pilote_etudes');
    const horizon = this.horizon(p.budgetHeures);
    // Nombre de messages par fil (« Fil de la carte · N », bulle d'une tâche).
    const fils = await this.prisma.commentaireProjet.groupBy({ by: ['carteId', 'tacheId'], where: { projetId: p.id }, _count: true });
    // Auteurs des visas DPLG apposés (nom affiché sous la tâche).
    const viseurs = new Map(
      (
        await this.prisma.utilisateur.findMany({
          where: { id: { in: p.cartes.flatMap((c) => c.taches.map((t) => t.visaParId)).filter((x): x is string => !!x) } },
          select: { id: true, prenom: true, nom: true },
        })
      ).map((u) => [u.id, nom(u)]),
    );
    const filDe = (carteId: string, tacheId: string | null) =>
      fils.find((f) => f.carteId === carteId && f.tacheId === tacheId)?._count ?? 0;

    // Validation (maquette) : sans temps atelier, le dépôt du justificatif vaut
    // validation ; sinon le chef de team, et l'Architecte DPLG quand la tâche
    // est celle du chef de team.
    const validation = (temps: Temps, assigneId: string | null) =>
      temps.type === 'sans'
        ? { mode: 'depot' as const }
        : assigneId && ctx.dplgCollaborateurs.has(assigneId)
          ? { mode: 'personne' as const, nom: null, role: 'travail du Dir. GC : CTO' }
          : chef && assigneId !== chef.id && (ctx.collaborateursAbsents.has(chef.id) || (!chef.utilisateur?.actif && !chef.dossierPersonnel?.utilisateur?.actif))
            ? // Chef sans compte HUB ou absent : la remise remonte à l'Architecte DPLG.
              { mode: 'personne' as const, nom: dplg, role: `${nom(chef)} ${ctx.collaborateursAbsents.has(chef.id) ? 'absent' : 'sans compte HUB'} : Architecte DPLG` }
            : chef && assigneId === chef.id
          ? { mode: 'personne' as const, nom: dplg, role: 'tâche du chef de team : Architecte DPLG' }
          : { mode: 'personne' as const, nom: nom(chef), role: 'chef de team' };

    const facture = (f: 'F1' | 'F2' | 'F3') => {
      const fs = p.factures.filter((x) => x.jalon === JALON_PAR_FACTURE[f]);
      return fs.some((x) => x.statut === 'emise') ? 'emise' : fs.length ? 'brouillon' : 'absente';
    };

    return {
      id: p.id,
      code: p.code,
      client: { nom: p.client.nom, type: p.client.type },
      cellule: cellule ? { nom: cellule.nom, chef: nom(chef) } : null,
      // La personne connectée pilote la cellule du projet (elle valide).
      jeSuisChef: !!chef && !!decideur.collaborateurId && chef.id === decideur.collaborateurId,
      pilote: pilote === 'head_of_engineering' ? 'Head of Engineering (à recruter)' : dplg ?? 'Architecte DPLG',
      version: p.gabaritVersion,
      offre: p.devis[0] ? refDevis(p.devis[0]) : null,
      ouvertLe: p.ouvertLe,
      livraisonLe: dateDuJour(p.ouvertLe!, horizon, feries),
      jour: rangOuvre(p.ouvertLe!, jour, feries),
      horizon,
      budgetHeures: p.budgetHeures,
      dateVisiteSite: p.dateVisiteSite,
      statutChantier: statutChantier(p.phase),
      factures: { F1: facture('F1'), F2: facture('F2'), F3: facture('F3') },
      // « Ajouter en TS » (Architecte DPLG) : cartes « par unité » actives.
      optionsTs: dplgConnecte
        ? p.cartes.flatMap((c) => {
            const t = c.temps as Temps | null;
            return t?.type === 'par_unite' && !c.desactivation ? [{ carteId: c.id, libelle: UNITE_TS[t.unite], heures: t.heures }] : [];
          })
        : [],
      attentes: attentesFactures(etapes, this.sources(p)),
      etapes: etapes.map((e) => {
        const c = p.cartes.find((x) => x.etapeNumero === e.numero)!;
        return { ...e, cle: c.etapeCle, libelle: c.etapeLibelle };
      }),
      cartes: p.cartes.map((c) => ({
        id: c.id,
        etapeNumero: c.etapeNumero,
        etapeLibelle: c.etapeLibelle,
        cle: c.cle,
        libelle: c.libelle,
        note: c.note,
        descriptif: c.descriptif,
        etiquette: c.etiquette,
        debutJ: c.debutJ,
        finJ: c.finJ,
        debutLe: c.debutLe,
        finLe: c.finLe,
        temps: c.temps as Temps | null,
        client: c.client,
        fichiers: c.fichiers,
        fil: filDe(c.id, null),
        etat: etatsCartes.get(c.id)!,
        taches: c.taches.map((t) => ({
          id: t.id,
          cle: t.cle,
          libelle: t.libelle,
          descriptif: t.descriptif,
          sourceNative: t.sourceNative,
          debutJ: t.debutJ,
          finJ: t.finJ,
          debutLe: t.debutLe,
          finLe: t.finLe,
          temps: t.temps as Temps,
          heures: t.heures === null ? null : Number(t.heures),
          statut: t.statut,
          motif: t.motif,
          version: t.version,
          // Fichiers de chaque remise (v01, v02…), sans leur contenu.
          pieces: t.pieces,
          // Élément TS : devis d'avenant qui le facture et son état.
          avenant: t.devisTs ? { devisId: t.devisTs.id, reference: refDevis(t.devisTs), statut: statutDevisEffectif(t.devisTs, jour) } : null,
          valideeLe: iso(t.valideeLe),
          valideePar: nom(t.valideePar),
          // Visa DPLG exigé : apposé le… par… (null tant qu'il ne l'est pas).
          visa: t.visaRequis ? { le: iso(t.visaLe), par: t.visaParId ? (viseurs.get(t.visaParId) ?? null) : null } : null,
          // L'architecte DPLG (Dir. GC, ou un autre Dir. GC en suppléance —
          // jamais le CTO : le visa engage la signature de l'architecte).
          peutViser: peutViser(acteur.role) && t.statut === 'validee' && t.visaRequis && !t.visaLe,
          assigne: t.assigne ? { id: t.assigne.id, nom: nom(t.assigne)!, cellule: t.assigne.cellule?.nom ?? null } : null,
          // Assignée à la personne connectée (« Seulement mes tâches »).
          aMoi: !!decideur.collaborateurId && t.assigneId === decideur.collaborateurId,
          validation: validation(t.temps as Temps, t.assigneId),
          peutDecider: peutDecider(decideur, this.regle(ctx, t), chef?.id ?? null),
          prolongation: {
            enAttente: (() => {
              const p = prolongationEnAttente(t.prolongations);
              return p ? { jusquau: p.jusquau, motif: p.motif, le: iso(p.demandeLe) } : null;
            })(),
            accordeeJusquau: prolongationAccordee(t.prolongations),
          },
          // Prolongation : l'assigné la demande (tâche ni validée ni « non
          // nécessaire », aucune demande en attente) ; chef de team ou DPLG décide.
          peutDemanderProlongation:
            circuit &&
            !!decideur.collaborateurId &&
            t.assigneId === decideur.collaborateurId &&
            !['validee', 'non_necessaire'].includes(t.statut) &&
            !c.desactivation &&
            !prolongationEnAttente(t.prolongations),
          peutDeciderProlongation: (() => {
            const d = prolongationEnAttente(t.prolongations);
            return !!d && peutQualifier(decideur, this.regle(ctx, t), chef?.id ?? null, !!livraisonLe && d.jusquau > livraisonLe);
          })(),
          // Remise par la personne assignée, carte ouverte (ni désactivée ni verrouillée).
          peutRemettre:
            circuit &&
            !!decideur.collaborateurId &&
            t.assigneId === decideur.collaborateurId &&
            (t.statut === 'a_faire' || t.statut === 'reprise') &&
            etatsCartes.get(c.id)!.code === 'ouverte',
          fil: filDe(c.id, t.id),
          etat: etatsTaches.get(t.id)!,
        })),
      })),
    };
  }

  // Ce qui demande l'attention de la direction (accueil du CEO, Pilotage) —
  // mêmes états que la vue Projets : tâches en retard par projet ouvert (dont
  // retards qualifiés par une prolongation), tranches F1 à F3 prêtes et pas
  // encore émises, avenants TS non acceptés au-delà du délai réglé.
  async alertes(societeId: string) {
    const jour = aujourdhui();
    const [projets, nonOuverts, feries, seuilTs] = await Promise.all([
      this.prisma.projet.findMany({
        where: { societeId, ouvertLe: { not: null } },
        orderBy: { ouvertLe: 'asc' },
        include: {
          ...AVEC_TACHES,
          client: { select: { nom: true } },
          factures: { where: { estAvoir: false, statut: { not: 'annulee' } }, select: { id: true, jalon: true, statut: true } },
        },
      }),
      // F1 émise = projet ouvert : un projet signé dont F1 attend encore.
      this.prisma.projet.findMany({
        where: { societeId, ouvertLe: null, factures: { some: { jalon: 'signature', statut: 'brouillon', estAvoir: false } } },
        select: {
          id: true,
          code: true,
          client: { select: { nom: true } },
          factures: { where: { jalon: 'signature', statut: 'brouillon', estAvoir: false }, select: { id: true }, take: 1 },
        },
      }),
      this.feries(societeId),
      this.reglages.regle<number>(societeId, 'alerte_avenant_jours'),
    ]);
    const devisTs = await this.prisma.devis.findMany({
      where: { societeId, projetId: { in: projets.map((p) => p.id) }, statut: 'envoye' },
      select: {
        id: true,
        projetId: true,
        statut: true,
        dateValidite: true,
        dateEnvoi: true,
        lignes: { orderBy: { ordre: 'asc' }, select: { designation: true, produitService: { select: { famille: true } } } },
      },
    });

    const retards: { projetId: string; code: string; client: string; enRetard: number; prolongees: number; joursMax: number }[] = [];
    const tranches: { projetId: string; code: string; client: string; tranche: 'F1' | 'F2' | 'F3'; factureId: string | null }[] = nonOuverts.map((p) => ({
      projetId: p.id,
      code: p.code,
      client: p.client.nom,
      tranche: 'F1' as const,
      factureId: p.factures[0]?.id ?? null,
    }));
    for (const p of projets) {
      const { etapes, etatsTaches } = this.etats(p, jour, feries);
      const etats = [...etatsTaches.values()];
      const enRetard = etats.filter((e) => e.code === 'en_retard').length;
      const prolongees = etats.filter((e) => e.code === 'prolongee').length;
      if (enRetard || prolongees) {
        const joursMax = Math.max(...etats.map((e) => (e.code === 'en_retard' ? e.jours : 0)));
        retards.push({ projetId: p.id, code: p.code, client: p.client.nom, enRetard, prolongees, joursMax });
      }
      const attentes = attentesFactures(etapes, this.sources(p));
      for (const f of ['F2', 'F3'] as const) {
        const fs = p.factures.filter((x) => x.jalon === JALON_PAR_FACTURE[f]);
        if (attentes[f].length || fs.some((x) => x.statut === 'emise')) continue;
        tranches.push({ projetId: p.id, code: p.code, client: p.client.nom, tranche: f, factureId: fs[0]?.id ?? null });
      }
    }
    const codeDe = new Map(projets.map((p) => [p.id, p.code]));
    const ts = devisTs.flatMap((d) => {
      const alerte = alerteAvenant({ ...d, familles: d.lignes.map((l) => l.produitService?.famille ?? null) }, jour, seuilTs);
      if (!alerte) return [];
      const designations = d.lignes.filter((l) => l.produitService?.famille === 'TS').map((l) => l.designation);
      return [{ devisId: d.id, projetId: d.projetId!, code: codeDe.get(d.projetId!) ?? '—', objet: designations.join(' · '), jours: alerte.jours, seuil: alerte.seuil }];
    });
    return { retards, tranches, ts };
  }

  // --- internes -----------------------------------------------------------------------
  private horizon(budgetHeures: number | null) {
    return Math.max(1, Math.round((budgetHeures ?? 320) / HEURES_PAR_JOUR));
  }

  // Charge prévisionnelle de chaque personne assignable sur la fenêtre de la
  // tâche (avant d'assigner), et la zone normale fixée dans Réglages.
  async charges(societeId: string, projetId: string, tacheId: string) {
    const tache = await this.prisma.tacheProjet.findFirst({
      where: { id: tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: { id: true, debutLe: true, finLe: true, heures: true },
    });
    if (!tache) throw new NotFoundException('Tâche introuvable');
    const zone = await this.reglages.regle<{ de: number; a: number } | null>(societeId, 'objectif_charge_equipes');
    if (!tache.debutLe || !tache.finLe || tache.debutLe > tache.finLe) return { periode: null, zone, charges: [] };
    const p = { debut: tache.debutLe, fin: tache.finLe };
    const [collaborateurs, feries] = await Promise.all([
      this.prisma.collaborateur.findMany({
        where: { societeId },
        select: {
          id: true,
          // Tâches encore à faire qui touchent la fenêtre (les validées sont livrées).
          tachesProjet: {
            where: { id: { not: tacheId }, statut: { in: ['a_faire', 'a_valider', 'reprise'] }, debutLe: { lte: p.fin }, finLe: { gte: p.debut } },
            select: { id: true, debutLe: true, finLe: true, heures: true },
          },
          dossierPersonnel: {
            select: { absences: { where: { statut: 'validee', dateDebut: { lte: p.fin }, dateFin: { gte: p.debut } }, select: { dateDebut: true, dateFin: true } } },
          },
        },
      }),
      this.feries(societeId),
    ]);
    const versTache = (t: { id: string; debutLe: string | null; finLe: string | null; heures: Prisma.Decimal | null }) => ({
      id: t.id,
      debut: t.debutLe,
      echeance: t.finLe,
      heures: t.heures == null ? null : Number(t.heures),
    });
    return {
      periode: p,
      zone,
      charges: collaborateurs.map((c) => ({
        collaborateurId: c.id,
        ...chargeSurPeriode(
          p,
          c.tachesProjet.map(versTache),
          versTache(tache),
          (c.dossierPersonnel?.absences ?? []).map((a) => ({ debut: a.dateDebut, fin: a.dateFin })),
          feries,
        ),
      })),
    };
  }

  // Personne connectée face aux règles du jour (suppléance, escalade au CTO).
  private async decideur(societeId: string, acteur: Acteur): Promise<{ decideur: Decideur; ctx: ContexteDecision }> {
    const [collaborateurId, ctx] = await Promise.all([
      collaborateurDuCompte(this.prisma, societeId, acteur.userId),
      contexteDecision(this.prisma, societeId, aujourdhui()),
    ]);
    return { decideur: { role: acteur.role, collaborateurId, ctoSupplee: ctx.ctoSupplee }, ctx };
  }

  private regle<T extends { assigneId: string | null }>(ctx: ContexteDecision, t: T) {
    return { ...t, assigneEstDplg: !!t.assigneId && ctx.dplgCollaborateurs.has(t.assigneId) };
  }

  // Demandes de TS en attente sur ces projets, si la personne peut les trancher (CTO).
  private async demandesTsADecider(societeId: string, decideur: Decideur, projetIds: string[]) {
    if (decideur.role !== ROLE_CTO && decideur.role !== 'societe_admin') return [];
    const demandes = await this.prisma.demandeTs.findMany({
      where: { societeId, statut: 'a_valider', projetId: { in: projetIds } },
      orderBy: { demandeLe: 'asc' },
      include: { projet: { select: { code: true, client: { select: { nom: true } } } } },
    });
    const auteurs = await this.prisma.utilisateur.findMany({
      where: { id: { in: demandes.map((d) => d.demandeParId).filter((x): x is string => !!x) } },
      select: { id: true, prenom: true, nom: true },
    });
    const noms = new Map(auteurs.map((u) => [u.id, `${u.prenom} ${u.nom}`.trim()]));
    return demandes.map((d) => ({
      id: d.id,
      projetId: d.projetId,
      code: d.projet.code,
      client: d.projet.client.nom,
      element: d.element,
      reprise: d.reprise,
      montantHt: d.montantHt.toNumber(),
      demandeLe: d.demandeLe,
      demandePar: d.demandeParId ? (noms.get(d.demandeParId) ?? null) : null,
    }));
  }

  private async feries(societeId: string) {
    return (await this.reglages.joursFeries([societeId])).get(societeId) ?? new Set<string>();
  }

  private sources(p: ProjetAvecTaches): CarteSource[] {
    return p.cartes.map((c) => ({
      cle: c.cle,
      etapeNumero: c.etapeNumero,
      etapeCle: c.etapeCle,
      fichiers: c.fichiers,
      desactivation: c.desactivation,
      ouvreApres: c.ouvreApres,
      taches: c.taches.map((t) => ({
        cle: t.cle,
        libelle: t.libelle,
        statut: t.statut,
        debutLe: t.debutLe,
        finLe: t.finLe,
        version: t.version,
        valideeLe: iso(t.valideeLe),
        prolongeeJusquau: prolongationAccordee(t.prolongations),
        visaRequis: t.visaRequis,
        viseeLe: iso(t.visaLe),
      })),
    }));
  }

  private etats(p: ProjetAvecTaches, jour: string, feries: ReadonlySet<string>) {
    const sources = this.sources(p);
    const index = indexTaches(sources);
    const etatsCartes = new Map(p.cartes.map((c, i) => [c.id, etatCarte(sources[i], index)] as const));
    const etatsTaches = new Map<string, EtatTache>();
    const parEtape = new Map<number, { tache: (typeof sources)[number]['taches'][number]; etat: EtatTache }[]>();
    p.cartes.forEach((c, i) => {
      c.taches.forEach((t, j) => {
        const etat = etatTache(sources[i].taches[j], etatsCartes.get(c.id)!, jour, feries, attendVisa(sources[i].taches[j], sources[i]));
        etatsTaches.set(t.id, etat);
        parEtape.set(c.etapeNumero, [...(parEtape.get(c.etapeNumero) ?? []), { tache: sources[i].taches[j], etat }]);
      });
      if (!parEtape.has(c.etapeNumero)) parEtape.set(c.etapeNumero, []);
    });
    const etapes = [...parEtape.entries()].sort(([a], [b]) => a - b).map(([n, e]) => resumeEtape(n, e));
    return { etapes, etatsCartes, etatsTaches };
  }

  // Tâches (ou cartes) dont un commentaire attend la réponse d'une personne
  // mentionnée (tuile « Signalements et mentions » : « N tâche(s) »).
  private async mentionsOuvertes(projetIds: string[]) {
    if (!projetIds.length) return 0;
    const racines = await this.prisma.commentaireProjet.findMany({
      where: { projetId: { in: projetIds }, parentId: null, mentionneId: { not: null }, resoluLe: null },
      select: { carteId: true, tacheId: true, mentionneId: true, resoluLe: true, _count: { select: { reponses: true } } },
    });
    const ouvertes = racines.filter((r) => estOuvert({ ...r, reponses: r._count.reponses }));
    return new Set(ouvertes.map((r) => r.tacheId ?? r.carteId)).size;
  }

  // Avenants (TS) envoyés et non acceptés au-delà du délai réglé.
  private async tsNonAcceptes(societeId: string, projetIds: string[], jour: string) {
    if (!projetIds.length) return 0;
    const [seuil, devis] = await Promise.all([
      this.reglages.regle<number>(societeId, 'alerte_avenant_jours'),
      this.prisma.devis.findMany({
        where: { societeId, projetId: { in: projetIds }, statut: 'envoye' },
        select: { projetId: true, statut: true, dateValidite: true, dateEnvoi: true, lignes: { select: { produitService: { select: { famille: true } } } } },
      }),
    ]);
    return devis.filter((d) => alerteAvenant({ ...d, familles: d.lignes.map((l) => l.produitService?.famille ?? null) }, jour, seuil)).length;
  }
}
