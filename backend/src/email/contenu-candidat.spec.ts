import { contenuCandidat } from './contenu-candidat';

const base = {
  email: 'a@b.sn',
  prenom: 'Awa',
  societeNom: 'Grey Concrete',
  poste: 'Architecte',
  reference: 'C-1A2B3C',
};

describe('contenuCandidat', () => {
  it('accusé de réception : le poste, la société, la référence', () => {
    const m = contenuCandidat({ ...base, type: 'accuse' });
    expect(m.sujet).toBe('Candidature reçue — Architecte — Grey Concrete');
    expect(m.texte).toContain('C-1A2B3C');
  });

  it('convocation : date, heure et lieu', () => {
    const m = contenuCandidat({
      ...base,
      type: 'convocation',
      debut: '2026-11-04T10:00:00.000Z',
      fin: '2026-11-04T11:00:00.000Z',
      lieu: 'Salle <A>',
    });
    expect(m.texte).toContain('mercredi 4 novembre, de 10:00 à 11:00');
    expect(m.html).toContain('Salle &lt;A&gt;');
  });

  it('réponse négative : polie, sans motif', () => {
    const m = contenuCandidat({ ...base, type: 'reponse', retenu: false });
    expect(m.texte).toContain('pas en mesure d’y donner une suite favorable');
  });
});
