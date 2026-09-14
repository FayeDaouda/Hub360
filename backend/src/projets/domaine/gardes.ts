import { Categorie, FactureStatut, Phase, StatutEtude } from '@prisma/client';
import { ETAPES_PRE_BILAN, PHASES_PAR_CATEGORIE, PIECES_DOSSIER_PERMIS } from './config';

type VersionMinimale = { etape: string; couts: unknown };

// GARDE MIROIR de frontend/lib/types.ts::peutAvancerPhase
// Toute modification ici doit être répercutée côté front, et réciproquement.
// Les phases peuvent se chevaucher dans la réalité du terrain (décision boss,
// sept. 2026) : plus aucun verrou dur sur l'avant-projet non validé ou le
// permis non obtenu — seule la dernière phase de la séquence bloque
// l'avancement. `avantProjetValide`/`permisObtenu` restent en paramètres pour
// alimenter un rappel doux côté UI (voir avertissementChangementPhase).
export function peutAvancerPhase(
  projet: { categorie: Categorie; phase: Phase },
  _contexte: { avantProjetValide: boolean; permisObtenu: boolean },
): { ok: boolean; raison?: string } {
  const sequence = PHASES_PAR_CATEGORIE[projet.categorie];
  const i = sequence.indexOf(projet.phase);
  if (i < 0 || i >= sequence.length - 1) {
    return { ok: false, raison: 'Dernière phase' };
  }
  return { ok: true };
}

// Rappel doux (n'affecte jamais `peutAvancerPhase.ok`) : signale qu'on quitte
// « avant_projet » sans validation ou « permis » sans permis en main. Affiché
// via la prop `avertissement` du PhaseStepper, au même titre que les autres
// rappels (études/lots en attente) — jamais un blocage serveur.
export function avertissementChangementPhase(
  projet: { phase: Phase },
  contexte: { avantProjetValide: boolean; permisObtenu: boolean },
): string | null {
  if (projet.phase === 'avant_projet' && !contexte.avantProjetValide) {
    return "L'avant-projet n'est pas encore validé.";
  }
  if (projet.phase === 'permis' && !contexte.permisObtenu) {
    return 'Le permis de construire n’est pas encore obtenu.';
  }
  return null;
}

// Vrai si `cible` est adjacente (±1) à `courante` dans la séquence.
export function phasesAdjacentes(
  categorie: Categorie,
  courante: Phase,
  cible: Phase,
): boolean {
  const s = PHASES_PAR_CATEGORIE[categorie];
  const a = s.indexOf(courante);
  const b = s.indexOf(cible);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 1;
}

// GARDE MIROIR de frontend/lib/types.ts::preBilanComplet
// Complétude *structurelle* : toutes les versions attendues existent et la
// dernière a un total non nul. Le jugement métier (marge OK) reste humain.
export function preBilanComplet(
  categorie: Categorie,
  versions: VersionMinimale[],
): boolean {
  const attendu = ETAPES_PRE_BILAN[categorie].length;
  if (versions.length < attendu) return false;
  const derniere = versions[versions.length - 1];
  const couts = (derniere?.couts ?? {}) as Record<string, unknown>;
  const total = Object.values(couts).reduce<number>((s, n) => s + (Number(n) || 0), 0);
  return total > 0;
}

// GARDE MIROIR de frontend/lib/types.ts::checklistAvantProjet (les 4 clés).
// Le backend ne vérifie que la complétude ; les libellés restent au front.
export function checklistComplete(ap: {
  programmeValide: boolean;
  budgetValide: boolean;
  esquisseValidee: boolean;
  engagementValide: boolean;
}): boolean {
  return (
    ap.programmeValide && ap.budgetValide && ap.esquisseValidee && ap.engagementValide
  );
}

