import { ModeContrat } from '@prisma/client';

// Contrat (étape G) — règles pures, sans I/O.
//
// Le modèle est un texte fourni par la société (Paramètres → Contrats) où
// des champs {{…}} sont remplacés à la génération. Liste FERMÉE : un champ
// inconnu est refusé (faute de frappe dans le modèle) plutôt que laissé tel
// quel dans un document destiné à être signé.

export const VARIABLES_CONTRAT: { cle: string; description: string }[] = [
  { cle: 'societe', description: 'Nom de la société' },
  { cle: 'client', description: 'Nom du client' },
  { cle: 'code_dossier', description: 'Code du dossier (ex. DFS_ALM.26)' },
  { cle: 'programme', description: 'Programme du projet' },
  { cle: 'localisation', description: 'Localisation du projet' },
  { cle: 'reference_offre', description: 'Référence de l’offre acceptée (ex. DEV2026-0001)' },
  { cle: 'montant_offre_ht', description: 'Montant HT de l’offre acceptée' },
  { cle: 'montant_offre_ttc', description: 'Montant TTC de l’offre acceptée' },
  { cle: 'date', description: 'Date de génération du contrat' },
  { cle: 'signataire_nom', description: 'Signataire pour la société' },
  { cle: 'signataire_fonction', description: 'Fonction du signataire' },
];

const MOTIF = /\{\{\s*([a-z_]+)\s*\}\}/g;

// Champs {{…}} du modèle absents de la liste — à corriger avant génération.
export function variablesInconnues(modele: string): string[] {
  const connues = new Set(VARIABLES_CONTRAT.map((v) => v.cle));
  return [...new Set([...modele.matchAll(MOTIF)].map((m) => m[1]))].filter((c) => !connues.has(c));
}

export function remplirModele(modele: string, valeurs: Record<string, string>): string {
  return modele.replace(MOTIF, (brut, cle: string) => valeurs[cle] ?? brut);
}

// Au-dessus du seuil société (offre HT complète), le contrat se rédige sur
// mesure ; en dessous — ou sans seuil — il se génère depuis le modèle.
export function modeContrat(montantOffreHt: number, seuilSurMesureHt: number | null): ModeContrat {
  return seuilSurMesureHt != null && montantOffreHt >= seuilSurMesureHt ? 'sur_mesure' : 'modele';
}

export function formatFcfa(montant: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(montant))} FCFA`;
}

export type Signataire = 'ceo' | 'dplg';

// Seuil de contresignature (Réglages · Règles et délais) : au-delà de ce
// montant TTC, seul le CEO contresigne ; en deçà — ou pile au seuil —
// l'Architecte DPLG.
export function signataireRequis(montantOffreTtc: number, seuilCeoTtc: number): Signataire {
  return montantOffreTtc > seuilCeoTtc ? 'ceo' : 'dplg';
}
