import {
  Categorie,
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

// Le GABARIT des checklists Trello Grey Concrete, dans l'ordre d'affichage —
// sert uniquement à amorcer les 29 lignes standard d'un nouvel avant-projet
// (coquilleAvantProjet). Au-delà de cet instant T, les lignes vivent en base
// (LigneChecklistAvp : libelle/ordre propres) — l'admin peut en ajouter ou en
// retirer par projet, indépendamment de ce gabarit. `cle` n'est qu'un repère
// de provenance Trello interne à ce fichier, plus une clé de stockage.
// Miroir de frontend/lib/types.ts::CHECKLISTS_AVANT_PROJET — à garder synchro.
//
// Pas de groupe « Dossier final (PDF & images) » : retiré (déc. — sept.
// 2026), son contenu (esquisses, plans, images 3D, mood board…) fait double
// emploi avec les vrais fichiers déjà suivis dans les sections Images /
// Documents de chaque projet. Les lignes déjà seedées sur les projets
// existants sont soft-deletées par la migration
// avp_checklist_retire_dossier_final.
export const CHECKLISTS_AVANT_PROJET: {
  groupe: GroupeChecklistAvp;
  libelle: string;
  description: string;
  items: { cle: string; libelle: string }[];
}[] = [
  {
    groupe: 'programme',
    libelle: 'Programme',
    description:
      'Besoins spatiaux niveau par niveau, et positionnement (standing, gamme, style).',
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
    description:
      'Documente le terrain avant conception — sans ça, l’équipe dessine à l’aveugle.',
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
    description: 'Livrables intermédiaires côté commercial et technique.',
    items: [
      { cle: 'plans_cotes', libelle: 'Plans avec cotations' },
      { cle: 'devis_descriptif', libelle: 'Devis descriptif' },
      { cle: 'plaquettes_commerciales', libelle: 'Plaquettes commerciales' },
    ],
  },
  {
    groupe: 'fichiers_produits',
    libelle: 'Fichiers produits',
    description: 'Suivi des formats de fichiers de travail générés, pour retrouver les bonnes sources.',
    items: [
      { cle: 'dwg_pln', libelle: 'DWG (AutoCAD) / PLN (Archicad)' },
      { cle: 'skp', libelle: 'SKP (SketchUp)' },
      { cle: 'source_rendus', libelle: 'Fichier source des rendus' },
    ],
  },
];

// Les 4 groupes, leur libellé et leur description, dans l'ordre d'affichage —
// sert à construire la réponse `checklists` même quand un groupe n'a
// (temporairement) plus aucune ligne (tout supprimé par l'admin sur ce
// projet).
export const GROUPES_CHECKLIST_AVP: {
  groupe: GroupeChecklistAvp;
  libelle: string;
  description: string;
}[] = CHECKLISTS_AVANT_PROJET.map((g) => ({
  groupe: g.groupe,
  libelle: g.libelle,
  description: g.description,
}));

// Gabarit à plat (groupe + libellé + ordre dans le groupe) — jeu de lignes
// créé d'office à l'ouverture de la section (miroir d'ETUDES_PAR_DEFAUT pour
// la coquille). Purement une valeur de départ : n'est plus relu après coup,
// contrairement à l'ancien CLES_CHECKLIST_AVP qui pilotait aussi la lecture.
export const GABARIT_CHECKLIST_AVP: {
  groupe: GroupeChecklistAvp;
  libelle: string;
  ordre: number;
}[] = CHECKLISTS_AVANT_PROJET.flatMap((g) =>
  g.items.map((item, ordre) => ({ groupe: g.groupe, libelle: item.libelle, ordre })),
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
