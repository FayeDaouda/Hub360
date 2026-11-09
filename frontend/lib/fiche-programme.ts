// Fiche Programme dynamique (doc « Création de projet côté CRM » §3.4) : listes
// et libellés de la maquette, et les calculs affichés en direct (niveaux non
// décrits, totaux, planches). Miroir de backend/src/crm/fiche-programme.ts —
// le serveur recalcule et fait foi (résumé, planches enregistrées).

import { TYPES_BIEN, type TypeBien } from './types';

export type Usage = 'residentiel' | 'commercial' | 'mixte' | 'bureau';
// Local commercial et équipement (09/11/2026) : décrits niveau par niveau,
// comme l'immeuble ; seule la villa a sa propre branche.
export type Forme = 'villa' | 'immeuble' | 'local_commercial' | 'equipement';
export type TypologieVilla = 'F3' | 'F4' | 'F5' | 'F6' | 'F7+';
export type Annexe = 'bureau' | 'chambre_service' | 'buanderie' | 'dependance';
export type UsageNiveau = 'logements' | 'commerce' | 'bureaux' | 'parking';

export type LigneComposition = { de: number; a: number; usage: UsageNiveau | null; typologie: string; nb: number };

export type FicheProgramme = {
  usage: Usage | null;
  forme: Forme | null;
  gabarit: number; // 0 = RDC (plain-pied), n = R+n
  sousSols: number;
  toitureTerrasse: boolean;
  typologieVilla: TypologieVilla | null;
  suiteParentale: boolean;
  annexes: Annexe[];
  composition: LigneComposition[];
  commodites: string[];
};

export const FICHE_VIDE: FicheProgramme = {
  usage: null,
  forme: null,
  gabarit: 0,
  sousSols: 0,
  toitureTerrasse: false,
  typologieVilla: null,
  suiteParentale: false,
  annexes: [],
  composition: [],
  commodites: [],
};

export const USAGES: Record<Usage, string> = {
  residentiel: 'Résidentiel',
  commercial: 'Commercial',
  mixte: 'Mixte',
  bureau: 'Bureau',
};
export const FORMES: Record<Forme, string> = {
  villa: 'Villa',
  immeuble: 'Immeuble',
  local_commercial: 'Local commercial',
  equipement: 'Équipement',
};

// Nature de l'ouvrage affichée (registre, factures, Facturation). Le type de
// projet d'un dossier antérieur au 09/11/2026 passe d'abord : une facture
// déjà émise garde sa désignation (« Immeuble de bureaux — Ngor ») à la
// réimpression. Sinon la forme bâtie du programme, figée avec la fiche à la
// soumission au CFO, donc avant toute facture ; null si ni l'un ni l'autre.
export function libelleOuvrage(forme: Forme | null | undefined, type: TypeBien | null | undefined): string | null {
  if (type) return TYPES_BIEN[type];
  return forme ? FORMES[forme] : null;
}

// Décrite niveau par niveau : toute forme choisie sauf la villa.
export const avecComposition = (forme: Forme | null): boolean => forme !== null && forme !== 'villa';
export const GABARITS = Array.from({ length: 16 }, (_, n) => ({
  valeur: n,
  libelle: n === 0 ? 'RDC (plain-pied)' : `R+${n}`,
}));
export const SOUS_SOLS = [
  { valeur: 0, libelle: 'Aucun' },
  { valeur: 1, libelle: '1 sous-sol' },
  { valeur: 2, libelle: '2 sous-sols' },
  { valeur: 3, libelle: '3 sous-sols' },
];
export const TYPOLOGIES_VILLA: Record<TypologieVilla, string> = {
  F3: 'F3 · séjour + 2 chambres',
  F4: 'F4 · séjour + 3 chambres',
  F5: 'F5 · séjour + 4 chambres',
  F6: 'F6 · séjour + 5 chambres',
  'F7+': 'F7 et plus',
};
export const ANNEXES: Record<Annexe, string> = {
  bureau: 'Bureau',
  chambre_service: 'Chambre de service',
  buanderie: 'Buanderie',
  dependance: 'Dépendance',
};
export const USAGES_NIVEAU: Record<UsageNiveau, string> = {
  logements: 'Logements',
  commerce: 'Commerce',
  bureaux: 'Bureaux',
  parking: 'Parking',
};
// Paliers de la maquette ; « Autre surface… » ouvre une saisie libre.
export const SURFACES = [150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5000];
// Saisie manuelle des planches tant qu'elles ne se calculent pas (maquette : 1 à 12).
export const PLANCHES_MANUELLES = Array.from({ length: 12 }, (_, i) => i + 1);

