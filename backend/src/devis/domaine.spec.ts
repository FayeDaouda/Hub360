import { Prisma } from '@prisma/client';
import { htLigne, messageIntroductionParDefaut, montantHtLignes, montantTtcLignes, relanceAFaire } from './domaine';
import { lignesOffreDepuisDevis, planFacturationOffre } from '../projets/domaine/facturation-offre';
import { addDays } from '@hub/domain';

// Relances d'offre J+3 / J+6 — « à faire » dérivé à la lecture (pas de
// scheduler) : un palier atteint et pas encore relancé.
describe('relanceAFaire', () => {
  const envoiLe = (jour: string) => new Date(`${jour}T10:00:00Z`);
  const offre = (relancesEnvoyees: number) => ({
    statut: 'envoye' as const,
    dateEnvoi: envoiLe('2026-09-01'),
    dateValidite: addDays('2026-09-01', 7),
    relancesEnvoyees,
  });

  it('avant J+3 → rien', () => {
    expect(relanceAFaire(offre(0), '2026-09-03')).toBe(false);
  });

  it('J+3 sans relance → à faire ; après la 1ʳᵉ → plus rien jusqu’à J+6', () => {
    expect(relanceAFaire(offre(0), '2026-09-04')).toBe(true);
    expect(relanceAFaire(offre(1), '2026-09-05')).toBe(false);
  });

  it('J+6 : la 2ᵉ relance devient due ; après elle, plus rien', () => {
    expect(relanceAFaire(offre(1), '2026-09-07')).toBe(true);
    expect(relanceAFaire(offre(2), '2026-09-07')).toBe(false);
  });

  it('offre expirée (J+8) ou répondue → plus de relance', () => {
    expect(relanceAFaire(offre(1), '2026-09-09')).toBe(false);
    expect(relanceAFaire({ ...offre(0), statut: 'accepte' }, '2026-09-04')).toBe(false);
  });
});

describe('alerteAvenant (délai d’acceptation réglé)', () => {
  const { alerteAvenant } = jest.requireActual('./domaine');
  const avenant = {
    projetId: 'P1',
    statut: 'envoye',
    dateValidite: '2026-10-07',
    dateEnvoi: new Date('2026-09-20T10:00:00Z'),
    familles: ['TS'],
  };
  it('au-delà du délai sans acceptation : alerte avec le nombre de jours', () => {
    expect(alerteAvenant(avenant, '2026-09-28', 7)).toEqual({ jours: 8, seuil: 7 });
    expect(alerteAvenant(avenant, '2026-09-27', 7)).toBeNull(); // pile 7 jours : pas encore
  });
  it('expiré sans réponse : toujours non accepté, donc alerte', () => {
    expect(alerteAvenant({ ...avenant, dateValidite: '2026-09-27' }, '2026-10-01', 7)).toEqual({ jours: 11, seuil: 7 });
  });
  it('accepté, refusé, sans TS ou hors projet : pas d’alerte', () => {
    expect(alerteAvenant({ ...avenant, statut: 'accepte' }, '2026-10-01', 7)).toBeNull();
    expect(alerteAvenant({ ...avenant, statut: 'refuse' }, '2026-10-01', 7)).toBeNull();
    expect(alerteAvenant({ ...avenant, familles: ['CO', null] }, '2026-10-01', 7)).toBeNull();
    expect(alerteAvenant({ ...avenant, projetId: null }, '2026-10-01', 7)).toBeNull();
  });
});

// Remise sur toute l'offre (09/11/2026) : appliquée au HT de chaque ligne,
// arrondi au franc par ligne, avant TVA ; la même partout (totaux, échéancier).
describe('remise de l’offre', () => {
  const d = (n: number) => new Prisma.Decimal(n);
  const lignes = [
    { quantite: d(500), prixUnitaire: d(7000), tauxTva: d(18) }, // 3 500 000
    { quantite: d(3), prixUnitaire: d(333_333), tauxTva: d(18) }, // 999 999
  ];

  it('sans remise : montants inchangés', () => {
    expect(htLigne(3, 333_333, null)).toBe(999_999);
    expect(montantHtLignes(lignes, null)).toBe(4_499_999);
  });

  it('remise 10 % : HT remisé arrondi par ligne, TVA sur le remisé', () => {
    expect(htLigne(3, 333_333, 10)).toBe(899_999); // 899 999,1 → 899 999
    expect(montantHtLignes(lignes, 10)).toBe(3_150_000 + 899_999);
    // TVA 18 % ventilée par ligne sur le HT remisé.
    expect(montantTtcLignes(lignes, 10)).toBe(3_150_000 + 567_000 + 899_999 + 162_000);
  });

  it('chaque palier proposé réduit le HT d’autant', () => {
    for (const r of [5, 10, 15, 20, 25]) expect(htLigne(100, 10_000, r)).toBe(1_000_000 - r * 10_000);
  });

  it('échéancier et factures de l’Onboard portent sur le HT remisé', () => {
    const offre = [
      {
        designation: 'CO2 — Conception',
        quantite: d(500),
        prixUnitaire: d(7000),
        tauxTva: d(18),
        produitService: { code: 'CO2', famille: 'CO' },
      },
    ];
    const plan = planFacturationOffre(lignesOffreDepuisDevis(offre, 20), { F1: 40, F2: 40, F3: 20 });
    expect(plan.reduce((s, f) => s + f.montantHt, 0)).toBe(2_800_000);
  });
});

// Message d'introduction (09/11/2026) : la conception ne dit pas sa catégorie.
describe('messageIntroductionParDefaut · conception', () => {
  it('une ligne CO s’écrit « Conception », les autres gardent leur code', () => {
    const m = messageIntroductionParDefaut({
      societe: 'Grey Concrete',
      lieu: 'Almadies',
      programme: 'Villa R+1',
      prestations: [
        { designation: 'CO2 — Conception — complexité intermédiaire', famille: 'CO' },
        { designation: 'SU2 — Suivi de chantier — projet intermédiaire', famille: 'SU' },
      ],
    });
    expect(m).toContain('· Conception\n');
    expect(m).not.toMatch(/CO2|complexité/);
    expect(m).toContain('· SU2 · Suivi de chantier — projet intermédiaire');
  });
});
