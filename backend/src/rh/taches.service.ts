import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupeChecklistAvp,
  GroupeChecklistExecution,
  GroupeChecklistPermis,
  NotificationType,
  Prisma,
  SectionTache,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ROLE_N1_DIRECTION } from './demandes.service';
import { ouDossierDuCompte } from './mon-compte';
import { arrondi, etatTache, heuresTache, joursAbsents, manqueTache } from './regles-temps';
import { statsPerformances, statutTache } from './regles-taches';
import { chargerTachesAssignees, groupeConnu, SECTIONS_TACHES } from './taches-assignees';

type Acteur = { userId: string; societeId: string; role: string };
type Cle = { section: SectionTache; projetId: string; groupe: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const nomDe = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`.trim();
const libelleBloc = (k: Cle) =>
  SECTIONS_TACHES.find((s) => s.section === k.section)?.groupes.find((g) => g.groupe === k.groupe)?.libelle ?? k.groupe;

const RESPONSABLE = {
  select: { id: true, prenom: true, nom: true, utilisateurId: true, cellule: { select: { dispatcherId: true } } },
} as const;
const PROJET = { select: { id: true, code: true, programme: true, societeId: true, cellules: { select: { celluleId: true } } } } as const;

type BlocCharge = {
  debut: string | null;
  echeance: string | null;
  responsable: Prisma.CollaborateurGetPayload<typeof RESPONSABLE> | null;
  projet: Prisma.ProjetGetPayload<typeof PROJET>;
};

// N+1 du responsable d'un bloc — même chaîne que les absences (lot 2) : le
// chef de sa cellule, sinon (pas de cellule, pas de chef, ou chef lui-même)
// le Dir. GC de la société du projet.
function n1Du(resp: NonNullable<BlocCharge['responsable']>): { collaborateurId: string } | { role: string } {
  const chef = resp.cellule?.dispatcherId;
  return chef && chef !== resp.id ? { collaborateurId: chef } : { role: ROLE_N1_DIRECTION };
}

// RH · Remise et validation des tâches (lot 5c) + « Mes performances ».
@Injectable()
export class TachesService {
  private readonly log = new Logger('Taches');
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private reglages: ReglagesService,
  ) {}

  // --- Le salarié : ses tâches, leur temps et leur état de validation ----------
  async mesTaches(a: Acteur) {
    const jour = aujourdhui();
    const dossier = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      select: { collaborateurId: true, societeId: true, absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } } },
    });
    const collabId =
      dossier?.collaborateurId ??
      (await this.prisma.collaborateur.findFirst({ where: { utilisateurId: a.userId, societeId: a.societeId }, select: { id: true } }))?.id;
    const taches = collabId ? await chargerTachesAssignees(this.prisma, [collabId]) : [];
    const validations = taches.length
      ? await this.prisma.validationTache.findMany({
          where: { OR: taches.map((t) => ({ section: t.section, projetId: t.projetId, groupe: t.groupe })) },
        })
      : [];
    const societeId = dossier?.societeId ?? a.societeId;
    const feries = (await this.reglages.joursFeries([societeId])).get(societeId)!;
    const absents = joursAbsents((dossier?.absences ?? []).map((x) => ({ debut: x.dateDebut, fin: x.dateFin })), feries);

    const lignes = taches
      .map((t) => {
        const v = validations.find((x) => x.section === t.section && x.projetId === t.projetId && x.groupe === t.groupe) ?? null;
        const planifiee = !!t.debut && !!t.echeance;
        return {
          id: t.id,
          section: t.section,
          groupe: t.groupe,
          libelle: t.libelle,
          projetId: t.projetId,
          projetCode: t.projetCode,
          projetProgramme: t.projetProgramme,
          debut: t.debut,
          echeance: t.echeance,
          dureeStandard: t.heures,
          heuresImputees: planifiee ? arrondi(heuresTache(t, absents, { debut: t.debut!, fin: jour }, feries)) : 0,
          manque: manqueTache(t, absents, feries),
          etat: etatTache(t, jour),
          statut: statutTache(t, v, jour),
          remisLe: v?.remisLe ?? null,
          valideLe: v?.valideLe ?? null,
          renvoiMotif: v?.renvoyeLe && !v.remisLe && !v.valideLe ? v.renvoiMotif : null,
        };
      })
      .sort((x, y) => (x.echeance ?? '9999').localeCompare(y.echeance ?? '9999'));

    return { taches: lignes, stats: statsPerformances(lignes) };
  }

  // Statistiques d'une équipe (« Ma cellule ») : mêmes règles que « Mes
  // performances », sur les tâches de tous ses membres.
  async statsEquipe(collaborateurIds: string[]) {
    if (!collaborateurIds.length) return statsPerformances([]);
    const jour = aujourdhui();
    const taches = await chargerTachesAssignees(this.prisma, collaborateurIds);
    const validations = taches.length
      ? await this.prisma.validationTache.findMany({
          where: { OR: taches.map((t) => ({ section: t.section, projetId: t.projetId, groupe: t.groupe })) },
        })
      : [];
    return statsPerformances(
      taches.map((t) => {
        const v = validations.find((x) => x.section === t.section && x.projetId === t.projetId && x.groupe === t.groupe) ?? null;
        return { statut: statutTache(t, v, jour), echeance: t.echeance, remisLe: v?.remisLe ?? null };
      }),
    );
  }

  async remettre(a: Acteur, k: Cle) {
    const bloc = await this.bloc(k);
    if (bloc.responsable?.utilisateurId !== a.userId) {
      throw new ForbiddenException('Seul le responsable du bloc peut le remettre.');
    }
    const v = await this.prisma.validationTache.findUnique({ where: { section_projetId_groupe: k } });
    if (v?.valideLe) throw new ConflictException('Tâche déjà validée.');
    if (v?.remisLe) throw new ConflictException('Tâche déjà remise, en attente de validation.');
    const data = { remisLe: new Date(), remisParId: a.userId };
    await this.prisma.validationTache.upsert({ where: { section_projetId_groupe: k }, create: { ...k, ...data }, update: data });

    const resp = bloc.responsable;
    const n1 = n1Du(resp);
    const destinataires =
      'collaborateurId' in n1
        ? await this.prisma.collaborateur
            .findUnique({ where: { id: n1.collaborateurId }, select: { utilisateurId: true } })
            .then((c) => (c?.utilisateurId ? [c.utilisateurId] : []))
        : await this.comptesDuRole(n1.role, bloc.projet.societeId);
    await this.notifier(bloc, 'tache_remise', `${libelleBloc(k)} remis par ${nomDe(resp)} · à valider`, a.userId, destinataires);
    return this.mesTaches(a);
  }

  // --- Le N+1 : tâches remises qui l'attendent ---------------------------------
  async aValider(a: Acteur) {
    const enAttente = await this.prisma.validationTache.findMany({
      where: { remisLe: { not: null }, valideLe: null, projet: { societeId: a.societeId } },
      orderBy: { remisLe: 'asc' },
    });
    const maFiche = await this.ficheDe(a);
    const liste = [];
    for (const v of enAttente) {
      const bloc = await this.chargerBloc(v);
      if (!bloc?.responsable || !this.estN1(a, maFiche, bloc)) continue;
      liste.push({
        id: `${v.section}:${v.projetId}:${v.groupe}`,
        section: v.section,
        groupe: v.groupe,
        libelle: libelleBloc(v),
        projetId: v.projetId,
        projetCode: bloc.projet.code,
        projetProgramme: bloc.projet.programme,
        responsable: nomDe(bloc.responsable),
        debut: bloc.debut,
        echeance: bloc.echeance,
        remisLe: v.remisLe,
      });
    }
    return liste;
  }

  async decider(a: Acteur, k: Cle, corps: { decision: 'valider' | 'renvoyer'; motif?: string }) {
    const bloc = await this.bloc(k);
    const v = await this.prisma.validationTache.findUnique({ where: { section_projetId_groupe: k } });
    if (!v?.remisLe || v.valideLe) throw new ConflictException('Aucune remise en attente sur cette tâche.');
    if (!this.estN1(a, await this.ficheDe(a), bloc)) throw new ForbiddenException("Vous n'êtes pas le N+1 de cette tâche.");
    const motif = corps.motif?.trim() ?? '';
    if (corps.decision === 'renvoyer' && !motif) throw new BadRequestException('Motif du renvoi obligatoire.');

    await this.prisma.validationTache.update({
      where: { section_projetId_groupe: k },
      data:
        corps.decision === 'valider'
          ? { valideLe: new Date(), valideParId: a.userId }
          : { remisLe: null, remisParId: null, renvoyeLe: new Date(), renvoiMotif: motif },
    });
    const destinataire = bloc.responsable!.utilisateurId;
    await this.notifier(
      bloc,
      corps.decision === 'valider' ? 'tache_validee' : 'tache_renvoyee',
      corps.decision === 'valider' ? `${libelleBloc(k)} validé` : `${libelleBloc(k)} à reprendre : ${motif}`,
      a.userId,
      destinataire ? [destinataire] : [],
    );
    return this.aValider(a);
  }

  // --- internes -------------------------------------------------------------------
  private estN1(a: Acteur, maFiche: string | null, bloc: BlocCharge): boolean {
    if (!bloc.responsable || a.societeId !== bloc.projet.societeId) return false;
    if (a.role === 'societe_admin') return true;
    const n1 = n1Du(bloc.responsable);
    return 'collaborateurId' in n1 ? maFiche === n1.collaborateurId : a.role === n1.role;
  }

  private async ficheDe(a: Acteur): Promise<string | null> {
    const c = await this.prisma.collaborateur.findFirst({ where: { utilisateurId: a.userId, societeId: a.societeId }, select: { id: true } });
    return c?.id ?? null;
  }

  private async comptesDuRole(role: string, societeId: string): Promise<string[]> {
    const r = await this.prisma.utilisateurSocieteRole.findMany({ where: { societeId, role: { nom: role } }, select: { utilisateurId: true } });
    return [...new Set(r.map((x) => x.utilisateurId))];
  }

  // Bloc assigné (clé commune section + projet + groupe), 404 sinon.
  private async bloc(k: Cle): Promise<BlocCharge & { responsable: NonNullable<BlocCharge['responsable']> }> {
    if (!groupeConnu(k.section, k.groupe)) throw new NotFoundException('Tâche inconnue.');
    const bloc = await this.chargerBloc(k);
    if (!bloc?.responsable) throw new NotFoundException('Tâche introuvable ou non assignée.');
    return bloc as BlocCharge & { responsable: NonNullable<BlocCharge['responsable']> };
  }

  // `groupe` a été validé contre le gabarit de sa section (groupeConnu).
  private async chargerBloc(k: Cle): Promise<BlocCharge | null> {
    const select = { debut: true, echeance: true, responsable: RESPONSABLE };
    if (k.section === 'avant_projet') {
      const b = await this.prisma.blocChecklistAvp.findUnique({
        where: { avantProjetId_groupe: { avantProjetId: k.projetId, groupe: k.groupe as GroupeChecklistAvp } },
        select: { ...select, avantProjet: { select: { projet: PROJET } } },
      });
      return b && { debut: b.debut, echeance: b.echeance, responsable: b.responsable, projet: b.avantProjet.projet };
    }
    if (k.section === 'permis') {
      const b = await this.prisma.blocPermis.findUnique({
        where: { permisId_groupe: { permisId: k.projetId, groupe: k.groupe as GroupeChecklistPermis } },
        select: { ...select, permis: { select: { projet: PROJET } } },
      });
      return b && { debut: b.debut, echeance: b.echeance, responsable: b.responsable, projet: b.permis.projet };
    }
    return this.prisma.blocExecution.findUnique({
      where: { projetId_groupe: { projetId: k.projetId, groupe: k.groupe as GroupeChecklistExecution } },
      select: { ...select, projet: PROJET },
    });
  }

  // Best-effort : un échec de notification ne fait pas échouer l'action.
  private async notifier(bloc: BlocCharge, type: NotificationType, titre: string, parId: string, destinataireIds: string[]) {
    if (destinataireIds.length === 0) return;
    try {
      await this.notifications.pousser({
        societeId: bloc.projet.societeId,
        projet: { id: bloc.projet.id, code: bloc.projet.code, celluleIds: bloc.projet.cellules.map((c) => c.celluleId) },
        type,
        titre: `${titre} — ${bloc.projet.code}`,
        parId,
        destinataireIds,
      });
    } catch (e) {
      this.log.warn(`Notification non poussée : ${e instanceof Error ? e.message : e}`);
    }
  }
}
