import { describe, expect, it } from 'vitest';
import type { ElementAgenda } from './agenda';
import { creneauClique, placerJour } from './agenda-grille';

const J = '2026-11-12';
const rdv = (id: string, debut: string, fin: string, jourDebut = J, jourFin = J): ElementAgenda => ({
  id,
  type: 'rendez_vous',
  titre: id,
  jour: jourDebut,
  debut: `${jourDebut}T${debut}:00.000Z`,
  fin: `${jourFin}T${fin}:00.000Z`,
  lieu: null,
  detail: null,
  organisateur: null,
  invites: [],
  annulable: false,
  modifiable: false,
  entretien: false,
  jeSuisOrganisateur: true,
  description: null,
  inviteIds: [],
});

// Grille horaire de l'Agenda (12/11/2026).
describe('placerJour', () => {
  it('seul : toute la largeur, à son heure', () => {
    expect(placerJour([rdv('A', '09:00', '10:30')], J)).toMatchObject([
      { debut: 540, fin: 630, colonne: 0, colonnes: 1 },
    ]);
  });

  it('deux qui se chevauchent : côte à côte ; un troisième après : toute la largeur', () => {
    const p = placerJour([rdv('A', '09:00', '10:00'), rdv('B', '09:30', '11:00'), rdv('C', '11:00', '12:00')], J);
    const par = Object.fromEntries(p.map((x) => [x.e.id, x]));
    expect(par.A).toMatchObject({ colonne: 0, colonnes: 2 });
    expect(par.B).toMatchObject({ colonne: 1, colonnes: 2 });
    expect(par.C).toMatchObject({ colonne: 0, colonnes: 1 });
  });

  it('une colonne libérée est reprise', () => {
    const p = placerJour([rdv('A', '09:00', '12:00'), rdv('B', '09:00', '10:00'), rdv('C', '10:00', '11:00')], J);
    const par = Object.fromEntries(p.map((x) => [x.e.id, x]));
    expect(par.A.colonne).toBe(0);
    expect(par.B.colonne).toBe(1);
    expect(par.C.colonne).toBe(1);
    expect(par.A.colonnes).toBe(2);
  });

  it('déborde sur le lendemain : s’arrête à minuit ; très court : 20 minutes de haut', () => {
    expect(placerJour([rdv('A', '23:00', '01:00', J, '2026-11-13')], J)[0]).toMatchObject({ debut: 1380, fin: 1440 });
    expect(placerJour([rdv('A', '09:00', '09:05')], J)[0]).toMatchObject({ debut: 540, fin: 560 });
  });

  it('les éléments sans heure (échéances, absences) restent hors de la grille', () => {
    expect(placerJour([{ ...rdv('A', '09:00', '10:00'), type: 'echeance', debut: null, fin: null }], J)).toEqual([]);
  });
});

describe('creneauClique', () => {
  it('arrondi à la demi-heure, une heure, jamais au-delà de minuit', () => {
    expect(creneauClique(9 * 60 + 47)).toEqual({ debut: 570, fin: 630 });
    expect(creneauClique(23 * 60 + 50)).toEqual({ debut: 1380, fin: 1440 });
  });
});
