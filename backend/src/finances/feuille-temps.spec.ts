import { delaiTranche, prevueLe, tempsImpute, tempsPipe } from './feuille-temps';

// Feuille de temps (maquette Finances) : pipe, facturation, temps imputé.
describe('tempsPipe', () => {
  it('écarts depuis l’étape atteinte précédente, cibles de la maquette', () => {
    const p = tempsPipe({
      lead: '2026-09-02',
      soumission: '2026-09-05',
      envoi: '2026-09-09',
      accord: '2026-09-12',
      facture: '2026-09-13',
      encaissement: null,
    });
    expect(p.map((e) => [e.cle, e.ecartJours, e.horsCible])).toEqual([
      ['lead', null, false],
      ['soumission', 3, false],
      ['envoi', 4, true], // cible ≤ 2 j (CFO)
      ['accord', 3, false],
      ['facture', 1, false],
      ['encaissement', null, false],
    ]);
    expect(p[3].cible).toBe('validité 7 j');
  });
});

describe('temps sur la facturation', () => {
  const auj = '2026-09-20';
  it('prévue = bon pour accord + délai figé dans l’offre', () => {
    expect(prevueLe('2026-09-09', 30)).toBe('2026-10-09');
    expect(prevueLe('2026-09-09', null)).toBeNull();
    expect(prevueLe(null, 30)).toBeNull();
  });
  it('payée en N j, échéance, retard, à facturer', () => {
    expect(
      delaiTranche({ prevue: null, facturee: '2026-09-10', echeance: '2026-09-25', payee: '2026-09-12' }, auj),
    ).toEqual({ etat: 'payee', jours: 2 });
    expect(delaiTranche({ prevue: null, facturee: '2026-09-10', echeance: '2026-09-25', payee: null }, auj)).toEqual({
      etat: 'a_echoir',
      jours: 5,
    });
    expect(delaiTranche({ prevue: null, facturee: '2026-09-01', echeance: '2026-09-16', payee: null }, auj)).toEqual({
      etat: 'en_retard',
      jours: 4,
    });
    expect(delaiTranche({ prevue: '2026-10-06', facturee: null, echeance: null, payee: null }, auj)).toEqual({
      etat: 'a_facturer',
      jours: 16,
    });
    expect(delaiTranche({ prevue: '2026-09-18', facturee: null, echeance: null, payee: null }, auj)).toEqual({
      etat: 'facturation_en_retard',
      jours: 2,
    });
    expect(delaiTranche({ prevue: null, facturee: null, echeance: null, payee: null }, auj)).toEqual({
      etat: 'non_planifiee',
    });
  });
});

describe('tempsImpute', () => {
  const tache = (o: object) => ({
    id: 't',
    etape: 'Avant-projet',
    etapeNumero: 2,
    libelle: 'Plans',
    debut: '2026-09-14', // lundi
    echeance: '2026-09-18', // vendredi : 5 jours ouvrés
    heures: 10,
    assigne: { nom: 'Awa Ndiaye', absences: [] },
    ...o,
  });
  it('durée répartie sur la fenêtre, jours passés seulement', () => {
    const r = tempsImpute([tache({})], '2026-09-16', new Set());
    expect(r.taches[0]).toMatchObject({ joursEcoules: 3, heures: 6 });
    expect(r.total).toBe(6);
  });
  it('absence validée : la charge se reporte sur les jours de présence', () => {
    const r = tempsImpute(
      [tache({ assigne: { nom: 'Awa Ndiaye', absences: [{ debut: '2026-09-17', fin: '2026-09-18' }] } })],
      '2026-09-18',
      new Set(),
    );
    expect(r.taches[0].heures).toBe(10); // 3 jours présents portent les 10 h
  });
  it('fenêtre future ou sans durée : 0 h ; répartition par étape dans l’ordre', () => {
    const r = tempsImpute(
      [
        tache({ id: 'a', etape: 'Études', etapeNumero: 3, heures: 4, debut: '2026-09-14', echeance: '2026-09-14' }),
        tache({ id: 'b' }),
        tache({ id: 'c', debut: '2026-11-02', echeance: '2026-11-06' }),
        tache({ id: 'd', heures: null }),
      ],
      '2026-09-30',
      new Set(),
    );
    expect(r.repartition).toEqual([
      { etape: 'Avant-projet', heures: 10 },
      { etape: 'Études', heures: 4 },
    ]);
    expect(r.taches.find((t) => t.id === 'c')?.heures).toBe(0);
    expect(r.taches[0].id).toBe('c'); // plus récentes d'abord
  });
});
