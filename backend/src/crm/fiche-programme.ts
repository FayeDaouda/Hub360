// Fiche Programme dynamique d'un dossier CRM (doc « Création de projet côté
// CRM » §3.4 et captures du boss) : les questions s'adaptent aux réponses —
// la forme bâtie fait bifurquer la suite : la villa a sa typologie, les
// autres formes (immeuble ; local commercial et équipement, ajoutés le
// 09/11/2026) leur composition par niveau. Stockée en JSON
// sur le dossier ; le résumé (colonne Programme) et le nombre de planches en
// sont déduits. Fonctions pures, testées. Miroir des listes :
// frontend/lib/fiche-programme.ts.
//
// HYPOTHÈSE DE TRAVAIL (validée provisoirement le 01/10/2026, règle exacte du
// boss non reçue) — nombre de planches, « une planche = un plan-type, pas un
// étage » :
//  - villa : rez-de-chaussée + étages + sous-sols (chaque niveau est un plan) ;
//  - immeuble, local commercial, équipement : une planche par ligne de la
//    composition (une ligne regroupe des niveaux identiques) ;
//  - la toiture-terrasse accessible et la mezzanine ne comptent pas comme planches.

// Type de projet et usage (09/11/2026) : le type fixe la liste des usages
// proposés ; « Mixte » se décrit à la main (texte libre). Un seul usage.
export const TYPES_PROJET = [
  'residentiel',
  'commercial',
  'industriel',
  'institutionnel',
  'culturel',
  'religieux',
  'transport',
  'agricole',
  'mixte',
] as const;
export const USAGES_PAR_TYPE: Record<Exclude<(typeof TYPES_PROJET)[number], 'mixte'>, readonly string[]> = {
  residentiel: ['maisons_individuelles', 'logements_collectifs', 'immeubles_habitation', 'residences'],
  commercial: ['bureaux', 'commerces', 'centres_commerciaux', 'hotels', 'restaurants'],
  industriel: ['usines', 'entrepots', 'ateliers', 'centres_logistiques'],
  institutionnel: ['ecoles', 'universites', 'hopitaux', 'administrations', 'tribunaux'],
  culturel: ['musees', 'theatres', 'bibliotheques', 'stades', 'salles_sport'],
  religieux: ['eglises', 'mosquees', 'temples', 'synagogues'],
  transport: ['gares', 'aeroports', 'ports', 'parkings'],
  agricole: ['hangars', 'etables', 'serres', 'silos'],
};
// Usage d'un projet mixte, écrit à la main.
export const USAGE_LIBRE_MAX = 120;
export const FORMES = ['villa', 'immeuble', 'local_commercial', 'equipement'] as const;
export const LIBELLES_FORME: Record<(typeof FORMES)[number], string> = {
  villa: 'Villa',
  immeuble: 'Immeuble',
  local_commercial: 'Local commercial',
  equipement: 'Équipement',
};
export const GABARIT_MAX = 15; // R+15
export const SOUS_SOLS_MAX = 3;
export const TYPOLOGIES_VILLA = ['F3', 'F4', 'F5', 'F6', 'F7+'] as const;
export const ANNEXES = ['bureau', 'chambre_service', 'buanderie', 'dependance'] as const;
export const USAGES_NIVEAU = ['logements', 'commerce', 'bureaux', 'parking'] as const;

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
      // Une seule entrée depuis le 09/11/2026 (pré-installation et
      // centralisée fusionnées, migration 20261109200000).
      ['climatisation', 'Climatisation'],
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
const CLES_COMMODITES = new Set(COMMODITES.flatMap((g) => g.items.map(([cle]) => cle)));

type Un<T extends readonly string[]> = T[number];

// Une ligne de « Composition par niveau » (toute forme sauf la villa) : niveaux de → à
// (-3 … -1 = sous-sols, 0 = RDC, n = R+n), usage, typologie, nombre par niveau.
export type LigneComposition = {
  de: number;
  a: number;
  usage: Un<typeof USAGES_NIVEAU> | null;
  typologie: string; // liste du boss à recevoir : saisie courte en attendant
  nb: number;
};

export type FicheProgramme = {
  typeProjet: Un<typeof TYPES_PROJET> | null;
  // Clé de USAGES_PAR_TYPE[typeProjet], ou texte libre pour « Mixte ».
  usage: string | null;
  forme: Un<typeof FORMES> | null;
  gabarit: number; // 0 = RDC (plain-pied), n = R+n
  sousSols: number;
  // Mezzanine (09/11/2026) : décrite, ne compte pas comme planche.
  mezzanine: boolean;
  toitureTerrasse: boolean;
  // Villa
  typologieVilla: Un<typeof TYPOLOGIES_VILLA> | null;
  suiteParentale: boolean;
  annexes: Un<typeof ANNEXES>[];
  // Immeuble, local commercial, équipement
  composition: LigneComposition[];
  commodites: string[];
};

