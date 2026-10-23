import type { ContenuGabarit, Fenetre, TacheGabarit, Temps } from '../../reglages/gabarit';
import type { Feries } from '../../rh/regles-temps';
import { dateDuJour } from './calendrier';

// Ouverture d'un projet : la version en service du gabarit est recopiée en
// cartes et tâches, fenêtres converties en dates (délais figés). Règles de
// la maquette « Projets » appliquées à la copie, sans rien déduire d'autre :
//  - NINEA : « Client personne physique (CRM) : sans objet » ;
//  - Autorisation de construire : « SPC non commandé au devis » ;
//  - équipements : le temps « au total » de la carte se partage à parts égales
//    entre les tâches nécessaires ;
//  - charges GC (notice, cachet, timbre) : durées des Règles et délais.

export type ChargesGc = Record<'Notice' | 'Cachet' | 'Timbre', number>;

export type ContexteOuverture = {
  j1: string;
  feries: Feries;
  chargesGc: ChargesGc;
  spcCommande: boolean; // ligne SPC dans l'offre acceptée
  clientPersonnePhysique: boolean;
};

export type TacheInstanciee = {
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

export type CarteInstanciee = {
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
  taches: TacheInstanciee[];
};

const CHARGE: Record<'notice' | 'cachet' | 'timbre', keyof ChargesGc> = { notice: 'Notice', cachet: 'Cachet', timbre: 'Timbre' };
const arrondi = (n: number) => Math.round(n * 10) / 10;

// Retrait décidé à l'ouverture (motif affiché sous la tâche), ou null.
function motifRetrait(carte: string, tache: string, ctx: ContexteOuverture): string | null {
  if (carte === 'documents_client' && tache === 'ninea' && ctx.clientPersonnePhysique) return 'Client personne physique (CRM) : sans objet';
  if (carte === 'permis_construire' && tache === 'autorisation' && !ctx.spcCommande) return 'SPC non commandé au devis';
  return null;
}

export function instancier(contenu: ContenuGabarit, ctx: ContexteOuverture): CarteInstanciee[] {
  const dates = (f?: Fenetre) =>
    f
      ? { debutJ: f.debut, finJ: f.fin, debutLe: dateDuJour(ctx.j1, f.debut, ctx.feries), finLe: dateDuJour(ctx.j1, f.fin, ctx.feries) }
      : { debutJ: null, finJ: null, debutLe: null, finLe: null };
  let ordreCarte = 0;

  return contenu.etapes.flatMap((etape) =>
    etape.cartes.map((carte) => {
      const motifs = carte.taches.map((t) => motifRetrait(carte.cle, t.cle, ctx));
      const necessaires = motifs.filter((m) => m === null).length;
      const heuresDe = (t: TacheGabarit, retiree: boolean): number | null => {
        if (retiree) return null;
        switch (t.temps.type) {
          case 'heures':
            return t.temps.heures;
          case 'charge_gc':
            return ctx.chargesGc[CHARGE[t.temps.charge]];
          case 'part_carte':
            return carte.temps?.type === 'total' && necessaires > 0 ? arrondi(carte.temps.heures / necessaires) : null;
          default:
            return null; // sans temps atelier, partagé (compté une fois, hors tâche), par unité (sur la carte)
        }
      };
      return {
        etapeNumero: etape.numero,
        etapeCle: etape.cle,
        etapeLibelle: etape.libelle,
        cle: carte.cle,
        libelle: carte.libelle,
        ordre: ordreCarte++,
        note: carte.note ?? null,
        descriptif: carte.descriptif ?? null,
        etiquette: carte.etiquette ?? null,
        ...dates(carte.fenetre),
        temps: carte.temps ?? null,
        client: !!carte.client,
        fichiers: !!carte.fichiers,
        desactivation: carte.desactivee ? carte.motifDesactivation ?? 'désactivée par défaut' : null,
        ouvreApres: carte.ouvreApres ?? [],
        taches: carte.taches.map((t, i) => ({
          cle: t.cle,
          libelle: t.libelle,
          ordre: i,
          descriptif: t.descriptif ?? null,
          sourceNative: !!t.sourceNative,
          visaRequis: !!t.visaDplg,
          fichierObligatoire: !t.fichierFacultatif,
          ...dates(t.fenetre ?? carte.fenetre),
          temps: t.temps,
          heures: heuresDe(t, motifs[i] !== null),
          statut: motifs[i] ? ('non_necessaire' as const) : ('a_faire' as const),
          motif: motifs[i],
        })),
      };
    }),
  );
}