export const COMMODITES: { groupe: string; items: [string, string][] }[] = [
  {
    groupe: 'Stationnement et accès',
    items: [
      ['parking_exterieur', 'Parking extérieur'],
      ['parking_sous_sol', 'Parking sous-sol'],
      ['garage_box', 'Garage fermé / box'],
      ['bornes_recharge', 'Bornes de recharge électrique'],
      ['portail_motorise', 'Portail motorisé'],
      ['acces_badge', 'Accès par badge'],
    ],
  },
  {
    groupe: 'Circulation',
    items: [
      ['ascenseur', 'Ascenseur'],
      ['monte_charge', 'Monte-charge'],
      ['escalier_secours', 'Escalier de secours'],
    ],
  },
  {
    groupe: 'Sécurité',
    items: [
      ['gardiennage', 'Gardiennage 24 h/24'],
      ['guerite', 'Guérite'],
      ['videosurveillance', 'Vidéosurveillance'],
      ['interphone', 'Interphone / visiophone'],
      ['detection_incendie', 'Détection incendie'],
      ['cloture', 'Clôture périphérique'],
    ],
  },
  {
    groupe: 'Énergie et eau',
    items: [
      ['groupe_electrogene', 'Groupe électrogène'],
      ['panneaux_solaires', 'Panneaux solaires'],
      ['chauffe_eau_solaire', 'Chauffe-eau solaire'],
      ['bache_surpresseur', 'Bâche à eau + surpresseur'],
      ['forage', 'Forage'],
      ['eaux_pluviales', 'Récupération des eaux pluviales'],
      ['station_epuration', 'Station d’épuration'],
    ],
  },
  {
    groupe: 'Confort et connectivité',
    items: [
      ['pre_climatisation', 'Pré-installation climatisation'],
      ['climatisation_centralisee', 'Climatisation centralisée'],
      ['fibre', 'Fibre optique'],
      ['antenne_tv', 'Antenne TV collective'],
      ['domotique', 'Domotique'],
    ],
  },
  {
    groupe: 'Loisirs et bien-être',
    items: [
      ['piscine', 'Piscine'],
      ['bassin_enfants', 'Bassin enfants'],
      ['salle_sport', 'Salle de sport'],
      ['spa', 'Spa / hammam'],
      ['rooftop', 'Rooftop aménagé'],
      ['multisport', 'Terrain multisport'],
      ['aire_jeux', 'Aire de jeux'],
      ['jardin', 'Jardin / espaces verts'],
      ['salle_polyvalente', 'Salle polyvalente'],
    ],
  },
  {
    groupe: 'Services et vie collective',
    items: [
      ['conciergerie', 'Conciergerie'],
      ['hall_accueil', 'Hall d’accueil'],
      ['salle_priere', 'Salle de prière'],
      ['coworking', 'Espace coworking'],
      ['buanderie_commune', 'Buanderie commune'],
      ['local_poubelles', 'Local poubelles'],
      ['local_technique', 'Local technique'],
      ['commerce_proximite', 'Commerce de proximité'],
      ['abattoir', 'Abattoir'],
    ],
  },
];

export const libelleNiveau = (n: number) => (n < 0 ? `SS${-n}` : n === 0 ? 'RDC' : `R+${n}`);

export function niveaux(f: Pick<FicheProgramme, 'gabarit' | 'sousSols'>): number[] {
  return Array.from({ length: f.gabarit + f.sousSols + 1 }, (_, i) => i - f.sousSols);
}

export function controleComposition(f: FicheProgramme): { nonDecrits: number[]; enDouble: number[] } {
  const compte = new Map<number, number>();
  for (const l of f.composition) for (let n = l.de; n <= l.a; n++) compte.set(n, (compte.get(n) ?? 0) + 1);
  return {
    nonDecrits: niveaux(f).filter((n) => !compte.has(n)),
    enDouble: [...compte.entries()]
      .filter(([, c]) => c > 1)
      .map(([n]) => n)
      .sort((x, y) => x - y),
  };
}

// Totaux par typologie (logements) et par usage, comme « Les totaux par
// typologie se calculent… » de la maquette.
export function totaux(f: FicheProgramme): { libelle: string; n: number }[] {
  const t = new Map<string, number>();
  for (const l of f.composition) {
    if (!l.usage) continue;
    const cle = l.usage === 'logements' ? l.typologie || 'Logements sans typologie' : USAGES_NIVEAU[l.usage];
    t.set(cle, (t.get(cle) ?? 0) + (l.a - l.de + 1) * l.nb);
  }
  return [...t.entries()].map(([libelle, n]) => ({ libelle, n }));
}

const ligneComplete = (l: LigneComposition) => !!l.usage && (l.usage !== 'logements' || !!l.typologie.trim());

// Programme décrit (mêmes règles que le serveur) : usage, forme, puis la
// typologie de la villa ou, pour les autres formes, une composition complète.
export function programmeComplet(f: FicheProgramme): boolean {
  if (!f.usage || !f.forme) return false;
  if (f.forme === 'villa') return !!f.typologieVilla;
  const c = controleComposition(f);
  return f.composition.length > 0 && f.composition.every(ligneComplete) && !c.nonDecrits.length && !c.enDouble.length;
}

// Planches déduites (hypothèse de travail, cf. backend) : villa = RDC +
// étages + sous-sols ; autres formes = lignes de composition ; null sinon.
export function planchesCalculees(f: FicheProgramme): number | null {
  if (f.forme === 'villa') return f.gabarit + 1 + f.sousSols;
  if (avecComposition(f.forme) && programmeComplet(f)) return f.composition.length;
  return null;
}
