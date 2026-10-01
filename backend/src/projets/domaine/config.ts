import {
  Categorie,
  EtapePreBilan,
  FactureType,
  GroupeChecklistAvp,
  GroupeChecklistExecution,
  GroupeChecklistPermis,
  GroupeUnbord,
  JalonFacture,
  NatureDossier,
  Phase,
  TypeEtude,
} from '@prisma/client';

// Tables de paramétrage par catégorie — miroir de frontend/lib/types.ts
// (PHASES_PAR_CATEGORIE, ETAPES_PRE_BILAN, LIGNES_PRE_BILAN,
// SECTIONS_PAR_CATEGORIE, ETUDES_PAR_DEFAUT).
// À garder synchronisées des deux côtés.

// « Développement » suit la conception (hypothèse de travail, oct. 2026, à
// confirmer) — ici comme pour le pré-bilan et les sections.
export const PHASES_PAR_CATEGORIE: Record<Categorie, Phase[]> = {
  conception: ['avant_projet', 'permis', 'etudes', 'chantier', 'livre'],
  developpement: ['avant_projet', 'permis', 'etudes', 'chantier', 'livre'],
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
  developpement: ['esq', 'aps', 'apd'],
  amenagement: ['estimation', 'definitif'],
};

export const LIGNES_PRE_BILAN: Record<Categorie, string[]> = {
  conception: ['charges_foncieres', 'travaux', 'honoraires', 'frais_divers', 'aleas'],
  developpement: ['charges_foncieres', 'travaux', 'honoraires', 'frais_divers', 'aleas'],
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
  developpement: ['avant-projet', 'images', 'documents', 'permis', 'etude', 'execution'],
  amenagement: ['avant-projet', 'images', 'documents', 'execution'],
};

// -- Section « Permis » (conception uniquement) --

// « Dossier technique » retiré de l'UI (sept. 2026, restructuration Permis —
// fait double emploi avec la checklist « Constitution » ci-dessous). Champs/
// fonction laissés intacts et dormants (schéma, service, dossierPermisComplet)
// — même traitement que Pré-bilan/Affectation avant lui sur Avant-projet :
// rien de supprimé, juste plus aucune UI ne les pose. Miroir de
// frontend/lib/types.ts::PIECES_DOSSIER_PERMIS.
export const PIECES_DOSSIER_PERMIS = [
  'titrePropriete',
  'planCadastralVise',
  'plansApd',
  'devis',
  'timbreFiscal',
] as const;

export type PieceDossierPermis = (typeof PIECES_DOSSIER_PERMIS)[number];

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

// -- Section « Unbord » (ex-Documents, restructurée en checklist à fichiers,
//    sept. 2026) : 2 groupes fixes — pas configurables, contrairement aux
//    items qu'ils contiennent (gabarit par société depuis le 2026-09-24, cf.
//    LigneUnbordGabarit/UnbordGabaritService — les 14 items d'origine listés
//    ci-dessous ne sont plus lus par le code, ils ne servent qu'à amorcer le
//    gabarit de Grey Concrete dans prisma/seed.ts). « Relevé de l'existant »
//    reprend volontairement le même intitulé/ordre que le groupe homonyme
//    d'Avant-projet (cf. CHECKLISTS_AVP plus bas) — même réalité de terrain,
//    suivie ici par présence de fichier plutôt que par case à cocher manuelle.
export const GROUPES_UNBORD: { groupe: GroupeUnbord; libelle: string; description: string }[] = [
  {
    groupe: 'documents',
    libelle: 'Documents',
    description: 'Pièces administratives et juridiques du terrain.',
  },
  {
    groupe: 'releve_existant',
    libelle: "Relevé de l'existant",
    description: 'Constat du terrain avant conception.',
  },
];

// Phase qui suit « avant_projet » pour une catégorie donnée.
export function phaseApresAvantProjet(categorie: Categorie): Phase {
  return PHASES_PAR_CATEGORIE[categorie][1];
}

// -- Section « Avant-projet » : sous-checklists opérationnelles --

