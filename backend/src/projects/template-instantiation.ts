import type { ContenuGabarit, Fenetre, TacheGabarit, Temps } from '../reglages/gabarit';
import { arrondi, type Feries } from '../rh/regles-temps';
import { dateOfDay } from './work-calendar';

// Ouverture d'un projet : la version en service du gabarit est recopiée en
// cartes et tâches, fenêtres converties en dates (délais figés). Règles de
// la maquette « Projets » appliquées à la copie, sans rien déduire d'autre :
//  - NINEA : « Client personne physique (CRM) : sans objet » ;
//  - Autorisation de construire : « SPC non commandé au devis » ;
//  - équipements : le temps « au total » de la carte se partage à parts égales
//    entre les tâches nécessaires ;
//  - charges GC (notice, cachet, timbre) : durées des Règles et délais.

export type GcCharges = Record<'Notice' | 'Cachet' | 'Timbre', number>;

export type OpeningContext = {
  day1: string;
  holidays: Feries;
  gcCharges: GcCharges;
  spcOrdered: boolean; // ligne SPC dans l'offre acceptée
  individualClient: boolean;
};

export type InstantiatedTask = {
  cle: string;
  libelle: string;
  ordre: number;
  descriptif: string | null;
  sourceNative: boolean;
  visaRequis: boolean; // visa DPLG exigé (gabarit)
  debutJ: number | null;
  finJ: number | null;
  debutLe: string | null;
  finLe: string | null;
  temps: Temps;
  heures: number | null;
  statut: 'a_faire' | 'non_necessaire';
  motif: string | null;
};

export type InstantiatedCard = {
  etapeNumero: number;
  etapeCle: string;
  etapeLibelle: string;
  cle: string;
  libelle: string;
  ordre: number;
  note: string | null;
  descriptif: string | null;
  etiquette: string | null;
  debutJ: number | null;
  finJ: number | null;
  debutLe: string | null;
  finLe: string | null;
  temps: Temps | null;
  client: boolean;
  fichiers: boolean;
  desactivation: string | null;
  ouvreApres: string[];
  taches: InstantiatedTask[];
};

const GC_CHARGE_KEYS: Record<'notice' | 'cachet' | 'timbre', keyof GcCharges> = {
  notice: 'Notice',
  cachet: 'Cachet',
  timbre: 'Timbre',
};

// Retrait décidé à l'ouverture (motif affiché sous la tâche), ou null.
function removalReason(cardKey: string, taskKey: string, ctx: OpeningContext): string | null {
  if (cardKey === 'documents_client' && taskKey === 'ninea' && ctx.individualClient)
    return 'Client personne physique (CRM) : sans objet';
  if (cardKey === 'permis_construire' && taskKey === 'autorisation' && !ctx.spcOrdered)
    return 'SPC non commandé au devis';
  return null;
}

export function instantiate(content: ContenuGabarit, ctx: OpeningContext): InstantiatedCard[] {
  const windowDates = (f?: Fenetre) =>
    f
      ? {
          debutJ: f.debut,
          finJ: f.fin,
          debutLe: dateOfDay(ctx.day1, f.debut, ctx.holidays),
          finLe: dateOfDay(ctx.day1, f.fin, ctx.holidays),
        }
      : { debutJ: null, finJ: null, debutLe: null, finLe: null };
  let cardOrder = 0;

  return content.etapes.flatMap((step) =>
    step.cartes.map((card) => {
      const reasons = card.taches.map((t) => removalReason(card.cle, t.cle, ctx));
      const neededCount = reasons.filter((m) => m === null).length;
      const hoursOf = (t: TacheGabarit, removed: boolean): number | null => {
        if (removed) return null;
        switch (t.temps.type) {
          case 'heures':
            return t.temps.heures;
          case 'charge_gc':
            return ctx.gcCharges[GC_CHARGE_KEYS[t.temps.charge]];
          case 'part_carte':
            return card.temps?.type === 'total' && neededCount > 0 ? arrondi(card.temps.heures / neededCount) : null;
          default:
            return null; // sans temps atelier, partagé (compté une fois, hors tâche), par unité (sur la carte)
        }
      };
      return {
        etapeNumero: step.numero,
        etapeCle: step.cle,
        etapeLibelle: step.libelle,
        cle: card.cle,
        libelle: card.libelle,
        ordre: cardOrder++,
        note: card.note ?? null,
        descriptif: card.descriptif ?? null,
        etiquette: card.etiquette ?? null,
        ...windowDates(card.fenetre),
        temps: card.temps ?? null,
        client: !!card.client,
        fichiers: !!card.fichiers,
        desactivation: card.desactivee ? (card.motifDesactivation ?? 'désactivée par défaut') : null,
        ouvreApres: card.ouvreApres ?? [],
        taches: card.taches.map((t, i) => ({
          cle: t.cle,
          libelle: t.libelle,
          ordre: i,
          descriptif: t.descriptif ?? null,
          sourceNative: !!t.sourceNative,
          visaRequis: !!t.visaDplg,
          fichierObligatoire: !t.fichierFacultatif,
          ...windowDates(t.fenetre ?? card.fenetre),
          temps: t.temps,
          heures: hoursOf(t, reasons[i] !== null),
          statut: reasons[i] ? ('non_necessaire' as const) : ('a_faire' as const),
          motif: reasons[i],
        })),
      };
    }),
  );
}
