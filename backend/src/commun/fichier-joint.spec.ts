import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UrlFichierJoint } from './fichier-joint';

class Fichier {
  @UrlFichierJoint(100) url!: string;
}

const erreurs = (url: unknown) => validateSync(plainToInstance(Fichier, { url }));

describe('UrlFichierJoint', () => {
  it.each([
    'data:application/pdf;base64,JVBERi0xLjQ=',
    'data:image/png;base64,iVBORw0KGgo=',
    'data:application/octet-stream;base64,AAEC',
    'data:;base64,AAEC',
  ])('ACCEPTÉ : %s', (url) => {
    expect(erreurs(url)).toHaveLength(0);
  });

  it.each([
    'javascript:document.title="x"',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://exemple.com/fichier.pdf',
    'data:application/pdf;base64,JVBE<script>',
    '',
  ])('REFUSÉ : %s', (url) => {
    expect(erreurs(url)).not.toHaveLength(0);
  });

  it('REFUSÉ : au-delà de la longueur maximale', () => {
    expect(erreurs(`data:application/pdf;base64,${'A'.repeat(100)}`)).not.toHaveLength(0);
  });

  it('message unique pour le front', () => {
    expect(erreurs('javascript:alert(1)')[0].constraints).toMatchObject({ matches: 'Fichier invalide.' });
  });
});
