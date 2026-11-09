import { champsManquants, motifFicheIncomplete, type ChampsFiche } from './fiche';

const complete: ChampsFiche = {
  code: 'CM_YOF.26',
  categorie: 'conception',
  localiteId: 'L1',
  surfaceTerrain: 350,
  nbPlanches: 3,
  clientId: 'C1',
  standing: 'moyen',
  gamme: 'milieu',
  programme: 'Villa Yoff',
};

describe('fiche CRM · complétude', () => {
  it('fiche complète → rien ne manque, aucun motif', () => {
    expect(champsManquants(complete)).toEqual([]);
    expect(motifFicheIncomplete(complete, 'avant de créer l’offre')).toBeNull();
  });

  it('lead créé incomplet → champs manquants dans l’ordre de la fiche', () => {
    const lead = { ...complete, categorie: null, nbPlanches: 0, gamme: null, programme: '  ' };
    expect(champsManquants(lead)).toEqual(['catégorie', 'n° de planches', 'gamme', 'programme']);
    expect(motifFicheIncomplete(lead, 'avant de créer l’offre')).toBe(
      'Fiche 5/9 : il manque catégorie, n° de planches, gamme, programme — complète-la avant de créer l’offre.',
    );
  });

  it('neuf champs : le type de projet n’est plus demandé (09/11/2026)', () => {
    // Un dossier sans type, tous les autres champs remplis, est complet.
    const sansType = { ...complete, type: null } as ChampsFiche;
    expect(champsManquants(sansType)).toEqual([]);
    expect(motifFicheIncomplete({ ...complete, gamme: null }, 'avant de créer l’offre')).toMatch(/^Fiche 8\/9 :/);
  });

  it('dossier antérieur non rattaché au référentiel → localisation manquante', () => {
    expect(champsManquants({ ...complete, localiteId: null })).toEqual(['localisation']);
  });
});
