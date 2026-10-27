import { isOpenComment, resolutionRefusal } from './thread-rules';

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
    expect(isOpenComment(c())).toBe(true);
  });
  it('fermé par une réponse, par la résolution, ou sans mention', () => {
    expect(isOpenComment(c({ reponses: 1 }))).toBe(false);
    expect(isOpenComment(c({ resoluLe: new Date() }))).toBe(false);
    expect(isOpenComment(c({ mentionneId: null }))).toBe(false);
  });
  it('seul l’auteur résout, et un commentaire encore ouvert', () => {
    expect(resolutionRefusal(c(), 'U1')).toBeNull();
    expect(resolutionRefusal(c(), 'U2')).toMatch(/auteur/);
    expect(resolutionRefusal(c({ reponses: 1 }), 'U1')).toMatch(/n’attend plus/);
  });
});
