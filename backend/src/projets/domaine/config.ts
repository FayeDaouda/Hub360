import {
  Categorie,
  CleChecklistAvp,
  EtapePreBilan,
  FactureType,
  GroupeChecklistAvp,
  JalonFacture,
  NatureDossier,
  Phase,
  TypeEtude,
  TypeLot,
} from '@prisma/client';

// Tables de paramétrage par catégorie — miroir de frontend/lib/types.ts
// (PHASES_PAR_CATEGORIE, ETAPES_PRE_BILAN, LIGNES_PRE_BILAN,
// SECTIONS_PAR_CATEGORIE, ETUDES_PAR_DEFAUT, LOTS_PAR_CATEGORIE).
// À garder synchronisées des deux côtés.

export const PHASES_PAR_CATEGORIE: Record<Categorie, Phase[]> = {
  conception: ['avant_projet', 'permis', 'etudes', 'chantier', 'livre'],
  amenagement: ['avant_projet', 'chantier', 'livre'],
};

// Libellés de phase — miroir de frontend/lib/types.ts::PHASES. Utilisé par le
// service pour pré-rendre le titre des notifications « phase_changee ».
export const LIBELLES_PHASE: Record<Phase, string> = {
  avant_projet: 'Avant-projet',
  permis: 'Permis',
  etudes: 'Études',
  chantier: 'Chantier',
  livre: 'Livré',
};

export const ETAPES_PRE_BILAN: Record<Categorie, EtapePreBilan[]> = {
  conception: ['esq', 'aps', 'apd'],
  amenagement: ['estimation', 'definitif'],
};

export const LIGNES_PRE_BILAN: Record<Categorie, string[]> = {
  conception: ['charges_foncieres', 'travaux', 'honoraires', 'frais_divers', 'aleas'],
  amenagement: [
    'fournitures_mobilier',
    'travaux_amenagement',
    'honoraires',
    'frais_divers',
    'aleas',
  ],
};

export const SECTIONS_PAR_CATEGORIE: Record<Categorie, string[]> = {
  conception: ['avant-projet', 'images', 'documents', 'permis', 'etude', 'execution'],
  amenagement: ['avant-projet', 'images', 'documents', 'execution'],
};

// -- Section « Permis » (conception uniquement) --

// Les 5 pièces du dossier de permis, dans l'ordre. Miroir de
// frontend/lib/types.ts::PIECES_DOSSIER_PERMIS — noms alignés sur les colonnes
// booléennes du modèle Permis.
export const PIECES_DOSSIER_PERMIS = [
  'titrePropriete',
  'planCadastralVise',
  'plansApd',
  'devis',
  'timbreFiscal',
] as const;

export type PieceDossierPermis = (typeof PIECES_DOSSIER_PERMIS)[number];

// Délai légal d'instruction (jours). Miroir de DELAI_INSTRUCTION_JOURS.
export const DELAI_INSTRUCTION_JOURS = 90;

// -- Section « Études » (conception uniquement) --

// Jeu de lignes créé d'office à l'ouverture de la section (toutes « à lancer »).
// Miroir de frontend/lib/types.ts::ETUDES_PAR_DEFAUT.
export const ETUDES_PAR_DEFAUT: TypeEtude[] = [
  'geotechnique',
  'topographie',
  'structure',
  'fluides',
  'electricite',
  'vrd',
];

// -- Section « Exécution » (les deux catégories) --

// Catalogue de lots par catégorie. Miroir de LOTS_PAR_CATEGORIE.
export const LOTS_PAR_CATEGORIE: Record<Categorie, TypeLot[]> = {
  conception: ['gros_oeuvre', 'second_oeuvre', 'lots_techniques', 'vrd'],
  amenagement: ['fournitures_mobilier', 'travaux_amenagement'],
};

// Phase qui suit « avant_projet » pour une catégorie donnée.
export function phaseApresAvantProjet(categorie: Categorie): Phase {
  return PHASES_PAR_CATEGORIE[categorie][1];
}

// -- Section « Avant-projet » : sous-checklists opérationnelles --

