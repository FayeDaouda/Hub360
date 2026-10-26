import { VALIDITE_OFFRE_JOURS } from '../devis/domaine';
import { DELAI_PAIEMENT_DIRECTE_JOURS } from '../projets/facturation/facture-directe';
import { arrondi, heuresTache, joursAbsents, joursTache, type Feries, type Periode } from '../rh/regles-temps';
import { addDays, daysBetween } from '../shared/dates';

// Finances · Feuille de temps (maquette du boss, oct. 2026) — règles pures :
// temps sur le pipe (lead → 1er encaissement), temps sur la facturation
// (prévu = bon pour accord + délai figé dans l'offre) et temps imputé
// (tâches assignées du gabarit, calcul RH). Dates AAAA-MM-JJ.

// --- Temps sur le pipe -------------------------------------------------------------
export type CleEtape = 'lead' | 'soumission' | 'envoi' | 'accord' | 'facture' | 'encaissement';

// Cibles affichées par la maquette ; validité de l'offre (CGV art. 14) et
// échéance de paiement : règles du code.
const ETAPES: { cle: CleEtape; libelle: string; cible: string | null; seuil: number | null }[] = [
  { cle: 'lead', libelle: 'Lead créé', cible: null, seuil: null },
  { cle: 'soumission', libelle: 'Offre soumise au CFO', cible: 'cible ≤ 5 j', seuil: 5 },
  { cle: 'envoi', libelle: 'Offre validée et envoyée', cible: 'cible ≤ 2 j (CFO)', seuil: 2 },
  {
    cle: 'accord',
    libelle: 'Bon pour accord signé',
    cible: `validité ${VALIDITE_OFFRE_JOURS} j`,
    seuil: VALIDITE_OFFRE_JOURS,
  },
  { cle: 'facture', libelle: '1re facture émise', cible: 'cible ≤ 2 j', seuil: 2 },
  {
    cle: 'encaissement',
    libelle: '1er encaissement',
    cible: `échéance ${DELAI_PAIEMENT_DIRECTE_JOURS} j`,
    seuil: DELAI_PAIEMENT_DIRECTE_JOURS,
  },
];

export type EtapePipe = {
  cle: CleEtape;
  libelle: string;
  date: string | null; // null = pas encore atteinte
  ecartJours: number | null; // depuis l'étape atteinte précédente
  cible: string | null;
  horsCible: boolean;
};

export function tempsPipe(dates: Record<CleEtape, string | null>): EtapePipe[] {
  let precedente: string | null = null;
  return ETAPES.map((e) => {
    const date = dates[e.cle]?.slice(0, 10) ?? null;
    const ecartJours = date && precedente ? daysBetween(precedente, date) : null;
    if (date) precedente = date;
    return {
      cle: e.cle,
      libelle: e.libelle,
      date,
      ecartJours,
      cible: e.cible,
      horsCible: ecartJours != null && e.seuil != null && ecartJours > e.seuil,
    };
  });
}

// --- Temps sur la facturation --------------------------------------------------------
export type DelaiTranche =
  | { etat: 'payee'; jours: number } // de l'émission au paiement
  | { etat: 'a_echoir'; jours: number } // jours avant l'échéance
  | { etat: 'en_retard'; jours: number } // jours après l'échéance
  | { etat: 'a_facturer'; jours: number } // jours avant la date prévue
  | { etat: 'facturation_en_retard'; jours: number } // prévue dépassée
  | { etat: 'non_planifiee' }; // ni facture, ni délai prévu

export function prevueLe(accord: string | null, delaiJours: number | null): string | null {
  return accord && delaiJours != null ? addDays(accord.slice(0, 10), delaiJours) : null;
}

export function delaiTranche(
  t: { prevue: string | null; facturee: string | null; echeance: string | null; payee: string | null },
  aujourdhui: string,
): DelaiTranche {
  if (t.facturee && t.payee) return { etat: 'payee', jours: Math.max(0, daysBetween(t.facturee, t.payee)) };
  if (t.facturee) {
    if (!t.echeance) return { etat: 'a_echoir', jours: 0 };
    const reste = daysBetween(aujourdhui, t.echeance);
    return reste >= 0 ? { etat: 'a_echoir', jours: reste } : { etat: 'en_retard', jours: -reste };
  }
  if (!t.prevue) return { etat: 'non_planifiee' };
  const reste = daysBetween(aujourdhui, t.prevue);
  return reste >= 0 ? { etat: 'a_facturer', jours: reste } : { etat: 'facturation_en_retard', jours: -reste };
}

// --- Temps imputé -------------------------------------------------------------------------
export type TacheImputable = {
  id: string;
  etape: string;
  etapeNumero: number;
  libelle: string;
  debut: string | null;
  echeance: string | null;
  heures: number | null; // durée standard ; null = sans temps atelier
  assigne: { nom: string; absences: Periode[] };
};

export type TacheImputee = {
  id: string;
  etape: string;
  libelle: string;
  debut: string | null;
  assigne: string;
  heuresStandard: number | null;
  joursEcoules: number; // jours ouvrés de présence déjà passés dans la fenêtre
  heures: number; // imputées à ce jour
};

// Calcul RH (regles-temps) : la durée standard d'une tâche assignée se répartit
// sur les jours ouvrés de présence de sa fenêtre ; on compte ceux déjà passés.
export function tempsImpute(taches: TacheImputable[], aujourdhui: string, feries: Feries) {
  const lignes: TacheImputee[] = taches.map((t) => {
    const tache = { id: t.id, debut: t.debut, echeance: t.echeance, heures: t.heures };
    const absents = joursAbsents(t.assigne.absences, feries);
    const p = { debut: t.debut ?? aujourdhui, fin: aujourdhui };
    return {
      id: t.id,
      etape: t.etape,
      libelle: t.libelle,
      debut: t.debut,
      assigne: t.assigne.nom,
      heuresStandard: t.heures,
      joursEcoules: joursTache(tache, absents, p, feries),
      heures: arrondi(heuresTache(tache, absents, p, feries)),
    };
  });
  const parEtape = new Map<string, { numero: number; heures: number }>();
  for (const [i, l] of lignes.entries()) {
    const e = parEtape.get(l.etape) ?? { numero: taches[i].etapeNumero, heures: 0 };
    e.heures += l.heures;
    parEtape.set(l.etape, e);
  }
  return {
    total: arrondi(lignes.reduce((s, l) => s + l.heures, 0)),
    repartition: [...parEtape.entries()]
      .filter(([, e]) => e.heures > 0)
      .sort(([, a], [, b]) => a.numero - b.numero)
      .map(([etape, e]) => ({ etape, heures: arrondi(e.heures) })),
    taches: lignes.sort((a, b) => (b.debut ?? '').localeCompare(a.debut ?? '')),
  };
}
