import { StatutDevis } from '@prisma/client';
import { ventilationTva } from '../projets/domaine/gardes';

// Référence d'affichage d'un devis — même motif que refFacture (format
// PROVISOIRE, cf. projets/domaine/config.ts::refFacture). La donnée qui fait
// foi est le numéro séquentiel (Devis.numero) ; cette chaîne n'est qu'un rendu.
export function refDevis(
  numero: number | null,
  dateEnvoi: Date | string | null,
): string | null {
  if (numero == null) return null;
  const annee = (dateEnvoi ? new Date(dateEnvoi) : new Date()).getFullYear();
  return `DEV${annee}-${String(numero).padStart(4, '0')}`;
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

// Validité fixe d'une offre CRM : on ne la saisit plus, elle court à partir
// de l'envoi (validation DAF).
export const VALIDITE_OFFRE_JOURS = 7;
// Jours après l'envoi où une relance devient « à faire » (bouton manuel —
// pas de scheduler, même principe que les relances de factures).
export const JOURS_RELANCE_OFFRE = [3, 6] as const;

// AAAA-MM-JJ décalé de n jours (dates « agenda », sans heure).
export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Jours pleins écoulés entre deux dates agenda (AAAA-MM-JJ).
export function joursEntre(debut: string, fin: string): number {
  return Math.round(
    (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000,
  );
}

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
  const jours = joursEntre(d.dateEnvoi.toISOString().slice(0, 10), aujourdhui);
  const paliersAtteints = JOURS_RELANCE_OFFRE.filter((j) => jours >= j).length;
  return d.relancesEnvoyees < paliersAtteints;
}

// Montants d'un devis à partir de ses lignes — même arrondi que
// DevisService.calculerLignes (HT arrondi par ligne, TVA ventilée par ligne).
export function montantTtcLignes(
  lignes: { quantite: { toNumber(): number }; prixUnitaire: { toNumber(): number }; tauxTva: { toNumber(): number } }[],
): number {
  return lignes.reduce((s, l) => {
    const ht = Math.round(l.quantite.toNumber() * l.prixUnitaire.toNumber());
    return s + ventilationTva(ht, l.tauxTva.toNumber()).montantTtc;
  }, 0);
}

// Montant HT d'un devis à partir de ses lignes (HT arrondi par ligne).
export function montantHtLignes(
  lignes: { quantite: { toNumber(): number }; prixUnitaire: { toNumber(): number } }[],
): number {
  return lignes.reduce(
    (s, l) => s + Math.round(l.quantite.toNumber() * l.prixUnitaire.toNumber()),
    0,
  );
}

// -- Avenant non accepté (Réglages · Règles et délais) -----------------------
// Un avenant = devis complémentaire d'un PROJET portant au moins une ligne TS
// (CGV art. 8). Envoyé au client et resté sans acceptation (en attente ou
// expiré) au-delà du délai réglé : alerte (et, avec le Pilotage, échéance
// dépassée au registre des décisions).
export function alerteAvenant(
  d: { projetId: string | null; statut: StatutDevis; dateValidite: string | null; dateEnvoi: Date | null; familles: (string | null)[] },
  aujourdhui: string,
  seuilJours: number,
): { jours: number; seuil: number } | null {
  if (!d.projetId || !d.dateEnvoi || !d.familles.includes('TS')) return null;
  if (!['envoye', 'expire'].includes(statutDevisEffectif(d, aujourdhui))) return null;
  const jours = joursEntre(d.dateEnvoi.toISOString().slice(0, 10), aujourdhui);
  return jours > seuilJours ? { jours, seuil: seuilJours } : null;
}
