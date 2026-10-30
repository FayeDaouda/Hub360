import type {
  OpenProjectFile,
  OpenProjectsBoard,
  ProductionRow,
  ProductionView,
  ProjectCard,
  ProjectTask,
} from './types';

// Données d'essai des tests du module Projets, typées par le contrat généré.

export function taskFixture(over: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 't1',
    cle: 'plan_masse',
    libelle: 'Plan masse',
    descriptif: null,
    sourceNative: false,
    fichierObligatoire: true,
    debutJ: 1,
    finJ: 5,
    debutLe: '2026-10-01',
    finLe: '2026-10-07',
    temps: { type: 'heures', heures: 8 },
    heures: 8,
    statut: 'a_faire',
    motif: null,
    version: 0,
    pieces: [],
    avenant: null,
    valideeLe: null,
    valideePar: null,
    visa: null,
    peutViser: false,
    assigne: null,
    aMoi: false,
    validation: { mode: 'personne', nom: 'Aïssatou Faye', role: 'chef d’équipe' },
    peutDecider: false,
    prolongation: { enAttente: null, accordeeJusquau: null },
    peutDemanderProlongation: false,
    peutDeciderProlongation: false,
    peutRemettre: false,
    nomDepot: 'FS_POI.26_01_PLAN-MASSE_v01',
    fil: 0,
    etat: { code: 'en_cours' },
    ...over,
  };
}

export function cardFixture(over: Partial<ProjectCard> = {}): ProjectCard {
  return {
    id: 'c1',
    etapeNumero: 1,
    etapeLibelle: 'Onboard',
    cle: 'esquisse',
    libelle: 'Esquisse',
    note: null,
    descriptif: null,
    etiquette: null,
    debutJ: 1,
    finJ: 5,
    debutLe: '2026-10-01',
    finLe: '2026-10-07',
    temps: null,
    client: false,
    fichiers: false,
    fil: 0,
    etat: { code: 'ouverte' },
    taches: [taskFixture()],
    ...over,
  };
}

export function fileFixture(over: Partial<OpenProjectFile> = {}): OpenProjectFile {
  return {
    id: 'p1',
    code: 'FS_POI.26',
    client: { nom: 'Fatou Sarr', type: 'particulier' },
    cellule: { nom: 'Archi 3', chef: 'Aïssatou Faye' },
    equipes: [{ nom: 'Archi 3', chef: 'Aïssatou Faye' }],
    jeSuisChef: false,
    pilote: 'Architecte DPLG',
    version: { code: 'GC-CONCEPTION', libelle: 'v1' },
    offre: null,
    ouvertLe: '2026-10-01',
    livraisonLe: '2026-12-15',
    jour: 10,
    horizon: 50,
    budgetHeures: 400,
    dateVisiteSite: null,
    statutChantier: 'conception',
    factures: { F1: 'emise', F2: 'absente', F3: 'absente' },
    peutAssigner: false,
    optionsTs: [],
    attentes: { F2: ['02', '03'], F3: ['06'] },
    etapes: [
      { numero: 1, cle: 'onboard', libelle: 'Onboard', faites: 0, total: 1, enRetard: 0, etat: 'en_cours' },
      { numero: 2, cle: 'esquisse', libelle: 'Esquisse', faites: 0, total: 1, enRetard: 0, etat: 'a_venir' },
    ],
    cartes: [cardFixture(), cardFixture({ id: 'c2', etapeNumero: 2, taches: [taskFixture({ id: 't2' })] })],
    ...over,
  };
}

export function boardFixture(over: Partial<OpenProjectsBoard> = {}): OpenProjectsBoard {
  return {
    gabarit: 'GC-CONCEPTION',
    budgetHeures: 400,
    projets: [
      {
        id: 'p1',
        code: 'FS_POI.26',
        client: 'Fatou Sarr',
        cellule: 'Archi 3',
        jour: 10,
        horizon: 50,
        faites: 0,
        total: 2,
        enRetard: 0,
        livraisonDepassee: false,
      },
    ],
    kpi: {
      remisesAValider: 0,
      aValiderParVous: [],
      tachesEnRetard: 0,
      prolongations: 0,
      tsNonAcceptes: 0,
      mentions: 0,
    },
    ...over,
  };
}

export function productionRowFixture(over: Partial<ProductionRow> = {}): ProductionRow {
  return {
    projet: { id: 'p1', code: 'FS_POI.26', client: 'Fatou Sarr', cellule: 'Archi 3' },
    statutChantier: 'conception',
    etape: { numero: 2, libelle: 'Esquisse', terminee: false },
    souffrance: [],
    faites: 3,
    total: 10,
    jour: 12,
    horizon: 50,
    livraisonLe: '2026-12-15',
    livraisonDepassee: false,
    livraisonProche: false,
    enRetard: 0,
    prolongees: 0,
    attente: { remises: 0, visas: 0, prolongations: 0, ts: 0 },
    tranche: null,
    echeances: [],
    ...over,
  };
}

export function productionViewFixture(lignes: ProductionRow[] = [productionRowFixture()]): ProductionView {
  return {
    perimetre: 'tous',
    chiffres: {
      ouverts: lignes.length,
      enRetard: 0,
      livraisons15: lignes.filter((l) => l.livraisonProche).length,
      enAttente: 0,
      chargeMoyenne: 80,
    },
    lignes,
    charge: { periode: { debut: '2026-10-27', fin: '2026-11-09' }, zone: { de: 70, a: 100 }, cellules: [] },
    livraisons: [],
  };
}
