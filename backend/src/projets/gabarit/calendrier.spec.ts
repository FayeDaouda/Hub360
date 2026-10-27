import { apresJoursOuvres, dateDuJour, ecartHeures, joursDeRetard, premierJourOuvre, rangOuvre } from './calendrier';

// Repères de la maquette « Projets » du boss : DFS_ALM.26 ouvert le jeudi
// 10/09/2026, consulté le 23/09/2026.
const J1 = '2026-09-10';

describe('calendrier ouvrable du projet', () => {
  it('fenêtres de la maquette : J5 = 16/09, J15 = 30/09, J18 = 05/10, J40 = 04/11', () => {
    expect(dateDuJour(J1, 1)).toBe('2026-09-10');
    expect(dateDuJour(J1, 5)).toBe('2026-09-16');
    expect(dateDuJour(J1, 15)).toBe('2026-09-30');
    expect(dateDuJour(J1, 18)).toBe('2026-10-05');
    expect(dateDuJour(J1, 40)).toBe('2026-11-04');
  });

  it('le 23/09 est J10 ; avant J1, rang 0', () => {
    expect(rangOuvre(J1, '2026-09-23')).toBe(10);
    expect(rangOuvre(J1, '2026-09-09')).toBe(0);
  });

  it('ouverture un samedi → J1 le lundi ; un jour férié recule les fenêtres', () => {
    expect(premierJourOuvre('2026-09-12')).toBe('2026-09-14');
    expect(dateDuJour(J1, 5, new Set(['2026-09-14']))).toBe('2026-09-17');
  });

  it('écart : validée le 10/09 pour le 16/09 → avance 32 h ; le 11/09 → 24 h ; un jour après → −8 h', () => {
    expect(ecartHeures('2026-09-10', '2026-09-16')).toBe(32);
    expect(ecartHeures('2026-09-11', '2026-09-16')).toBe(24);
    expect(ecartHeures('2026-09-15', '2026-09-14')).toBe(-8);
  });

  it('retard en jours calendaires : échéance 16/09, le 23/09 → 7 j', () => {
    expect(joursDeRetard('2026-09-16', '2026-09-23')).toBe(7);
    expect(joursDeRetard('2026-09-16', '2026-09-10')).toBe(0);
  });

  it('3 jours ouvrés après le jeudi 22/10 : vendredi 23 (1), lundi 26 (2), mardi 27 (3)', () => {
    expect(apresJoursOuvres('2026-10-22', 3)).toBe('2026-10-27');
  });
});
