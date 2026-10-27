import { contenuAvisSecurite } from './contenu-avis-securite';

describe('contenuAvisSecurite', () => {
  const le = new Date('2026-10-28T21:40:00Z');

  it('dit ce qui a changé, quand (heure de Dakar), et quoi faire si ce n’est pas la personne', () => {
    const { sujet, texte, html } = contenuAvisSecurite({
      email: 'awa@exemple.sn',
      prenom: 'Awa',
      evenement: 'mot_de_passe_modifie',
      le,
    });
    expect(sujet).toBe('Votre mot de passe a été modifié · hub360°');
    expect(texte).toContain('Bonjour Awa,');
    expect(texte).toContain('a été modifié le 28 octobre 2026 à 21:40 (heure de Dakar).');
    expect(texte).toContain('« Mot de passe oublié »');
    expect(html).toContain('<p>Bonjour Awa,</p>');
  });

  it.each([
    ['mot_de_passe_reinitialise', 'Votre mot de passe a été réinitialisé'],
    ['double_facteur_active', 'Double authentification activée'],
    ['double_facteur_reinitialise', 'Double authentification réinitialisée'],
  ] as const)('%s', (evenement, sujet) => {
    expect(contenuAvisSecurite({ email: 'a@b.sn', prenom: 'A', evenement, le }).sujet).toBe(`${sujet} · hub360°`);
  });

  it('compte verrouillé (lot C) : heure de réouverture, attente ou déblocage par le CIO', () => {
    const { sujet, texte } = contenuAvisSecurite({
      email: 'a@b.sn',
      prenom: 'A',
      evenement: 'compte_verrouille',
      le,
      jusquau: new Date('2026-10-28T21:55:00Z'),
    });
    expect(sujet).toBe('Votre compte est verrouillé · hub360°');
    expect(texte).toContain('Après 10 essais de connexion infructueux');
    expect(texte).toContain('Il rouvrira le 28 octobre 2026 à 21:55.');
    expect(texte).toContain('demandez au CIO de le débloquer');
  });

  it('échappe le prénom dans le HTML', () => {
    const { html } = contenuAvisSecurite({
      email: 'a@b.sn',
      prenom: '<b>A</b>',
      evenement: 'double_facteur_active',
      le,
    });
    expect(html).toContain('&lt;b&gt;A&lt;/b&gt;');
  });
});