export const FICHE_VIDE: FicheProgramme = {
  typeProjet: null,
  usage: null,
  forme: null,
  gabarit: 0,
  sousSols: 0,
  mezzanine: false,
  toitureTerrasse: false,
  typologieVilla: null,
  suiteParentale: false,
  annexes: [],
  composition: [],
  commodites: [],
};

export class ErreurFicheProgramme extends Error {}

const entier = (v: unknown, min: number, max: number, defaut: number, nom: string): number => {
  if (v === undefined || v === null) return defaut;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new ErreurFicheProgramme(`${nom} : entier de ${min} à ${max} attendu.`);
  }
  return v;
};
function parmi<T extends readonly string[]>(liste: T, v: unknown, nom: string): Un<T> | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !liste.includes(v)) throw new ErreurFicheProgramme(`${nom} : valeur inconnue.`);
  return v as Un<T>;
}

// Usage reçu, contrôlé selon le type : de sa liste, ou texte libre (Mixte) ;
// sans type, pas d'usage.
function usageDuType(type: Un<typeof TYPES_PROJET> | null, v: unknown): string | null {
  if (!type || v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new ErreurFicheProgramme('Usage : valeur inconnue.');
  if (type === 'mixte') {
    const libre = v.trim();
    if (libre.length > USAGE_LIBRE_MAX) {
      throw new ErreurFicheProgramme(`Usage : ${USAGE_LIBRE_MAX} caractères au plus.`);
    }
    return libre || null;
  }
  if (!USAGES_PAR_TYPE[type].includes(v))
    throw new ErreurFicheProgramme('Usage : valeur inconnue pour ce type de projet.');
  return v;
}

// Forme bâtie lue dans une Fiche Programme enregistrée (JSON) ; null si
// elle n'est pas choisie ou si la fiche n'existe pas. Remplace l'ancien type
// de bien (DossierCrm.type) dans les affichages depuis le 09/11/2026.
export function formeDe(fiche: unknown): Un<typeof FORMES> | null {
  const forme = fiche && typeof fiche === 'object' ? (fiche as Record<string, unknown>).forme : null;
  return typeof forme === 'string' && (FORMES as readonly string[]).includes(forme)
    ? (forme as Un<typeof FORMES>)
    : null;
}

// Décrite niveau par niveau : toute forme choisie sauf la villa.
export const avecComposition = (forme: FicheProgramme['forme']): boolean => forme !== null && forme !== 'villa';

// Nettoie une fiche reçue : valeurs connues seulement, branche inutile
// effacée (une villa n'a pas de composition, les autres formes pas de
// typologie de villa), lignes de composition ramenées dans les niveaux existants.
export function normaliserFiche(brut: unknown): FicheProgramme {
  if (!brut || typeof brut !== 'object') throw new ErreurFicheProgramme('Fiche Programme invalide.');
  const f = brut as Record<string, unknown>;
  const forme = parmi(FORMES, f.forme, 'Forme bâtie');
  const typeProjet = parmi(TYPES_PROJET, f.typeProjet, 'Type de projet');
  const gabarit = entier(f.gabarit, 0, GABARIT_MAX, 0, 'Gabarit');
  const sousSols = entier(f.sousSols, 0, SOUS_SOLS_MAX, 0, 'Sous-sols');
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  // Une ligne regroupe des niveaux : jamais plus de lignes que de niveaux possibles.
  if (Array.isArray(f.composition) && f.composition.length > GABARIT_MAX + SOUS_SOLS_MAX + 1) {
    throw new ErreurFicheProgramme('Composition : une ligne par niveau au plus.');
  }
  const composition: LigneComposition[] = !avecComposition(forme)
    ? []
    : (Array.isArray(f.composition) ? f.composition : []).flatMap((l: unknown) => {
        const r = (l ?? {}) as Record<string, unknown>;
        const de = Math.max(entier(r.de, -SOUS_SOLS_MAX, GABARIT_MAX, 0, 'Composition · de'), -sousSols);
        const a = Math.min(entier(r.a, -SOUS_SOLS_MAX, GABARIT_MAX, 0, 'Composition · à'), gabarit);
        if (de > a) return [];
        const typologie = typeof r.typologie === 'string' ? r.typologie.trim().slice(0, 20) : '';
        return [
          {
            de,
            a,
            usage: parmi(USAGES_NIVEAU, r.usage, 'Composition · usage'),
            typologie,
            nb: entier(r.nb, 1, 999, 1, 'Composition · nombre'),
          },
        ];
      });

  return {
    typeProjet,
    usage: usageDuType(typeProjet, f.usage),
    forme,
    gabarit,
    sousSols,
    mezzanine: f.mezzanine === true,
    toitureTerrasse: f.toitureTerrasse === true,
    typologieVilla: forme === 'villa' ? parmi(TYPOLOGIES_VILLA, f.typologieVilla, 'Typologie de la villa') : null,
    suiteParentale: forme === 'villa' && f.suiteParentale === true,
    annexes:
      forme === 'villa'
        ? ([...new Set(liste(f.annexes).filter((x) => (ANNEXES as readonly string[]).includes(x)))] as Un<
            typeof ANNEXES
          >[])
        : [],
    composition,
    commodites: [...new Set(liste(f.commodites).filter((x) => CLES_COMMODITES.has(x)))],
  };
}

// Niveaux du bâtiment, du plus bas au plus haut (-3 … R+15).
export function niveaux(f: Pick<FicheProgramme, 'gabarit' | 'sousSols'>): number[] {
  return Array.from({ length: f.gabarit + f.sousSols + 1 }, (_, i) => i - f.sousSols);
}

export const libelleNiveau = (n: number) => (n < 0 ? `SS${-n}` : n === 0 ? 'RDC' : `R+${n}`);

// Niveaux (hors villa) que la composition ne décrit pas, et ceux décrits
// plusieurs fois (deux lignes qui se chevauchent).
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

const ligneComplete = (l: LigneComposition) => !!l.usage && (l.usage !== 'logements' || !!l.typologie);

// Bâtiment décrit : forme, puis la branche (typologie de la villa, ou
// composition complète sans niveau oublié ni en double). C'est lui seul qui
// fixe les planches, donc le prix : jamais le type de projet ni l'usage.
export function batimentDecrit(f: FicheProgramme): boolean {
  if (!f.forme) return false;
  if (f.forme === 'villa') return !!f.typologieVilla;
  const c = controleComposition(f);
  return f.composition.length > 0 && f.composition.every(ligneComplete) && !c.nonDecrits.length && !c.enDouble.length;
}

// Programme décrit : type de projet et usage, puis le bâtiment.
export function programmeComplet(f: FicheProgramme): boolean {
  return !!f.typeProjet && !!f.usage && batimentDecrit(f);
}

// Planches déduites (cf. hypothèse en tête) ; null tant qu'on ne peut pas les
// calculer (forme inconnue, composition incomplète) : saisie manuelle alors.
export function planchesCalculees(f: FicheProgramme): number | null {
  if (f.forme === 'villa') return f.gabarit + 1 + f.sousSols;
  if (avecComposition(f.forme) && batimentDecrit(f)) return f.composition.length;
  return null;
}

// Totaux d'une composition par usage et, pour les logements, par typologie.
export function totaux(f: FicheProgramme): { logements: Map<string, number>; autres: Map<string, number> } {
  const logements = new Map<string, number>();
  const autres = new Map<string, number>();
  for (const l of f.composition) {
    if (!l.usage) continue;
    const n = (l.a - l.de + 1) * l.nb;
    if (l.usage === 'logements') logements.set(l.typologie || '?', (logements.get(l.typologie || '?') ?? 0) + n);
    else autres.set(l.usage, (autres.get(l.usage) ?? 0) + n);
  }
  return { logements, autres };
}

const LIBELLE_ANNEXE: Record<Un<typeof ANNEXES>, string> = {
  bureau: 'bureau',
  chambre_service: 'chambre de service',
  buanderie: 'buanderie',
  dependance: 'dépendance',
};
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const AUTRES: Record<string, [string, string]> = {
  commerce: ['commerce', 'commerces'],
  bureaux: ['bureau', 'bureaux'],
  parking: ['parking', 'parkings'],
};

// Résumé automatique (colonne Programme du registre) : vide tant que le
// programme n'est pas décrit — le champ « programme » de la fiche reste alors
// à remplir.
export function resume(f: FicheProgramme): string {
  if (!programmeComplet(f)) return '';
  const hauteur = f.gabarit === 0 ? 'plain-pied' : `R+${f.gabarit}`;
  const parties: string[] = [`${LIBELLES_FORME[f.forme!]} ${hauteur}`];
  if (f.sousSols) parties.push(pluriel(f.sousSols, 'sous-sol', 'sous-sols'));
  if (f.forme === 'villa') {
    parties.push(f.typologieVilla!);
    if (f.suiteParentale) parties.push('suite parentale');
    if (f.annexes.length) parties.push(f.annexes.map((a) => LIBELLE_ANNEXE[a]).join(', '));
  } else {
    const t = totaux(f);
    const nbLogements = [...t.logements.values()].reduce((s, n) => s + n, 0);
    if (nbLogements) {
      const detail = [...t.logements.entries()].map(([typo, n]) => `${n} ${typo}`).join(', ');
      parties.push(`${pluriel(nbLogements, 'logement', 'logements')} (${detail})`);
    }
    for (const [usage, n] of t.autres) parties.push(pluriel(n, ...AUTRES[usage]));
  }
  if (f.mezzanine) parties.push('mezzanine');
  if (f.toitureTerrasse) parties.push('toiture-terrasse accessible');
  if (f.commodites.length) parties.push(pluriel(f.commodites.length, 'commodité', 'commodités'));
  return parties.join(' · ');
}
