import { delaiInactivite, DUREE_MAX_SESSION_S, dureeJeton, sessionEchue } from './session';

// Décision du 28/10/2026 (lot B) : 12 h au plus partout ; inactivité 1 h pour
// le CEO, le CFO, le CIO et la RH, 4 h pour les autres.
describe('Durée des sessions', () => {
  it('inactivité : 1 h pour CEO, CFO, CIO et RH ; 4 h pour les autres rôles', () => {
    for (const role of ['CEO (transverse)', 'CFO', 'CIO (transverse)', 'RH']) expect(delaiInactivite(role)).toBe(3600);
    for (const role of ['Salarié', 'Dir. GC', 'COO', 'CTO (transverse)']) expect(delaiInactivite(role)).toBe(4 * 3600);
  });

  it('un jeton vaut le délai d’inactivité du rôle, sans dépasser les 12 h de la session', () => {
    expect(dureeJeton('Salarié', 1000, 1000)).toBe(4 * 3600);
    expect(dureeJeton('CFO', 1000, 1000)).toBe(3600);
    // Prolongé à 11 h 30 de session : il reste 30 minutes, pas 4 heures.
    expect(dureeJeton('Salarié', 0, 11.5 * 3600)).toBe(1800);
    expect(dureeJeton('Salarié', 0, DUREE_MAX_SESSION_S)).toBeLessThanOrEqual(0);
  });

  it('une session est échue douze heures après la connexion', () => {
    expect(sessionEchue(0, (DUREE_MAX_SESSION_S - 1) * 1000)).toBe(false);
    expect(sessionEchue(0, DUREE_MAX_SESSION_S * 1000)).toBe(true);
  });
});
