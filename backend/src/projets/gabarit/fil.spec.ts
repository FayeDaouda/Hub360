import { estOuvert, motifRefusResolution } from './fil';

const c = (
  o: Partial<{ mentionneId: string | null; resoluLe: Date | null; reponses: number; auteurId: string | null }> = {},
) => ({
  mentionneId: 'U2',
  resoluLe: null,
  reponses: 0,
  auteurId: 'U1',
  ...o,
});

describe('fil de discussion · commentaire ouvert', () => {
  it('une mention sans réponse ni résolution reste ouverte', () => {
    expect(estOuvert(c())).toBe(true);
  });
  it('fermé par une réponse, par la résolution, ou sans mention', () => {
    expect(estOuvert(c({ reponses: 1 }))).toBe(false);
    expect(estOuvert(c({ resoluLe: new Date() }))).toBe(false);
    expect(estOuvert(c({ mentionneId: null }))).toBe(false);
  });
  it('seul l’auteur résout, et un commentaire encore ouvert', () => {
    expect(motifRefusResolution(c(), 'U1')).toBeNull();
    expect(motifRefusResolution(c(), 'U2')).toMatch(/auteur/);
    expect(motifRefusResolution(c({ reponses: 1 }), 'U1')).toMatch(/n’attend plus/);
  });
});
