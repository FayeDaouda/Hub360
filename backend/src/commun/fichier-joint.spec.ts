import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TypeFichier, typeDuContenu, UrlFichierJoint } from './fichier-joint';

// Échantillons construits à partir des signatures officielles de chaque format.
const zipOffice = (dossier: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from(`[Content_Types].xml${'\0'.repeat(40)}${dossier}document.xml`)]);
const ECHANTILLONS: Record<TypeFichier, Buffer> = {
  pdf: Buffer.from('%PDF-1.7\n%âãÏÓ\n'),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
  heic: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic\0\0\0\0mif1heic')]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
  dwg: Buffer.from('AC1032\0\0\0\0\0'),
  dxf: Buffer.from('  0\r\nSECTION\r\n  2\r\nHEADER\r\n'),
  docx: zipOffice('word/'),
  xlsx: zipOffice('xl/'),
  pptx: zipOffice('ppt/'),
};
const dataUri = (octets: Buffer, mime = 'application/octet-stream') => `data:${mime};base64,${octets.toString('base64')}`;

class FichierRh {
  @UrlFichierJoint(1_000, 'rh') url!: string;
}
class FichierProjet {
  @UrlFichierJoint(1_000, 'projet') url!: string;
}
const erreurs = (classe: typeof FichierRh | typeof FichierProjet, url: unknown) => validateSync(plainToInstance(classe, { url }));

describe('typeDuContenu', () => {
  it.each(Object.entries(ECHANTILLONS))('reconnaît %s par son contenu', (type, octets) => {
    expect(typeDuContenu(octets)).toBe(type);
  });

  it.each([
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['HTML', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['ZIP ordinaire', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from('photos/vacances.jpg')])],
    ['texte', Buffer.from('bonjour')],
    ['vide', Buffer.alloc(0)],
  ])('ne reconnaît pas : %s', (_cas, octets) => {
    expect(typeDuContenu(octets)).toBeNull();
  });
});

describe('UrlFichierJoint', () => {
  it.each(['pdf', 'jpeg', 'png', 'heic'] as TypeFichier[])('RH ACCEPTÉ : %s', (type) => {
    expect(erreurs(FichierRh, dataUri(ECHANTILLONS[type]))).toHaveLength(0);
  });

  it.each(['webp', 'dwg', 'dxf', 'docx', 'xlsx', 'pptx'] as TypeFichier[])('RH REFUSÉ : %s', (type) => {
    expect(erreurs(FichierRh, dataUri(ECHANTILLONS[type]))[0].constraints).toMatchObject({
      typeFichierAccepte: 'Type de fichier refusé : PDF, JPG, PNG, HEIC uniquement.',
    });
  });

  it.each(Object.keys(ECHANTILLONS) as TypeFichier[])('Projet ACCEPTÉ : %s', (type) => {
    expect(erreurs(FichierProjet, dataUri(ECHANTILLONS[type]))).toHaveLength(0);
  });

  it('le type déclaré par le navigateur ne compte pas : un SVG déclaré PDF est refusé', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(erreurs(FichierProjet, dataUri(svg, 'application/pdf'))).not.toHaveLength(0);
  });

  it.each([
    'javascript:document.title="x"',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://exemple.com/fichier.pdf',
    'data:application/pdf;base64,JVBE<script>',
    '',
  ])('REFUSÉ (schéma) : %s', (url) => {
    expect(erreurs(FichierRh, url)[0].constraints).toMatchObject({ matches: 'Fichier invalide.' });
  });

  it('REFUSÉ : au-delà de la longueur maximale', () => {
    expect(erreurs(FichierRh, dataUri(Buffer.concat([ECHANTILLONS.pdf, Buffer.alloc(1_000)])))).not.toHaveLength(0);
  });
});
