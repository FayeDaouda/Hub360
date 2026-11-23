import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreerRendezVousDto, ModifierRendezVousDto, RepondreInvitationDto } from './agenda.dto';

// Validation des entrées de l'Agenda, lot B3 (12/11/2026) : lien visio,
// rappel, réponse à une invitation — comme le ValidationPipe global
// (whitelist + transform) les applique.
const BASE = { titre: 'Point chantier', debut: '2026-11-13T09:00:00.000Z', fin: '2026-11-13T10:00:00.000Z' };
const erreurs = <T extends object>(classe: new () => T, corps: object) =>
  validateSync(plainToInstance(classe, corps), { whitelist: true }).map((e) => e.property);

describe('CreerRendezVousDto · lien visio', () => {
  it('accepte un lien https', () => {
    expect(erreurs(CreerRendezVousDto, { ...BASE, lienVisio: 'https://meet.google.com/abc-defg-hij' })).toEqual([]);
  });

  it('accepte null (le lien est effacé) et l’absence du champ', () => {
    expect(erreurs(CreerRendezVousDto, { ...BASE, lienVisio: null })).toEqual([]);
    expect(erreurs(CreerRendezVousDto, BASE)).toEqual([]);
  });

  it.each([
    ['http (non chiffré)', 'http://meet.google.com/abc'],
    ['javascript:', 'javascript:alert(1)'],
    ['sans protocole', 'meet.google.com/abc'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['un texte quelconque', 'demain au bureau'],
  ])('refuse un lien %s', (_cas, lienVisio) => {
    expect(erreurs(CreerRendezVousDto, { ...BASE, lienVisio })).toContain('lienVisio');
  });

  it('refuse un lien de plus de 500 caractères', () => {
    const lienVisio = `https://meet.google.com/${'a'.repeat(480)}`;
    expect(lienVisio.length).toBeGreaterThan(500);
    expect(erreurs(CreerRendezVousDto, { ...BASE, lienVisio })).toContain('lienVisio');
  });

  it('la modification applique les mêmes règles au lien visio', () => {
    const modif = { ...BASE, inviteIds: [] };
    expect(erreurs(ModifierRendezVousDto, { ...modif, lienVisio: 'javascript:alert(1)' })).toContain('lienVisio');
    expect(erreurs(ModifierRendezVousDto, { ...modif, lienVisio: 'https://zoom.us/j/123' })).toEqual([]);
  });
});

describe('CreerRendezVousDto · rappel', () => {
  it.each([10, 30, 60, 1440])('accepte le rappel proposé de %i minutes', (rappelMinutes) => {
    expect(erreurs(CreerRendezVousDto, { ...BASE, rappelMinutes })).toEqual([]);
  });

  it('accepte null (aucun rappel)', () => {
    expect(erreurs(CreerRendezVousDto, { ...BASE, rappelMinutes: null })).toEqual([]);
  });

  it.each([
    ['0', 0],
    ['négatif', -10],
    ['hors liste', 15],
    ['plus d’un jour', 2880],
    ['en texte', '30'],
  ])('refuse un rappel %s', (_cas, rappelMinutes) => {
    expect(erreurs(CreerRendezVousDto, { ...BASE, rappelMinutes })).toContain('rappelMinutes');
  });

  it('la modification refuse aussi un rappel hors liste', () => {
    expect(erreurs(ModifierRendezVousDto, { ...BASE, inviteIds: [], rappelMinutes: 5 })).toContain('rappelMinutes');
  });
});

describe('RepondreInvitationDto', () => {
  it.each(['oui', 'non', 'peut_etre'])('accepte la réponse « %s »', (reponse) => {
    expect(erreurs(RepondreInvitationDto, { reponse })).toEqual([]);
  });

  it.each([
    ['inconnue', 'peut-etre'],
    ['en majuscules', 'OUI'],
    ['vide', ''],
    ['null', null],
  ])('refuse une réponse %s', (_cas, reponse) => {
    expect(erreurs(RepondreInvitationDto, { reponse })).toContain('reponse');
  });

  it('refuse un corps sans réponse', () => {
    expect(erreurs(RepondreInvitationDto, {})).toContain('reponse');
  });
});
