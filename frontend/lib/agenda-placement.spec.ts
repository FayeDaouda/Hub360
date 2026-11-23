import { describe, expect, it } from 'vitest';
import { placerFenetre } from './agenda-placement';

// Placement d'une fenêtre ancrée (18/11/2026).
describe('placerFenetre', () => {
  const ecran = { largeur: 1440, hauteur: 900 };
  const fenetre = { largeur: 400, hauteur: 300 };

  it('à droite de l’ancre s’il y a la place', () => {
    expect(placerFenetre({ top: 200, left: 600, right: 700, bottom: 260 }, fenetre, ecran)).toEqual({
      top: 200,
      left: 712,
    });
  });

  it('à gauche si la droite déborde', () => {
    expect(placerFenetre({ top: 200, left: 1200, right: 1300, bottom: 260 }, fenetre, ecran)).toEqual({
      top: 200,
      left: 788,
    });
  });

  it('centrée si ni l’un ni l’autre ne tient', () => {
    const etroit = { largeur: 500, hauteur: 900 };
    expect(placerFenetre({ top: 100, left: 100, right: 400, bottom: 160 }, fenetre, etroit).left).toBe(50);
  });

  it('jamais plus bas que l’écran, jamais au-dessus de la marge', () => {
    expect(placerFenetre({ top: 800, left: 100, right: 200, bottom: 850 }, fenetre, ecran).top).toBe(588);
    expect(placerFenetre({ top: -40, left: 100, right: 200, bottom: 10 }, fenetre, ecran).top).toBe(12);
  });
});
