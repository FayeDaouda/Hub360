import { Injectable } from '@nestjs/common';
import { todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import {
  attendVisa,
  etatCarte,
  etatTache,
  indexTaches,
  resumeEtape,
  type CarteSource,
  type EtatTache,
} from '../projets/gabarit/etats';
import { contexteDecision, type ContexteDecision } from '../projets/gabarit/suppleance';
import { collaborateurDuCompte, ROLE_CTO, type Decideur } from '../projets/gabarit/validation';
import { grantedExtension, isoDay, WITH_TASKS, type Actor, type ProjectWithTasks } from './project-query';

// États des projets ouverts selon la règle unique (cartes verrouillées,
// prolongations, visa DPLG) que la vue Projets, Production, Équipes et le
// reporting de la direction partagent (revue CTO, 22/10/2026) ; et la
// personne connectée face aux règles de décision du jour.
@Injectable()
export class ProjectStatesService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  async holidays(companyId: string) {
    return (await this.reglages.joursFeries([companyId])).get(companyId) ?? new Set<string>();
  }

  cardSources(p: ProjectWithTasks): CarteSource[] {
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
        valideeLe: isoDay(t.valideeLe),
        prolongeeJusquau: grantedExtension(t.prolongations),
        visaRequis: t.visaRequis,
        viseeLe: isoDay(t.visaLe),
        visaNonTrace: t.visaNonTrace,
      })),
    }));
  }

  // États des étapes, des cartes et des tâches d'un projet au jour donné.
  states(p: ProjectWithTasks, day: string, holidays: ReadonlySet<string>) {
    const sources = this.cardSources(p);
    const index = indexTaches(sources);
    const etatsCartes = new Map(p.cartes.map((c, i) => [c.id, etatCarte(sources[i], index)] as const));
    const etatsTaches = new Map<string, EtatTache>();
    const byStep = new Map<number, { tache: (typeof sources)[number]['taches'][number]; etat: EtatTache }[]>();
    p.cartes.forEach((c, i) => {
      c.taches.forEach((t, j) => {
        const etat = etatTache(
          sources[i].taches[j],
          etatsCartes.get(c.id)!,
          day,
          holidays,
          attendVisa(sources[i].taches[j], sources[i]),
        );
        etatsTaches.set(t.id, etat);
        byStep.set(c.etapeNumero, [...(byStep.get(c.etapeNumero) ?? []), { tache: sources[i].taches[j], etat }]);
      });
      if (!byStep.has(c.etapeNumero)) byStep.set(c.etapeNumero, []);
    });
    const etapes = [...byStep.entries()].sort(([a], [b]) => a - b).map(([n, e]) => resumeEtape(n, e));
    return { etapes, etatsCartes, etatsTaches };
  }

  // États de tous les projets ouverts de la société (Production, Équipes,
  // Mes tâches, reporting de la direction).
  async companyStates(companyId: string, day: string) {
    const [projects, holidays] = await Promise.all([
      this.prisma.projet.findMany({
        where: { societeId: companyId, ouvertLe: { not: null } },
        orderBy: { ouvertLe: 'asc' },
        include: WITH_TASKS,
      }),
      this.holidays(companyId),
    ]);
    return projects.map((p) => {
      const { etapes, etatsTaches } = this.states(p, day, holidays);
      return {
        id: p.id,
        code: p.code,
        etatsTaches,
        etapes: etapes.map((e) => {
          const cards = p.cartes.filter((c) => c.etapeNumero === e.numero);
          const validated = cards
            .flatMap((c) => c.taches.map((t) => isoDay(t.valideeLe)))
            .filter((d): d is string => !!d)
            .sort();
          return {
            ...e,
            libelle: cards[0]?.etapeLibelle ?? '',
            closeLe: e.etat === 'terminee' ? (validated.at(-1) ?? null) : null,
          };
        }),
      };
    });
  }

  // Personne connectée face aux règles du jour (suppléance, escalade au CTO).
  async decider(companyId: string, actor: Actor): Promise<{ decideur: Decideur; ctx: ContexteDecision }> {
    const [collaborateurId, ctx] = await Promise.all([
      collaborateurDuCompte(this.prisma, companyId, actor.userId),
      contexteDecision(this.prisma, companyId, todayIso()),
    ]);
    return { decideur: { role: actor.role, collaborateurId, ctoSupplee: ctx.ctoSupplee }, ctx };
  }

  // Tâche lue par les règles de décision : son assigné est-il l'Architecte DPLG ?
  ruleFor<T extends { assigneId: string | null }>(ctx: ContexteDecision, t: T) {
    return { ...t, assigneEstDplg: !!t.assigneId && ctx.dplgCollaborateurs.has(t.assigneId) };
  }

  // « Prénom Nom » des comptes actifs (« A ou B »), null s'il n'y en a aucun.
  async accountNames(ids: string[]): Promise<string | null> {
    if (!ids.length) return null;
    const u = await this.prisma.utilisateur.findMany({
      where: { id: { in: ids }, actif: true },
      select: { prenom: true, nom: true },
    });
    const names = u.map((x) => `${x.prenom} ${x.nom}`.trim()).filter(Boolean);
    return names.length ? names.join(' ou ') : null;
  }

  // Demandes de TS en attente sur ces projets, si la personne peut les trancher (CTO).
  async tsRequestsToDecide(companyId: string, decideur: Decideur, projectIds: string[]) {
    if (decideur.role !== ROLE_CTO && decideur.role !== 'societe_admin') return [];
    const requests = await this.prisma.demandeTs.findMany({
      where: { societeId: companyId, statut: 'a_valider', projetId: { in: projectIds } },
      orderBy: { demandeLe: 'asc' },
      include: { projet: { select: { code: true, client: { select: { nom: true } } } } },
    });
    const authors = await this.prisma.utilisateur.findMany({
      where: { id: { in: requests.map((d) => d.demandeParId).filter((x): x is string => !!x) } },
      select: { id: true, prenom: true, nom: true },
    });
    const names = new Map(authors.map((u) => [u.id, `${u.prenom} ${u.nom}`.trim()]));
    return requests.map((d) => ({
      id: d.id,
      projetId: d.projetId,
      code: d.projet.code,
      client: d.projet.client.nom,
      element: d.element,
      reprise: d.reprise,
      montantHt: d.montantHt.toNumber(),
      demandeLe: d.demandeLe,
      demandePar: d.demandeParId ? (names.get(d.demandeParId) ?? null) : null,
    }));
  }
}
