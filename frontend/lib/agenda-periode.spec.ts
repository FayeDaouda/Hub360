import { describe, expect, it } from 'vitest';
import { decaler, enGrille, intervalle, lundi, periode, titrePeriode } from './agenda-periode';

// Périodes de l'Agenda (18/11/2026).
describe('agenda-periode', () => {
  it('lundi : le lundi de la semaine, dimanche compris', () => {
    expect(lundi('2026-11-18')).toBe('2026-11-16');
    expect(lundi('2026-11-22')).toBe('2026-11-16');
    expect(lundi('2026-11-16')).toBe('2026-11-16');
  });

  it('période de chaque vue', () => {
    expect(periode('jour', '2026-11-18')).toEqual({ du: '2026-11-18', au: '2026-11-18' });
    expect(periode('3jours', '2026-11-18')).toEqual({ du: '2026-11-18', au: '2026-11-20' });
    expect(periode('semaine', '2026-11-18')).toEqual({ du: '2026-11-16', au: '2026-11-22' });
    // Mois : 6 semaines, du lundi précédant le 1er.
    expect(periode('mois', '2026-11-18')).toEqual({ du: '2026-10-26', au: '2026-12-06' });
    expect(periode('annee', '2026-11-18')).toEqual({ du: '2026-01-01', au: '2026-12-31' });
    expect(periode('planning', '2026-11-18')).toEqual({ du: '2026-11-18', au: '2026-12-17' });
  });

  it('les flèches avancent d’une période entière', () => {
    expect(decaler('jour', '2026-11-18', 1)).toBe('2026-11-19');
    expect(decaler('3jours', '2026-11-18', 1)).toBe('2026-11-21');
    expect(decaler('3jours', '2026-11-18', -1)).toBe('2026-11-15');
    expect(decaler('semaine', '2026-11-18', -1)).toBe('2026-11-11');
    expect(decaler('mois', '2026-11-18', 1)).toBe('2026-12-18');
    expect(decaler('annee', '2026-11-18', 1)).toBe('2027-11-18');
    expect(decaler('planning', '2026-11-18', 1)).toBe('2026-12-18');
  });

  it('grille horaire : jour, 3 jours, semaine', () => {
    expect(['jour', '3jours', 'semaine', 'mois', 'annee', 'planning'].map((v) => enGrille(v as never))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('intervalle façon Google : même mois, deux mois, deux années', () => {
    expect(intervalle('2026-11-16', '2026-11-22')).toBe('16 – 22 novembre 2026');
    expect(intervalle('2026-11-30', '2026-12-06')).toBe('30 novembre – 6 décembre 2026');
    expect(intervalle('2026-12-28', '2027-01-03')).toBe('28 déc. 2026 – 3 janv. 2027');
    expect(intervalle('2026-11-18', '2026-11-18')).toBe('Mercredi 18 novembre 2026');
  });

  it('titre : complet sur ordinateur, le mois seulement sur téléphone', () => {
    expect(titrePeriode('semaine', '2026-11-18')).toBe('16 – 22 novembre 2026');
    expect(titrePeriode('jour', '2026-11-18')).toBe('Mercredi 18 novembre 2026');
    expect(titrePeriode('mois', '2026-11-18')).toBe('Novembre 2026');
    expect(titrePeriode('annee', '2026-11-18')).toBe('2026');
    expect(titrePeriode('3jours', '2026-11-18', true)).toBe('Novembre 2026');
    // Semaine à cheval : le mois de son jeudi.
    expect(titrePeriode('semaine', '2026-12-01', true)).toBe('Décembre 2026');
    expect(titrePeriode('semaine', '2026-11-30', true)).toBe('Décembre 2026');
    expect(titrePeriode('semaine', '2026-10-28', true)).toBe('Octobre 2026');
  });
});
