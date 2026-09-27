import { planFacturationOffre, repartir } from './facturation-offre';

// Plan de facturation d'une offre acceptée (étape H2) — CGV art. 4, 6, 7.
const ligne = (code: string | null, famille: string | null, montantHt: number, tauxTva = 18) => ({
  code,
  famille,
  designation: code ?? 'Relevé topographique',
  montantHt,
  tauxTva,
});

describe('repartir', () => {
  it('parts exactes', () => {
    expect(repartir(3_500_000, [40, 40, 20])).toEqual([1_400_000, 1_400_000, 700_000]);
  });

  it('écart d’arrondi absorbé par la dernière part — la somme retombe juste', () => {
    const r = repartir(1_000_001, [40, 40, 20]);
    expect(r.reduce((s, m) => s + m, 0)).toBe(1_000_001);
    expect(repartir(3, [50, 50])).toEqual([2, 1]);
  });
});

describe('planFacturationOffre', () => {
  const offre = [
    ligne('CO2', 'CO', 3_500_000),
    ligne('SU2', 'SU', 3_000_000),
    ligne('IM1', 'IM', 150_000),
    ligne('IM2', 'IM', 100_000),
    ligne('DPC', 'PC', 750_000),
    ligne('BIMX', 'EX', 600_000),
    ligne(null, null, 200_000),
  ];
  const plan = planFacturationOffre(offre);

  it('conception : 40/40/20 sur les jalons CGV, la CO seule', () => {
    const co = plan.filter((f) => f.jalon);
    expect(co.map((f) => [f.jalon, f.montantHt])).toEqual([
      ['signature', 1_400_000],
      ['avant_projet', 1_400_000],
      ['livraison', 700_000],
    ]);
    expect(co[1].libelle).toBe("CO2 — Fin de l'APD (40 %)");
  });

  it('permis : 50/50 par prestation', () => {
    const dpc = plan.filter((f) => f.libelle.startsWith('DPC'));
    expect(dpc.map((f) => f.montantHt)).toEqual([375_000, 375_000]);
  });

  it('images : une facture à part, jamais dans le 40/40/20', () => {
    const im = plan.filter((f) => f.libelle.startsWith('Images'));
    expect(im).toEqual([
      { jalon: null, libelle: 'Images intérieures — IM1, IM2', montantHt: 250_000, tauxTva: 18 },
    ]);
  });

  it('SU / EX : rien à l’Onboard (facturation mensuelle)', () => {
    expect(plan.some((f) => /SU2|BIMX/.test(f.libelle))).toBe(false);
  });

  it('ligne hors catalogue : jamais perdue', () => {
    expect(plan.find((f) => f.libelle.startsWith('Autres'))?.montantHt).toBe(200_000);
  });

  it('total préparé = total de l’offre hors lignes mensuelles', () => {
    const attendu = offre
      .filter((l) => !['SU', 'EX'].includes(l.famille ?? ''))
      .reduce((s, l) => s + l.montantHt, 0);
    expect(plan.reduce((s, f) => s + f.montantHt, 0)).toBe(attendu);
  });

  it('taux de TVA différents → factures séparées (une facture = un taux)', () => {
    const p = planFacturationOffre([ligne('IM1', 'IM', 100, 18), ligne('IM2', 'IM', 100, 0)]);
    expect(p.map((f) => f.tauxTva).sort()).toEqual([0, 18]);
  });
});
