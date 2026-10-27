import { AlarmClock, AtSign, CalendarPlus, CheckCheck, Hourglass, RotateCcw } from 'lucide-react';
import type { KpiTile } from '@/components/ui/kpi';
import type { PillTone } from '@/components/ui/pill';
import { etatATraiter, etatEnRetard, type EtatTuile } from '@/lib/couleurs-etat';
import type { OpenProjectFile, OpenProjectsBoard } from './types';

// Tuiles et repères de la page Projets, calculés sans état (testés à part).

// Compteurs du Salarié : SES tâches et ses mentions (règles de Mes tâches,
// calculées au back).
export type EmployeeCounts = { reprises: number; retards: number; attente: number; mentions: number };

const isOpen = (statut: string) => statut !== 'validee' && statut !== 'non_necessaire';
const count = (v: number | undefined) => (v === undefined ? '…' : v);
const stateOf = (v: number | undefined, f: (x: number) => EtatTuile): EtatTuile => (v === undefined ? 'marque' : f(v));

// Étape ouverte à l'arrivée : celle de ma première tâche en cours, sinon la
// première étape pas finie (plutôt que 01, souvent déjà close).
export function defaultStep(file: OpenProjectFile): number {
  const mine = file.cartes.filter((c) => c.taches.some((t) => t.aMoi && isOpen(t.statut))).map((c) => c.etapeNumero);
  if (mine.length) return Math.min(...mine);
  return file.etapes.find((e) => e.faites < e.total)?.numero ?? file.etapes[0]?.numero ?? 1;
}

// Mes tâches encore ouvertes dans une étape (« 2 à moi » sur l'onglet).
export const myOpenTasksIn = (file: OpenProjectFile, step: number) =>
  file.cartes
    .filter((c) => c.etapeNumero === step)
    .reduce((n, c) => n + c.taches.filter((t) => t.aMoi && isOpen(t.statut)).length, 0);

// Tuiles du Salarié (revue 19/10/2026) : SES tâches et ses mentions — le
// total du projet l'alarmait à tort. Chacune ouvre « Mes tâches » filtré ;
// chef de cellule avec des remises en attente : « À valider par vous ».
export function employeeTiles(
  counts: EmployeeCounts | null,
  board: OpenProjectsBoard | null,
  slug: string,
  openFirstToReview: () => void,
): KpiTile[] {
  const link = (filter: string) => ({ type: 'link' as const, href: `/admin/${slug}/mes-taches?filtre=${filter}` });
  const toReview = board?.kpi.aValiderParVous.length ?? 0;
  return [
    {
      id: 'reprises',
      label: 'Mes tâches à reprendre',
      value: count(counts?.reprises),
      hint: 'renvoyées par votre N+1',
      icon: RotateCcw,
      state: stateOf(counts?.reprises, etatEnRetard),
      action: link('reprises'),
    },
    {
      id: 'retard',
      label: 'Mes tâches en retard',
      value: count(counts?.retards),
      hint: 'échéance dépassée',
      icon: AlarmClock,
      state: stateOf(counts?.retards, etatEnRetard),
      action: link('retards'),
    },
    {
      id: 'attente',
      label: 'Mes remises en attente',
      value: count(counts?.attente),
      hint: 'déposées chez votre N+1',
      icon: Hourglass,
      state: stateOf(counts?.attente, etatATraiter),
      action: link('attente'),
    },
    toReview > 0
      ? {
          id: 'a-valider',
          label: 'À valider par vous',
          value: toReview,
          hint: 'remises de votre cellule',
          icon: CheckCheck,
          state: etatATraiter(toReview),
          action: { type: 'dialog' as const, onClick: openFirstToReview },
        }
      : {
          id: 'mentions',
          label: 'Mentions à lire',
          value: count(counts?.mentions),
          hint: 'dans les fils des projets',
          icon: AtSign,
          state: stateOf(counts?.mentions, etatATraiter),
          action: link('mentions'),
        },
  ];
}

// Tuiles du tableau (couleur = sens, lib/couleurs-etat.ts) : ambre à
// traiter, rouge en retard (tâches, TS non acceptés), vert rien en attente.
export function boardTiles(
  board: OpenProjectsBoard | null,
  reviewer: boolean,
  employee: boolean,
  openFirstToReview: () => void,
): KpiTile[] {
  const k = board?.kpi;
  const toReview = k?.aValiderParVous.length;
  const reports = k ? (employee ? k.mentions : k.tsNonAcceptes + k.mentions) : undefined;
  return [
    reviewer
      ? {
          id: 'a-valider',
          label: 'À valider par vous',
          value: count(toReview),
          hint: 'jamais sa propre tâche · cliquer pour valider',
          icon: CheckCheck,
          state: stateOf(toReview, etatATraiter),
          ...(toReview ? { action: { type: 'dialog' as const, onClick: openFirstToReview } } : {}),
        }
      : {
          id: 'remises',
          label: 'Remises à valider',
          value: count(k?.remisesAValider),
          hint: 'tous projets · chef de team ou DPLG',
          icon: CheckCheck,
          state: stateOf(k?.remisesAValider, etatATraiter),
        },
    {
      id: 'retard',
      label: 'Tâches en retard',
      value: count(k?.tachesEnRetard),
      hint: 'échéance de référence dépassée',
      icon: Hourglass,
      state: stateOf(k?.tachesEnRetard, etatEnRetard),
    },
    {
      id: 'prolongations',
      label: 'Prolongations à décider',
      value: count(k?.prolongations),
      hint: 'le retard est qualifié par le chef de team ou le DPLG',
      icon: CalendarPlus,
      state: stateOf(k?.prolongations, etatATraiter),
    },
    {
      id: 'signalements',
      label: 'Signalements et mentions',
      value: count(reports),
      hint:
        employee || !k
          ? 'mises à jour à reporter, @mentions'
          : `${k.tsNonAcceptes} TS non accepté(s) · ${k.mentions} tâche(s)`,
      icon: AtSign,
      // TS au-delà du délai réglé = en retard ; mention ouverte = à traiter.
      state: !k ? 'marque' : !employee && k.tsNonAcceptes > 0 ? 'risque' : etatATraiter(k.mentions),
    },
  ];
}

// « F1 émise · projet ouvert », « F2 attend 02, 03, récépissé 04 »… La
// première facture en attente est mise en avant (maquette).
export function invoicePills(file: OpenProjectFile): { libelle: string; ton: PillTone }[] {
  let first = true;
  return (['F1', 'F2', 'F3'] as const).map((f) => {
    if (file.factures[f] === 'emise')
      return { libelle: f === 'F1' ? 'F1 émise · projet ouvert' : `${f} émise`, ton: 'succes' };
    const waits = f === 'F1' ? [] : file.attentes[f];
    const ton = first ? 'attention' : 'neutre';
    first = false;
    return { libelle: waits.length ? `${f} attend ${waits.join(', ')}` : `${f} à émettre`, ton };
  });
}

// « Cellule Archi 3 » est déjà nommée ; « GC-ARC-02 » (maquette) ne l'est pas.
export const cellLabel = (name: string) => (/^cellule\b/i.test(name) ? name : `Cellule ${name}`);
