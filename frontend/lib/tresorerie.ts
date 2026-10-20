import type { FactureCentrale } from './types';

// Trésorerie (revue CFO 20/10/2026, lot 3) : balance âgée des créances et
// échéancier des encaissements attendus, calculés depuis la liste des
// factures de la société (la même que l'onglet Factures).

const JOUR = 86_400_000;
const ecartJours = (de: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / JOUR);
export const ajouterJours = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * JOUR).toISOString().slice(0, 10);

// Tranches d'âge, comptées depuis l'ÉCHÉANCE (décision du 20/10/2026 : la
// pratique ; une facture sans échéance est réputée non échue).
export type Tranche = 'nonEchu' | 'j30' | 'j60' | 'j90' | 'plus90';
export const TRANCHES: { cle: Tranche; libelle: string }[] = [
  { cle: 'nonEchu', libelle: 'Non échu' },
  { cle: 'j30', libelle: '1 à 30 j' },
  { cle: 'j60', libelle: '31 à 60 j' },
  { cle: 'j90', libelle: '61 à 90 j' },
  { cle: 'plus90', libelle: 'Plus de 90 j' },
];

export function trancheDe(echeanceLe: string | null, aujourdhui: string): Tranche {
  if (!echeanceLe) return 'nonEchu';
  const retard = ecartJours(echeanceLe.slice(0, 10), aujourdhui);
  return retard <= 0 ? 'nonEchu' : retard <= 30 ? 'j30' : retard <= 60 ? 'j60' : retard <= 90 ? 'j90' : 'plus90';
}

export type Montants = Record<Tranche, number> & { total: number };
const vide = (): Montants => ({ nonEchu: 0, j30: 0, j60: 0, j90: 0, plus90: 0, total: 0 });

export type Creance = { facture: FactureCentrale; tranche: Tranche; retard: number };
export type LigneBalance = { client: string; montants: Montants; creances: Creance[] };

// Créance = facture émise (ni avoir, ni annulée) dont il reste à encaisser.
export const estCreance = (f: FactureCentrale) => f.statut === 'emise' && !f.estAvoir && f.resteAPayer > 0;

export function balanceAgee(factures: FactureCentrale[], aujourdhui: string) {
  const parClient = new Map<string, LigneBalance>();
  const total = vide();
  for (const f of factures.filter(estCreance)) {
    const client = f.client?.nom ?? 'Client non renseigné';
    const tranche = trancheDe(f.echeanceLe, aujourdhui);
    const ligne = parClient.get(client) ?? { client, montants: vide(), creances: [] };
    ligne.montants[tranche] += f.resteAPayer;
    ligne.montants.total += f.resteAPayer;
    total[tranche] += f.resteAPayer;
    total.total += f.resteAPayer;
    ligne.creances.push({ facture: f, tranche, retard: f.echeanceLe ? Math.max(0, ecartJours(f.echeanceLe.slice(0, 10), aujourdhui)) : 0 });
    parClient.set(client, ligne);
  }
  // Le plus exposé d'abord : le plus vieux retard, puis le montant dû.
  const poids = (l: LigneBalance) => l.montants.plus90 * 1e6 + l.montants.j90 * 1e4 + l.montants.j60 * 1e2 + l.montants.j30;
  const lignes = [...parClient.values()]
    .map((l) => ({ ...l, creances: l.creances.sort((a, b) => b.retard - a.retard) }))
    .sort((a, b) => poids(b) - poids(a) || b.montants.total - a.montants.total);
  return { lignes, total };
}

// Échéancier : encaissements attendus par fenêtre de 30 jours. « Sûr » =
// factures émises non soldées, à leur échéance ; « prévu » = tranches
// préparées mais pas encore émises (F1/F2/F3, mensualités), à leur date
// prévue. Ce qui est déjà en retard est à part ; sans date, « non daté ».
export type Fenetre = { cle: string; libelle: string; du: string; au: string; sur: number; prevu: number; factures: FactureCentrale[] };

const resteTtc = (f: FactureCentrale) => (f.statut === 'brouillon' ? f.montantTtc : f.resteAPayer);
// Brouillon attendu : une tranche chiffrée (pas une facture directe à valider,
// déjà comptée quand le CFO l'émet ; pas un montant encore à 0).
const estPrevu = (f: FactureCentrale) => f.statut === 'brouillon' && !f.estAvoir && !f.dossierCrm && f.montantTtc > 0;

export function echeancier(factures: FactureCentrale[], aujourdhui: string) {
  const fenetres: Fenetre[] = [
    { cle: 'j30', libelle: '30 prochains jours', du: ajouterJours(aujourdhui, 1), au: ajouterJours(aujourdhui, 30) },
    { cle: 'j60', libelle: 'De 31 à 60 jours', du: ajouterJours(aujourdhui, 31), au: ajouterJours(aujourdhui, 60) },
    { cle: 'j90', libelle: 'De 61 à 90 jours', du: ajouterJours(aujourdhui, 61), au: ajouterJours(aujourdhui, 90) },
  ].map((f) => ({ ...f, sur: 0, prevu: 0, factures: [] }));
  const enRetard = { montant: 0, factures: [] as FactureCentrale[] };
  const nonDate = { sur: 0, prevu: 0, factures: [] as FactureCentrale[] };
  const auDela = { sur: 0, prevu: 0 };
  for (const f of factures) {
    const prevu = estPrevu(f);
    if (!prevu && !estCreance(f)) continue;
    const montant = resteTtc(f);
    const date = f.echeanceLe?.slice(0, 10) ?? null;
    if (!date) {
      nonDate[prevu ? 'prevu' : 'sur'] += montant;
      nonDate.factures.push(f);
    } else if (date <= aujourdhui) {
      // Échéance passée : une créance est en retard ; une tranche prévue
      // dont la date est passée sans émission est attendue au plus tôt.
      if (prevu) {
        fenetres[0].prevu += montant;
        fenetres[0].factures.push(f);
      } else {
        enRetard.montant += montant;
        enRetard.factures.push(f);
      }
    } else {
      const fenetre = fenetres.find((w) => date <= w.au);
      if (fenetre) {
        fenetre[prevu ? 'prevu' : 'sur'] += montant;
        fenetre.factures.push(f);
      } else auDela[prevu ? 'prevu' : 'sur'] += montant;
    }
  }
  for (const w of fenetres) w.factures.sort((a, b) => (a.echeanceLe ?? '').localeCompare(b.echeanceLe ?? ''));
  return { fenetres, enRetard, nonDate, auDela };
}
