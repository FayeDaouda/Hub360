import { contenuInvitationAgenda } from './contenu-invitation-agenda';

// E-mail d'invitation à une réunion de l'Agenda (12/11/2026) : lisible seul,
// le calendrier joint faisant le reste. Dakar est en UTC toute l'année.
const base = {
  email: 'moussa@gc.sn',
  prenom: 'Moussa',
  societeNom: 'Grey Concrete',
  methode: 'REQUEST' as const,
  titre: 'Point chantier',
  debut: new Date('2026-11-13T09:00:00.000Z'),
  fin: new Date('2026-11-13T10:30:00.000Z'),
  lieu: 'Dakar, Plateau',
  organisateurNom: 'Awa Diop',
  lien: 'https://app.hub360.space/admin/grey-concrete/agenda',
  ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
};

describe('contenuInvitationAgenda', () => {
  it('invitation : sujet « Invitation : », titre, jour et heure de début', () => {
    const m = contenuInvitationAgenda(base);
    expect(m.sujet).toBe('Invitation : Point chantier · vendredi 13 novembre à 09:00');
    expect(m.texte).toContain('Bonjour Moussa,');
    expect(m.texte).toContain('Awa Diop vous invite à une réunion.');
    expect(m.texte).toContain('Date : vendredi 13 novembre, de 09:00 à 10:30');
    expect(m.texte).toContain('Lieu : Dakar, Plateau');
    expect(m.texte).toContain(base.lien);
  });

  it('annulation : sujet « Annulée : » et texte de retrait, sans invitation à répondre', () => {
    const m = contenuInvitationAgenda({ ...base, methode: 'CANCEL' });
    expect(m.sujet).toBe('Annulée : Point chantier · vendredi 13 novembre à 09:00');
    expect(m.texte).toContain('Awa Diop a annulé cette réunion.');
    expect(m.texte).not.toContain('vous invite');
    expect(m.texte).not.toContain('« Oui »');
  });

  it('sans lieu, aucune ligne « Lieu » n’apparaît', () => {
    const m = contenuInvitationAgenda({ ...base, lieu: null });
    expect(m.texte).not.toContain('Lieu');
    expect(m.html).not.toContain('Lieu');
  });

  it('échappe le HTML du titre, du lieu, du prénom et de l’organisateur ; le texte brut reste intact', () => {
    const m = contenuInvitationAgenda({
      ...base,
      prenom: 'Moussa <b>',
      titre: 'Revue <script>alert(1)</script>',
      lieu: 'Salle "A" & <B>',
      organisateurNom: 'Awa <i>Diop</i>',
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<i>');
    expect(m.html).toContain('Revue &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(m.html).toContain('Salle &quot;A&quot; &amp; &lt;B&gt;');
    expect(m.html).toContain('Bonjour Moussa &lt;b&gt;,');
    expect(m.html).toContain('Awa &lt;i&gt;Diop&lt;/i&gt;');
    // Le texte brut n'est pas du HTML : rien à échapper.
    expect(m.texte).toContain('Revue <script>alert(1)</script>');
  });

  it('le lien de l’agenda est échappé dans l’attribut href', () => {
    const m = contenuInvitationAgenda({ ...base, lien: 'https://hub.sn/agenda?a=1&b="x"' });
    expect(m.html).toContain('href="https://hub.sn/agenda?a=1&amp;b=&quot;x&quot;"');
  });
});
