import { StatutDevis } from '@prisma/client';
import { htLigne, ventilationTva } from '../projets/domaine/gardes';
import { daysBetween, toIsoDay } from '@hub/domain';

// Référence d'un devis (maquette Finances, oct. 2026) : une offre de dossier
// porte le code du dossier + « OF » + son rang (« KSN_DIA.26-OF1 »), attribués
// à la création ; un devis libre, la séquence de la société à l'envoi
// (DEV + année + numéro).
export type ReferenceDevis = {
  numero: number | null;
  dateEnvoi: Date | string | null;
  codeDossier: string | null;
  rangDossier: number | null;
};

export function refDevis(d: ReferenceDevis): string | null {
  if (d.codeDossier && d.rangDossier != null) return `${d.codeDossier}-OF${d.rangDossier}`;
  if (d.numero == null) return null;
  const annee = (d.dateEnvoi ? new Date(d.dateEnvoi) : new Date()).getFullYear();
  return `DEV${annee}-${String(d.numero).padStart(4, '0')}`;
}

export type StatutDevisEffectif = StatutDevis | 'expire';

// GARDE MIROIR de statutFactureEffectif (projets/domaine/gardes.ts) : le
// statut stocké ne connaît que le cycle piloté par l'admin (brouillon →
// envoye → accepte/refuse/transforme). « expiré » se déduit de la date de
// validité — aucun scheduler, comme en_retard pour Facture.
export function statutDevisEffectif(
  d: { statut: StatutDevis; dateValidite: string | null },
  aujourdhui: string, // AAAA-MM-JJ
): StatutDevisEffectif {
  if (d.statut === 'envoye' && d.dateValidite && d.dateValidite < aujourdhui) {
    return 'expire';
  }
  return d.statut;
}

// -- Offre d'un dossier CRM (étape F, règles validées sept. 2026) ------------

// Validité fixe d'une offre CRM : une seule version, dans @hub/domain (l'écran
// en a besoin pour l'aperçu avant envoi).
export { VALIDITE_OFFRE_JOURS } from '@hub/domain';
// Jours après l'envoi où une relance devient « à faire » (bouton manuel —
// pas de scheduler, même principe que les relances de factures).
export const JOURS_RELANCE_OFFRE = [3, 6] as const;

// AAAA-MM-JJ décalé de n jours (dates « agenda », sans heure).

// Une relance est due quand le palier J+3 (puis J+6) est atteint et qu'on
// n'a pas encore relancé autant de fois — uniquement tant que l'offre attend
// une réponse (ni expirée, ni répondue).
export function relanceAFaire(
  d: {
    statut: StatutDevis;
    dateValidite: string | null;
    dateEnvoi: Date | null;
    relancesEnvoyees: number;
  },
  aujourdhui: string,
): boolean {
  if (statutDevisEffectif(d, aujourdhui) !== 'envoye' || !d.dateEnvoi) return false;
  const jours = daysBetween(toIsoDay(d.dateEnvoi), aujourdhui);
  const paliersAtteints = JOURS_RELANCE_OFFRE.filter((j) => jours >= j).length;
  return d.relancesEnvoyees < paliersAtteints;
}

// Remise sur toute l'offre (09/11/2026) : seuls paliers proposés ; null = aucune.
export const REMISES_OFFRE = [5, 10, 15, 20, 25] as const;
export type RemiseOffre = (typeof REMISES_OFFRE)[number];

type Nombre = { toNumber(): number };

// HT d'une ligne, remise de l'offre appliquée : projets/domaine/gardes.ts.
export { htLigne };

// Montants d'un devis à partir de ses lignes — même arrondi que
// DevisService.calculerLignes (HT arrondi par ligne, TVA ventilée par ligne).
// `remisePct` obligatoire : aucun total ne l'oublie (null = aucune).
export function montantTtcLignes(
  lignes: { quantite: Nombre; prixUnitaire: Nombre; tauxTva: Nombre }[],
  remisePct: number | null,
): number {
  return lignes.reduce((s, l) => {
    const ht = htLigne(l.quantite.toNumber(), l.prixUnitaire.toNumber(), remisePct);
    return s + ventilationTva(ht, l.tauxTva.toNumber()).montantTtc;
  }, 0);
}

// Montant HT d'un devis à partir de ses lignes (HT arrondi par ligne).
export function montantHtLignes(
  lignes: { quantite: Nombre; prixUnitaire: Nombre }[],
  remisePct: number | null,
): number {
  return lignes.reduce((s, l) => s + htLigne(l.quantite.toNumber(), l.prixUnitaire.toNumber(), remisePct), 0);
}

// -- Avenant non accepté (Réglages · Règles et délais) -----------------------
// Un avenant = devis complémentaire d'un PROJET portant au moins une ligne TS
// (CGV art. 8). Envoyé au client et resté sans acceptation (en attente ou
// expiré) au-delà du délai réglé : alerte (et, avec le Pilotage, échéance
// dépassée au registre des décisions).
export function alerteAvenant(
  d: {
    projetId: string | null;
    statut: StatutDevis;
    dateValidite: string | null;
    dateEnvoi: Date | null;
    familles: (string | null)[];
  },
  aujourdhui: string,
  seuilJours: number,
): { jours: number; seuil: number } | null {
  if (!d.projetId || !d.dateEnvoi || !d.familles.includes('TS')) return null;
  if (!['envoye', 'expire'].includes(statutDevisEffectif(d, aujourdhui))) return null;
  const jours = daysBetween(toIsoDay(d.dateEnvoi), aujourdhui);
  return jours > seuilJours ? { jours, seuil: seuilJours } : null;
}

// Message d'introduction d'une offre de lead (maquette Finances, oct. 2026),
// pré-rempli depuis la fiche et les lignes tant que personne ne l'a réécrit.
// « SU1 — Suivi de chantier — … » s'écrit « SU1 · Suivi de chantier — … »
// dans la liste. La conception ne dit pas sa catégorie (09/11/2026) : une
// ligne CO s'écrit « Conception », sans code ni complexité.
export function messageIntroductionParDefaut(o: {
  societe: string;
  lieu: string | null;
  programme: string;
  prestations: { designation: string; famille: string | null }[];
}): string {
  const lieu = o.lieu ? ` sis à ${o.lieu}` : '';
  const programme = o.programme.trim() || 'programme à préciser';
  const liste = o.prestations
    .map((p) => `· ${p.famille === 'CO' ? 'Conception' : p.designation.replace(/^(\S+) — /, '$1 · ')}`)
    .join('\n');
  return (
    `Dans le cadre de notre accompagnement pour le projet${lieu}, décrit comme suit (${programme}), ` +
    `${o.societe} intervient exclusivement sur les prestations suivantes :${liste ? `\n\n${liste}` : ''}`
  );
}