// Les checklists du Trello Grey Concrete, dans l'ordre d'affichage. Chaque
// groupe = une checklist ; les clés couvrent EXACTEMENT l'enum CleChecklistAvp.
// Miroir de frontend/lib/types.ts::CHECKLISTS_AVANT_PROJET — à garder synchro.
export const CHECKLISTS_AVANT_PROJET: {
  groupe: GroupeChecklistAvp;
  libelle: string;
  items: { cle: CleChecklistAvp; libelle: string }[];
}[] = [
  {
    groupe: 'programme',
    libelle: 'Programme',
    items: [
      {
        cle: 'prog_sous_sol',
        libelle: 'Sous-sol (préciser le nombre de niveaux et les aménagements spécifiques)',
      },
      { cle: 'prog_rdc', libelle: 'Rez-de-chaussée (préciser les aménagements)' },
      {
        cle: 'prog_etage_courant',
        libelle: 'Étage courant (préciser le nombre de niveaux et les aménagements)',
      },
      {
        cle: 'prog_terrasse',
        libelle: "Terrasse (préciser les aménagements et l'accessibilité)",
      },
      {
        cle: 'prog_standing',
        libelle: 'Standing (économique, moyen ou haut — préciser la différence)',
      },
      {
        cle: 'prog_gamme',
        libelle: 'Gamme (économique, moyen ou haut — préciser la différence)',
      },
      { cle: 'prog_style', libelle: 'Style (ex. moderne)' },
      { cle: 'prog_autres_infos', libelle: 'Autres informations importantes' },
    ],
  },
  {
    groupe: 'releve_existant',
    libelle: "Relevé de l'existant",
    items: [
      { cle: 'visite_site', libelle: 'Visite sur site' },
      { cle: 'plans_terrain', libelle: 'Plans (terrain)' },
      { cle: 'assainissement', libelle: 'Assainissement' },
      { cle: 'eau', libelle: 'Eau' },
      { cle: 'electricite', libelle: 'Électricité' },
      { cle: 'telephone', libelle: 'Téléphone' },
      { cle: 'photos_videos', libelle: 'Photos et vidéos' },
      { cle: 'autres_infos', libelle: 'Autres informations' },
    ],
  },
  {
    groupe: 'taches_complementaires',
    libelle: 'Tâches complémentaires',
    items: [
      { cle: 'plans_cotes', libelle: 'Plans avec cotations' },
      { cle: 'devis_descriptif', libelle: 'Devis descriptif' },
      { cle: 'plaquettes_commerciales', libelle: 'Plaquettes commerciales' },
    ],
  },
  {
    groupe: 'fichiers_produits',
    libelle: 'Fichiers produits',
    items: [
      { cle: 'dwg_pln', libelle: 'DWG (AutoCAD) / PLN (Archicad)' },
      { cle: 'skp', libelle: 'SKP (SketchUp)' },
      { cle: 'source_rendus', libelle: 'Fichier source des rendus' },
    ],
  },
  {
    groupe: 'dossier_final',
    libelle: 'Dossier final (PDF & images)',
    items: [
      { cle: 'esquisses', libelle: 'Esquisses' },
      {
        cle: 'plans_complets',
        libelle:
          'Plans complets (niveaux, axes, superficies, SHOB, plan de masse, coupes)',
      },
      {
        cle: 'images_3d_facade',
        libelle: 'Images 3D façade (face, gauche, droite, contre-plongée)',
      },
      {
        cle: 'details_livrables',
        libelle: 'Détails façade / cuisine / salle de bain / escaliers',
      },
      {
        cle: 'emplacement_gaines',
        libelle: "Emplacement gaines & locaux techniques (SEN'EAU, SENELEC)",
      },
      { cle: 'validation_client', libelle: 'Validation client (email + bon pour accord)' },
      { cle: 'mood_board', libelle: 'Mood board (matériaux, ambiances)' },
    ],
  },
];

// Toutes les clés à plat, avec leur groupe — jeu de lignes créé d'office à
// l'ouverture de la section (miroir d'ETUDES_PAR_DEFAUT pour la coquille).
export const CLES_CHECKLIST_AVP: { cle: CleChecklistAvp; groupe: GroupeChecklistAvp }[] =
  CHECKLISTS_AVANT_PROJET.flatMap((g) =>
    g.items.map((i) => ({ cle: i.cle, groupe: g.groupe })),
  );

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

// Les 3 jalons standard d'un échéancier de facturation (mandat client), dans
// l'ordre d'affichage. Miroir de JALONS_FACTURE.
export const JALONS_FACTURE: { cle: JalonFacture; libelle: string }[] = [
  { cle: 'signature', libelle: 'Signature du contrat' },
  { cle: 'avant_projet', libelle: "Validation de l'avant-projet" },
  { cle: 'livraison', libelle: 'Livraison' },
];

// Référence d'affichage d'une facture — format PROVISOIRE. Le format légal
// définitif et les mentions obligatoires restent à caler sur un modèle de
// facture réel utilisé aujourd'hui par Grey Concrete (cadrage §10). La donnée
// qui fait foi est le numéro séquentiel (Facture.numero) ; cette chaîne n'est
// qu'un rendu. Miroir de refFacture côté front.
export function refFacture(
  numero: number | null,
  emiseLe: Date | string | null,
  estAvoir: boolean,
): string | null {
  if (numero == null) return null;
  const annee = (emiseLe ? new Date(emiseLe) : new Date()).getFullYear();
  return `${estAvoir ? 'AV' : 'F'}${annee}-${String(numero).padStart(4, '0')}`;
}
