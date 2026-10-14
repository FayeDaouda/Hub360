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
export const JALONS_FACTURE: { cle: JalonFacture; code: CodeFacture; libelle: string }[] = [
  { cle: 'signature', code: 'F1', libelle: 'Acompte à la signature du contrat' },
  { cle: 'avant_projet', code: 'F2', libelle: "Fin de l'APD" },
  { cle: 'livraison', code: 'F3', libelle: "Livraison des plans d'exécution" },
];

// Référence d'une facture (maquette Finances, oct. 2026) : code du dossier et
// rang de la facture dans ce dossier, attribués à l'émission (« D_ALM.26-1 »).
// Une facture sans dossier (devis libre) garde la séquence de la société
// (F / AV + année + numéro). Miroir de refFacture côté front.
export type ReferenceFacture = {
  numero: number | null;
  emiseLe: Date | string | null;
  estAvoir: boolean;
  codeDossier: string | null;
  rangDossier: number | null;
};

export function refFacture(f: ReferenceFacture): string | null {
  if (f.codeDossier && f.rangDossier != null) return `${f.codeDossier}-${f.rangDossier}`;
  if (f.numero == null) return null;
  const annee = (f.emiseLe ? new Date(f.emiseLe) : new Date()).getFullYear();
  return `${f.estAvoir ? 'AV' : 'F'}${annee}-${String(f.numero).padStart(4, '0')}`;
}