// MIROIR de frontend/lib/types.ts::avancementChecklistAvp
// Avancement des sous-checklists opérationnelles. `nonRequis` sort du
// dénominateur (comme StatutEtude.non_requise n'est pas « à faire »). Purement
// indicatif — aucun verrou de phase, contrairement à checklistComplete.
export function avancementChecklistAvp(
  lignes: { fait: boolean; nonRequis: boolean }[],
): { faits: number; total: number; pct: number; complete: boolean } {
  const applicables = lignes.filter((l) => !l.nonRequis);
  const faits = applicables.filter((l) => l.fait).length;
  const total = applicables.length;
  return {
    faits,
    total,
    pct: total ? Math.round((faits / total) * 100) : 0,
    complete: total > 0 && faits === total,
  };
}

// GARDE MIROIR de frontend/lib/types.ts::dossierPermisComplet
// Les 5 pièces du dossier cochées — gate avant de marquer « déposé » (l'endpoint
// exige aussi NICAD obtenu). `dossier` = les colonnes booléennes du modèle Permis.
export function dossierPermisComplet(
  dossier: Record<(typeof PIECES_DOSSIER_PERMIS)[number], boolean>,
): boolean {
  return PIECES_DOSSIER_PERMIS.every((p) => dossier[p]);
}

// GARDE MIROIR de frontend/lib/types.ts::etudesCompletes
// DCE mobilisable quand chaque ligne est « validée » OU « non requise » — pas
// « remise » : on ne met pas un rendu non vérifié dans l'appel d'offres. C'est
// tout l'intérêt de garder remise et validee comme deux états distincts.
export function etudesCompletes(lignes: { statut: StatutEtude }[]): boolean {
  return lignes.every((l) => l.statut === 'validee' || l.statut === 'non_requise');
}

// -- Section « Facturation client » ----------------------------------------

// Statut effectif d'une facture : le statut stocké (cycle admin) enrichi de
// l'état de paiement, calculé à la lecture. Pas de valeur Prisma dédiée — il
// n'est jamais persisté.
export type StatutFactureEffectif =
  | 'brouillon'
  | 'emise'
  | 'partiellement_payee'
  | 'payee'
  | 'en_retard'
  | 'annulee';

// GARDE MIROIR de frontend/lib/types.ts::ventilationTva
// FCFA sans décimale : la TVA est arrondie au franc. montantHt + tauxTva sont
// les seules données stockées ; TVA et TTC en découlent — et restent figées de
// fait une fois la facture émise (montantHt/tauxTva non modifiables).
export function ventilationTva(
  montantHt: number,
  tauxTva: number,
): { montantTva: number; montantTtc: number } {
  const montantTva = Math.round((montantHt * tauxTva) / 100);
  return { montantTva, montantTtc: montantHt + montantTva };
}

// GARDE MIROIR de frontend/lib/types.ts::statutFactureEffectif
// Le statut stocké ne connaît que le cycle piloté par l'admin (brouillon →
// emise → annulee). « payée / partiellement payée / en retard » se déduisent du
// cumul des paiements et de l'échéance — aucun job planifié, comme les alertes
// d'échéance permis / avant-projet. Priorités : soldée l'emporte sur en retard
// (payer en retard reste payer) ; en retard l'emporte sur partiellement payée.
export function statutFactureEffectif(
  f: {
    statut: FactureStatut;
    echeanceLe: string | null;
    montantTtc: number;
    montantPaye: number;
  },
  aujourdhui: string, // AAAA-MM-JJ
): StatutFactureEffectif {
  if (f.statut !== 'emise') return f.statut; // brouillon | annulee
  if (f.montantPaye >= f.montantTtc) return 'payee';
  if (f.echeanceLe && f.echeanceLe < aujourdhui) return 'en_retard';
  if (f.montantPaye > 0) return 'partiellement_payee';
  return 'emise';
}

// Jours de retard d'une facture échue et non soldée (0 sinon). Comparaison de
// dates AAAA-MM-JJ en UTC pour éviter tout décalage de fuseau.
export function joursRetardFacture(
  echeanceLe: string | null,
  aujourdhui: string,
): number {
  if (!echeanceLe || echeanceLe >= aujourdhui) return 0;
  const jours = Math.floor(
    (Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${echeanceLe}T00:00:00Z`)) /
      86_400_000,
  );
  return jours > 0 ? jours : 0;
}
