import type { MyTask, MyTasksView } from './types';

// Tâche assignée minimale pour les tests du module (en cours, sans retard).
export function myTaskFixture(patch: Partial<MyTask> = {}): MyTask {
  return {
    id: 't1',
    etape: '02 · Avant-projet',
    carte: 'Esquisse',
    libelle: 'Plans d’esquisse',
    projetId: 'p1',
    projetCode: 'NF_OUA.26',
    projetProgramme: 'Villa',
    projetClient: 'Ndiaye',
    debut: '2026-10-20',
    echeance: '2026-10-30',
    dureeStandard: 8,
    heuresImputees: 4,
    manque: null,
    etat: 'en_cours',
    statut: 'en_cours',
    enRetard: false,
    dateEffective: '2026-10-30',
    aTemps: null,
    prolongeeJusquau: null,
    version: 0,
    remisLe: null,
    valideLe: null,
    renvoiMotif: null,
    validateur: null,
    relancePossibleLe: null,
    etapeNumero: 2,
    fichierObligatoire: false,
    parDepot: false,
    nomDepot: 'FS_POI.26_02_PLAN-MASSE_v01',
    ...patch,
  };
}

export function myTasksViewFixture(taches: MyTask[] = []): MyTasksView {
  return {
    taches,
    stats: {
      total: taches.length,
      validees: 0,
      enCours: taches.length,
      enRetard: 0,
      respectDelais: { aTemps: 0, total: 0, pct: null },
      reprises: { avecReprise: 0, total: 0, pct: null },
    },
  };
}
