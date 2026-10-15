import { derniersMois, serieNouveaux, seriesTaches } from './tendances';

describe('Tendances des indicateurs', () => {
  it('6 derniers mois, le mois courant en dernier, à cheval sur l’année', () => {
    expect(derniersMois('2026-02')).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('nouveaux projets comptés au mois de création', () => {
    expect(serieNouveaux(['2026-09', '2026-10'], ['2026-09-03', '2026-10-01', '2026-10-14'])).toEqual([
      { mois: '2026-09', valeur: 1 },
      { mois: '2026-10', valeur: 2 },
    ]);
  });

  it('à temps et reprises : tâches validées dans le mois, rien = pas de valeur', () => {
    const t = (valideeLe: string, echeance: string, reprise = false) => ({ statut: 'validee' as const, valideeLe, echeance, reprise });
    const { aTemps, reprises } = seriesTaches(['2026-09', '2026-10'], [
      t('2026-10-02', '2026-10-05'),
      t('2026-10-09', '2026-10-05', true),
      t('2026-10-10', '2026-10-12'),
      t('2026-10-11', '2026-10-20', true),
    ]);
    expect(aTemps).toEqual([{ mois: '2026-09', valeur: null }, { mois: '2026-10', valeur: 75 }]);
    expect(reprises).toEqual([{ mois: '2026-09', valeur: null }, { mois: '2026-10', valeur: 50 }]);
  });
});