// Le GABARIT des checklists Trello Grey Concrete, dans l'ordre d'affichage —
// sert uniquement à amorcer les 16 lignes standard d'un nouvel avant-projet
// (coquilleAvantProjet). Au-delà de cet instant T, les lignes vivent en base
// (LigneChecklistAvp : libelle/ordre propres) — l'admin ou le dispatcher
// d'une cellule du projet peuvent en ajouter ou en retirer, indépendamment de
// ce gabarit. `cle` n'est qu'un repère de provenance Trello interne à ce
// fichier, plus une clé de stockage.
// Miroir de frontend/lib/types.ts::CHECKLISTS_AVANT_PROJET — à garder synchro.
//
// Restructuration sept. 2026 : plus que 2 groupes — Livrables (ex-« Tâches
// complémentaires », étendu à 13 items) et Fichiers produits (inchangé). Les
// groupes Programme et Relevé de l'existant sont retirés (doublonnaient /
// n'apportaient plus rien à ce stade) — leurs lignes déjà seedées sont
// soft-deletées par la migration avant_projet_restructuration ; les valeurs
// d'enum restent en base (même motif que dossier_final avant elles, cf.
// schema.prisma). Chaque item peut désormais recevoir des fichiers — statut
// dérivé de leur présence, plus de case « fait »/note manuelles (même modèle
// que Foncier/Unbord).
export const CHECKLISTS_AVANT_PROJET: {
  groupe: GroupeChecklistAvp;
  libelle: string;
  description: string;
  items: { cle: string; libelle: string }[];
}[] = [
  {
    groupe: 'taches_complementaires',
    libelle: 'Livrables',
    description: 'Livrables de conception à produire et transmettre au client.',
    items: [
      { cle: 'esquisses', libelle: 'Esquisses' },
      {
        cle: 'plans',
        libelle:
          'Plans (dessin de tous les niveaux, axes, superficies des pièces et SHOB, aménagements, plan de masse, coupe)',
      },
      {
        cle: 'images_synthese_facade_3d',
        libelle: 'Images de synthèse façade 3D (vue de face, gauche, droite, contre-plongée)',
      },
      { cle: 'details_facade', libelle: 'Détails façade (coupes et perspectives)' },
      { cle: 'details_cuisine', libelle: 'Détails cuisine (coupes et perspectives)' },
      { cle: 'details_salle_de_bain', libelle: 'Détails salle de bain (coupes et perspectives)' },
      { cle: 'details_escaliers', libelle: 'Détails escaliers (coupes et perspectives)' },
      {
        cle: 'emplacement_gaines',
        libelle:
          "Emplacement des gaines, local technique (SEN'EAU et SENELEC), bâche à eau et local gaz",
      },
      {
        cle: 'validation_client',
        libelle: 'Validation client (envoi par e-mail et bon pour accord sur les plans physiques)',
      },
      { cle: 'mood_board', libelle: 'Mood Board (matériaux et ambiances des aménagements)' },
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

// Le GABARIT des checklists Permis (miroir Trello Grey Concrete), même motif
// que CHECKLISTS_AVANT_PROJET ci-dessus — amorce les lignes standard, l'admin
// ajoute/retire ensuite par projet (LigneChecklistPermis). Distinct des
// verrous durs du modèle Permis (nicad/dossier 5 pièces/statut) : juste un %
// de suivi opérationnel, indépendant.
// La numérotation du groupe « Procédure » saute de 6 à 8 (pas de « 7. » dans
// le Trello source) — reproduite telle quelle plutôt que « corrigée ».
//
// Restructuration sept. 2026 : « Dossier de Permis de construire » renommé
// « Constitution » — items INCHANGÉS (les 12 pièces restent cochables
// individuellement), mais plus de bouton « joindre » par item : UN seul
// point d'upload au niveau du bloc, où on choisit l'item concerné au moment
// de joindre (cf. JoindreAvecItemModal, frontend) — plus premium que 12
// boutons éparpillés, mais le fichier reste rattaché à SON item précis
// (ligneChecklistPermisId, comme avant), pas au bloc entier. Dépôt urbanisme
// / Procédure : même retrait du bouton par item, mais leur point d'upload
// partagé ne demande PAS de choisir un item — direct au niveau du bloc (cf.
// BlocPermis.images/fichiers, schema.prisma) puisque leurs pièces ne
// correspondent pas à un item précis de la même façon.
export const CHECKLISTS_PERMIS: {
  groupe: GroupeChecklistPermis;
  libelle: string;
  description: string;
  items: { cle: string; libelle: string }[];
}[] = [
  {
    groupe: 'dossier_permis',
    libelle: 'Constitution',
    description: 'Pièces à réunir pour constituer le dossier administratif.',
    items: [
      { cle: 'mail_depot', libelle: 'Mail pour dépôt' },
      { cle: 'droit_reel', libelle: 'Droit réel' },
      { cle: 'plan_cadastral', libelle: 'Plan cadastral' },
      { cle: 'id', libelle: 'ID' },
      { cle: 'ninea', libelle: 'Ninéa (pour les SCI)' },
      {
        cle: 'notice_securite',
        libelle: 'Notice de sécurité (projet avec publique)',
      },
      { cle: 'quittance_redevances', libelle: 'Quittance sur les redevances' },
      { cle: 'plans_cotation', libelle: 'Plans avec cotation' },
      { cle: 'coupe', libelle: 'Coupe' },
      { cle: 'facade', libelle: 'Façade' },
      { cle: 'fiche_technique', libelle: 'Fiche technique' },
      {
        cle: 'decharge_responsabilite',
        libelle:
          'Décharge de responsabilité client (si le client refuse de faire son permis de construire)',
      },
    ],
  },
  {
    groupe: 'depot_urbanisme',
    libelle: 'Dépôt urbanisme',
    description: 'Dépôt du dossier au service urbanisme et formalités associées.',
    items: [
      { cle: 'depot', libelle: 'Dépôt' },
      {
        cle: 'partage_infos_connexion',
        libelle:
          'Partage des infos de connexion et récépissé de dépôt avec le client par mail',
      },
      {
        cle: 'frais_depot',
        libelle: 'Frais de dépôt (urbanisme, montant à remplir)',
      },
      { cle: 'cachet_architecte', libelle: "Cachet de l'architecte" },
    ],
  },
  {
    groupe: 'procedure',
    libelle: 'Procédure',
    description: "Organismes à consulter dans le circuit d'instruction du permis.",
    items: [
      { cle: 'organisme_1', libelle: '1. Bureau de permis de construire' },
      { cle: 'organisme_2', libelle: '2. Bureau étude et lotissement' },
      { cle: 'organisme_3', libelle: '3. Cadastre' },
      { cle: 'organisme_4', libelle: '4. Domaine' },
      { cle: 'organisme_5', libelle: '5. Protection civile' },
      { cle: 'organisme_6', libelle: '6. Chef de direction régionale urbaine' },
      { cle: 'organisme_8', libelle: '8. Mairie' },
      { cle: 'organisme_9', libelle: '9. Préfecture' },
      { cle: 'organisme_10', libelle: '10. Urbanisme' },
    ],
  },
];

export const GROUPES_CHECKLIST_PERMIS: {
  groupe: GroupeChecklistPermis;
  libelle: string;
  description: string;
}[] = CHECKLISTS_PERMIS.map((g) => ({
  groupe: g.groupe,
  libelle: g.libelle,
  description: g.description,
}));

export const GABARIT_CHECKLIST_PERMIS: {
  groupe: GroupeChecklistPermis;
  libelle: string;
  ordre: number;
}[] = CHECKLISTS_PERMIS.flatMap((g) =>
  g.items.map((item, ordre) => ({ groupe: g.groupe, libelle: item.libelle, ordre })),
);

// Le GABARIT des checklists Exécution (miroir Trello Grey Concrete), même
// motif que CHECKLISTS_PERMIS ci-dessus — 8 blocs fixes, chacun avec sa
// propre échéance et son responsable (BlocExecution). S'applique aux deux
// catégories avec le même gabarit (décision boss, sept. 2026, cf. mémoire).
// « CCTP » est vide pour l'instant côté Trello — le groupe existe déjà, prêt
// à recevoir des items ajoutés par l'admin.
// « Études (Bureaux) » (groupe 'etudes') et « Les Plans » (groupe 'plans')
// retirés sur demande explicite (sept. 2026) — même traitement dormant que
// Pré-bilan/Affectation/Dossier technique avant eux : l'enum
// GroupeChecklistExecution et les lignes déjà créées sur des projets en
// cours (et leurs fichiers) restent intacts, juste plus jamais servis ici.
export const CHECKLISTS_EXECUTION: {
  groupe: GroupeChecklistExecution;
  libelle: string;
  description: string;
  items: { cle: string; libelle: string }[];
}[] = [
  {
    groupe: 'viabilite',
    libelle: 'Viabilité',
    description: 'Réseaux à raccorder.',
    items: [
      { cle: 'assainissement', libelle: 'Assainissement' },
      { cle: 'eau', libelle: 'Eau' },
      { cle: 'electricite_viabilite', libelle: 'Électricité' },
      { cle: 'telephone', libelle: 'Téléphone' },
    ],
  },
  {
    groupe: 'locaux_technique',
    libelle: 'Locaux techniques',
    description: 'Équipements techniques à prévoir.',
    items: [
      { cle: 'groupe_electrogene', libelle: 'Groupe électrogène' },
      { cle: 'bache_a_eau', libelle: 'Bâche à eau' },
      { cle: 'fosse_relevage', libelle: 'Fosse de relevage et regards' },
      { cle: 'local_comptage', libelle: 'Local comptage' },
      { cle: 'electricite_locaux', libelle: 'Électricité' },
      { cle: 'plomberie', libelle: 'Plomberie' },
      { cle: 'climatisation', libelle: 'Climatisation' },
      { cle: 'securite_incendie', libelle: 'Sécurité incendie' },
      { cle: 'securite_antivol', libelle: 'Sécurité surveillance et antivol (informatique)' },
    ],
  },
  {
    groupe: 'amenagements',
    libelle: 'Aménagements',
    description: 'Aménagements intérieurs à détailler.',
    items: [
      { cle: 'cuisine_buanderie', libelle: 'Cuisine et buanderie' },
      { cle: 'salles_de_bain', libelle: 'Salles de bain et toilettes' },
      { cle: 'chambres', libelle: 'Chambres' },
      { cle: 'pieces_a_vivre', libelle: 'Pièces à vivre' },
      { cle: 'paysage_amenagement', libelle: 'Paysage' },
      { cle: 'faux_plafond', libelle: 'Faux plafond (coupe des différents types)' },
    ],
  },
  {
    groupe: 'menuiserie',
    libelle: 'Cahiers de menuiserie',
    description: 'Menuiseries par matériau.',
    items: [
      { cle: 'bois', libelle: 'Bois' },
      { cle: 'metallique', libelle: 'Métallique' },
      { cle: 'aluminium', libelle: 'Aluminium' },
    ],
  },
  {
    groupe: 'details',
    libelle: 'Détails',
    description: 'Finitions et équipements à détailler.',
    items: [
      { cle: 'revetements_sol', libelle: 'Revêtements sol' },
      { cle: 'revetements_mural', libelle: 'Revêtements mural' },
      { cle: 'sanitaires', libelle: 'Sanitaires' },
      { cle: 'equipements', libelle: 'Équipements' },
      { cle: 'cuisine_details', libelle: 'Cuisine' },
      { cle: 'luminaires', libelle: 'Luminaires' },
      { cle: 'piscine', libelle: 'Piscine' },
      { cle: 'ascenseur', libelle: 'Ascenseur' },
      { cle: 'paysage_details', libelle: 'Paysage' },
    ],
  },
  {
    groupe: 'cctp',
    libelle: 'CCTP',
    description: 'Cahier des clauses techniques particulières.',
    items: [],
  },
];

export const GROUPES_CHECKLIST_EXECUTION: {
  groupe: GroupeChecklistExecution;
  libelle: string;
  description: string;
}[] = CHECKLISTS_EXECUTION.map((g) => ({
  groupe: g.groupe,
  libelle: g.libelle,
  description: g.description,
}));

export const GABARIT_CHECKLIST_EXECUTION: {
  groupe: GroupeChecklistExecution;
  libelle: string;
  ordre: number;
}[] = CHECKLISTS_EXECUTION.flatMap((g) =>
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
