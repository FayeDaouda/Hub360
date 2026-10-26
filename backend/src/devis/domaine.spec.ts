import { ajouterJours, relanceAFaire } from './domaine';

// Relances d'offre J+3 / J+6 — « à faire » dérivé à la lecture (pas de
// scheduler) : un palier atteint et pas encore relancé.
describe('relanceAFaire', () => {
  const envoiLe = (jour: string) => new Date(`${jour}T10:00:00Z`);
  const offre = (relancesEnvoyees: number) => ({
    statut: 'envoye' as const,
    dateEnvoi: envoiLe('2026-09-01'),
    dateValidite: ajouterJours('2026-09-01', 7),
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

describe('ajouterJours', () => {
  it('franchit les fins de mois', () => {
    expect(ajouterJours('2026-09-28', 7)).toBe('2026-10-05');
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
