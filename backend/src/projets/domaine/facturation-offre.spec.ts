import { delaisValides, echeancierOffre, planFacturationOffre, repartir } from './facturation-offre';

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
  const plan = planFacturationOffre(offre, { F1: 40, F2: 40, F3: 20 });

  it('conception : 40/40/20 sur les jalons CGV, la CO seule', () => {
    const co = plan.filter((f) => f.jalon);
    expect(co.map((f) => [f.jalon, f.montantHt])).toEqual([
      ['signature', 1_400_000],
      ['avant_projet', 1_400_000],
      ['livraison', 700_000],
    ]);
    expect(co[1].libelle).toBe('Honoraires de conception, catégorie CO2 · 2ᵉ tranche : fin de l’APD (40 %)');
  });

  it('conception : parts figées de l’offre (réglage du CIO), arrondi sur la dernière', () => {
    const co = planFacturationOffre([ligne('CO1', 'CO', 1_000_001)], { F1: 30, F2: 50, F3: 20 });
    expect(co.map((f) => f.montantHt)).toEqual([300_000, 500_001, 200_000]);
    expect(co.map((f) => f.libelle)).toEqual([
      'Honoraires de conception, catégorie CO1 · 1ʳᵉ tranche : acompte à la signature du contrat (30 %)',
      'Honoraires de conception, catégorie CO1 · 2ᵉ tranche : fin de l’APD (50 %)',
      'Honoraires de conception, catégorie CO1 · 3ᵉ tranche : livraison des plans d’exécution (20 %)',
    ]);
  });

  it('permis : 50/50 par prestation', () => {
    const dpc = plan.filter((f) => f.libelle.startsWith('DPC'));
    expect(dpc.map((f) => f.montantHt)).toEqual([375_000, 375_000]);
  });

  it('images : une facture à part, jamais dans le 40/40/20', () => {
    const im = plan.filter((f) => f.libelle.startsWith('Images'));
    expect(im).toEqual([
      {
        jalon: null,
        libelle: 'Images intérieures — IM1, IM2',
        montantHt: 250_000,
        tauxTva: 18,
        cle: 'IM:18',
        famille: 'Images intérieures',
        echeance: 'Unique',
        part: 100,
        declencheur: null,
      },
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
    const p = planFacturationOffre([ligne('IM1', 'IM', 100, 18), ligne('IM2', 'IM', 100, 0)], { F1: 40, F2: 40, F3: 20 });
    expect(p.map((f) => f.tauxTva).sort()).toEqual([0, 18]);
  });
});

// Échéancier affiché sur l'offre (maquette Finances) : plan + délais saisis + mensualités.
describe('echeancierOffre', () => {
  const parts = { F1: 40, F2: 40, F3: 20 };
  const lignes = [
    ligne('CO1', 'CO', 1_000_000),
    ligne('DPC', 'PC', 400_000),
    { ...ligne('SU1', 'SU', 900_000), quantite: 3 },
  ];
  const e = echeancierOffre(lignes, parts, { 'CO:F1': 0, 'CO:F2': 45, 'DPC:solde': 60 });

  it('conception F1/F2/F3, permis avance/solde, puis le suivi au mois', () => {
    expect(e.map((x) => [x.cle, x.echeance, x.part, x.declencheur])).toEqual([
      ['CO:F1', 'F1', 40, 'Signature du contrat'],
      ['CO:F2', 'F2', 40, 'Fin de l’APD'],
      ['CO:F3', 'F3', 20, 'Livraison des plans d’exécution'],
      ['DPC:avance', 'Avance', 50, 'Commande'],
      ['DPC:solde', 'Solde', 50, 'Remise du livrable'],
      [null, '3 mensualités', null, 'Chaque mois'],
    ]);
  });

  it('délais saisis repris par clé, montants TTC', () => {
    expect(e.map((x) => x.delaiJours)).toEqual([0, 45, null, null, 60, null]);
    expect(e[0].montantTtc).toBe(472_000); // 400 000 HT + 18 %
    expect(e[5].montantTtc).toBe(1_062_000);
  });

  it('délais : échéance connue, entier de 0 à 730 jours', () => {
    const cles = e.flatMap((x) => (x.cle ? [x.cle] : []));
    expect(delaisValides({ 'CO:F2': 30 }, cles)).toBeNull();
    expect(delaisValides({ 'CO9:F1': 30 }, cles)).toMatch(/inconnue/);
    expect(delaisValides({ 'CO:F2': 2.5 }, cles)).toMatch(/entier/);
    expect(delaisValides({ 'CO:F2': -1 }, cles)).toMatch(/entier/);
  });
});
