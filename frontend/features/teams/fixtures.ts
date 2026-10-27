import type { TeamsView } from './types';

// Vue « Équipes » minimale pour les tests du module.
export function teamsViewFixture(patch: Partial<TeamsView> = {}): TeamsView {
  return {
    indicateurs: {
      cellules: { actives: 1, total: 2 },
      salariesAAffecter: 0,
      projetsSignes: { total: 0, nonAffectes: 0 },
      taches: { enCours: 0, enRetard: 0, pctATemps: null, etapesEnRetard: 0 },
      absencesEnAttente: 3,
    },
    cellules: [
      {
        id: 'c1',
        code: 'GC-ARC-01',
        processus: 'ARC',
        nom: 'Architecture 1',
        clientele: 'externes',
        statut: 'active',
        pilote: { id: 'm1', nom: 'Awa Diop', sansCompte: false },
        pctATemps: 90,
        postes: [],
        membres: [
          {
            id: 'm1',
            nom: 'Awa Diop',
            role: 'Architecte',
            niveau: 'senior',
            photoUrl: null,
            absentJusquau: null,
            poste: null,
            estPilote: true,
            taches: 4,
            heures: 12.5,
            pctATemps: 90,
          },
        ],
      },
    ],
    salariesAAffecter: [],
    projets: [],
    tachesEnCours: [],
    collaborateurs: [{ id: 'm1', nom: 'Awa Diop', cellule: 'GC-ARC-01' }],
    prochainsCodes: { DIR: 'GC-DIR-01', ARC: 'GC-ARC-02', INT: 'GC-INT-01', ETU: 'GC-ETU-01' },
    ...patch,
  };
}
