import {
  bucketsHistogramme,
  fenetres,
  isoJour,
  libellePeriode,
  moyennePct,
  statutJalon,
  uniteHistogramme,
} from './periodes';

// Repère fixe : jeudi 10 septembre 2026, 14 h 30 UTC.
const NOW = new Date('2026-09-10T14:30:00Z');
const iso = (d: Date) => d.toISOString();

describe('fenetres', () => {
  it('jour = [aujourd’hui 00:00, demain 00:00), précédente = la veille', () => {
    const { courante, precedente } = fenetres('jour', NOW);
    expect(iso(courante.debut)).toBe('2026-09-10T00:00:00.000Z');
    expect(iso(courante.fin)).toBe('2026-09-11T00:00:00.000Z');
    expect(iso(precedente.debut)).toBe('2026-09-09T00:00:00.000Z');
    expect(iso(precedente.fin)).toBe('2026-09-10T00:00:00.000Z');
  });

  it('semaine = lundi→lundi (ISO), le 10/09/2026 est un jeudi → lundi = 07/09', () => {
    const { courante, precedente } = fenetres('semaine', NOW);
    expect(iso(courante.debut)).toBe('2026-09-07T00:00:00.000Z');
    expect(iso(courante.fin)).toBe('2026-09-14T00:00:00.000Z');
    expect(iso(precedente.debut)).toBe('2026-08-31T00:00:00.000Z');
  });

  it('mois = 1er→1er du mois suivant', () => {
    const { courante, precedente } = fenetres('mois', NOW);
    expect(iso(courante.debut)).toBe('2026-09-01T00:00:00.000Z');
    expect(iso(courante.fin)).toBe('2026-10-01T00:00:00.000Z');
    expect(iso(precedente.debut)).toBe('2026-08-01T00:00:00.000Z');
    expect(iso(precedente.fin)).toBe('2026-09-01T00:00:00.000Z');
  });

  it('annee = 1er janvier → 1er janvier suivant', () => {
    const { courante, precedente } = fenetres('annee', NOW);
    expect(iso(courante.debut)).toBe('2026-01-01T00:00:00.000Z');
    expect(iso(courante.fin)).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(precedente.debut)).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('libellePeriode', () => {
  it('jour', () => expect(libellePeriode('jour', NOW)).toBe('Jeudi 10 septembre 2026'));
  it('semaine', () =>
    expect(libellePeriode('semaine', NOW)).toBe('Semaine du 7 au 13 septembre 2026'));
  it('mois', () => expect(libellePeriode('mois', NOW)).toBe('1 – 30 septembre 2026'));
  it('annee', () => expect(libellePeriode('annee', NOW)).toBe('Année 2026'));
});

describe('bucketsHistogramme', () => {
  it('mois → 6 barres, la dernière active, libellés des 6 derniers mois', () => {
    const b = bucketsHistogramme('mois', NOW);
    expect(b.map((x) => x.libelle)).toEqual(['Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept']);
    expect(b.filter((x) => x.actif)).toHaveLength(1);
    expect(b[5].actif).toBe(true);
    // fenêtres contiguës et croissantes
    for (let i = 1; i < b.length; i++) {
      expect(iso(b[i].fenetre.debut)).toBe(iso(b[i - 1].fenetre.fin));
    }
  });

  it('jour → 5 barres, libellés = 5 derniers jours', () => {
    const b = bucketsHistogramme('jour', NOW);
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.libelle)).toEqual(['Dim', 'Lun', 'Mar', 'Mer', 'Jeu']);
    expect(b[4].actif).toBe(true);
    expect(iso(b[4].fenetre.debut)).toBe('2026-09-10T00:00:00.000Z');
  });

  it('annee → 5 barres, libellés = 5 dernières années', () => {
    const b = bucketsHistogramme('annee', NOW);
    expect(b.map((x) => x.libelle)).toEqual(['2022', '2023', '2024', '2025', '2026']);
    expect(b[4].actif).toBe(true);
  });

  it('semaine → 5 barres SNN contiguës', () => {
    const b = bucketsHistogramme('semaine', NOW);
    expect(b).toHaveLength(5);
    b.forEach((x) => expect(x.libelle).toMatch(/^S\d{1,2}$/));
    expect(b[4].actif).toBe(true);
    for (let i = 1; i < b.length; i++) {
      expect(iso(b[i].fenetre.debut)).toBe(iso(b[i - 1].fenetre.fin));
    }
  });
});

describe('uniteHistogramme', () => {
  it('varie avec la période', () => {
    expect(uniteHistogramme('jour')).toBe('projets par jour');
    expect(uniteHistogramme('annee')).toBe('projets par an');
  });
});

describe('moyennePct', () => {
  it('0 sur liste vide — jamais NaN', () => expect(moyennePct([])).toBe(0));
  it('moyenne entière', () => {
    expect(moyennePct([50, 100])).toBe(75);
    expect(moyennePct([33, 33, 34])).toBe(33);
  });
});

describe('statutJalon', () => {
  it('à risque si échéance ≤ 3 j (ou dépassée), à faire sinon', () => {
    expect(statutJalon('2026-09-10', '2026-09-10')).toBe('a_risque');
    expect(statutJalon('2026-09-13', '2026-09-10')).toBe('a_risque');
    expect(statutJalon('2026-09-08', '2026-09-10')).toBe('a_risque');
    expect(statutJalon('2026-09-14', '2026-09-10')).toBe('a_faire');
  });
});

describe('isoJour', () => {
  it('tronque à la date UTC', () => {
    expect(isoJour(new Date('2026-09-10T23:59:59Z'))).toBe('2026-09-10');
  });
});
