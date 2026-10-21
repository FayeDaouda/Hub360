import {
  Categorie,
  FactureType,
  JalonFacture,
  NatureDossier,
  Phase,
} from '@prisma/client';

// Phase initiale d'un projet selon sa catégorie (première de la séquence),
// posée par le CRM à l'ouverture. « Développement » suit la conception
// (hypothèse de travail, oct. 2026, à confirmer).
export const PHASES_PAR_CATEGORIE: Record<Categorie, Phase[]> = {
  conception: ['avant_projet', 'permis', 'etudes', 'chantier', 'livre'],
  developpement: ['avant_projet', 'permis', 'etudes', 'chantier', 'livre'],
  amenagement: ['avant_projet', 'chantier', 'livre'],
};

// -- Section « Facturation client » (brique gestion) --
// Miroir de frontend/lib/types.ts (TYPES_FACTURE, JALONS_FACTURE,
// TAUX_TVA_DEFAUT, refFacture). Cf. cadrage « Facturation client ».

// Taux de TVA par défaut — prestations de services au Sénégal. Ajustable par
// facture (exonération, taux réduit) ; jamais figé en dur dans le code.
export const TAUX_TVA_DEFAUT = 18;

// Le type de facture découle de la nature du projet (cadrage §2) — jamais saisi.
export function typeFactureDepuisNature(nature: NatureDossier): FactureType {
  return nature === 'promotion_interne' ? 'vente' : 'honoraires';
}

// Les 3 jalons de l'échéancier de conception (mandat client), dans l'ordre
// d'affichage — libellés des CGV Grey Concrete 2026, art. 7. Leurs parts
// (F1 / F2 / F3, 40 / 40 / 20 par défaut) sont un réglage du CIO (Réglages ·
// Règles et délais), figé sur l'offre à sa soumission à la DAF. Clés d'enum
// inchangées. Miroir de JALONS_FACTURE (front).
export type CodeFacture = 'F1' | 'F2' | 'F3';
export type PartsFactures = Record<CodeFacture, number>; // %, somme 100
// `tranche` : ce que lit le client sur la facture (revue CFO, 21/10/2026).
export const JALONS_FACTURE: { cle: JalonFacture; code: CodeFacture; libelle: string; tranche: string }[] = [
  { cle: 'signature', code: 'F1', libelle: 'Acompte à la signature du contrat', tranche: '1ʳᵉ tranche : acompte à la signature du contrat' },
  { cle: 'avant_projet', code: 'F2', libelle: "Fin de l'APD", tranche: '2ᵉ tranche : fin de l’APD' },
  { cle: 'livraison', code: 'F3', libelle: "Livraison des plans d'exécution", tranche: '3ᵉ tranche : livraison des plans d’exécution' },
];

// Référence d'une facture : une seule suite par société, sans trou ni
// doublon, attribuée à l'émission — F (ou AV pour un avoir) + année + numéro
// (« F2026-0001 »). Décision du 14/10/2026 : le code du dossier n'entre plus
// dans la référence (il reste affiché à côté). Miroir de refFacture côté front.
// Depuis le lot 6 (21/10/2026), le numéro légal est FIGÉ à l'émission selon le
// format de la société (« GC-2026-0001 », cf. facturation/numerotation.ts) :
// `reference` fait foi ; le calcul ci-dessous ne sert plus qu'aux factures
// émises avant.
export type ReferenceFacture = {
  numero: number | null;
  emiseLe: Date | string | null;
  estAvoir: boolean;
  reference?: string | null;
};

export function refFacture(f: ReferenceFacture): string | null {
  if (f.reference) return f.reference;
  if (f.numero == null) return null;
  const annee = (f.emiseLe ? new Date(f.emiseLe) : new Date()).getFullYear();
  return `${f.estAvoir ? 'AV' : 'F'}${annee}-${String(f.numero).padStart(4, '0')}`;
}
