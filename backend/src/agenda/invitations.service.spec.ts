import { InvitationsAgendaService } from './invitations.service';

// Invitations par e-mail aux réunions de l'Agenda (12/11/2026).
const RDV = {
  id: 'R1',
  titre: 'Point chantier',
  debut: new Date('2026-11-13T09:00:00.000Z'),
  fin: new Date('2026-11-13T10:00:00.000Z'),
  lieu: 'Plateau',
  description: null,
  organisateurId: 'U1',
  invites: [{ utilisateurId: 'U2' }, { utilisateurId: 'U3' }],
  societe: { nom: 'Grey Concrete', slug: 'grey-concrete' },
};
const COMPTES = [
  { id: 'U1', email: 'awa@gc.sn', prenom: 'Awa', nom: 'Diop', actif: true },
  { id: 'U2', email: 'moussa@gc.sn', prenom: 'Moussa', nom: 'Sow', actif: true },
  { id: 'U3', email: 'parti@gc.sn', prenom: 'Ancien', nom: 'Salarié', actif: false },
];

const monter = (rdv: unknown = RDV) => {
  const prisma = {
    rendezVous: { findUnique: jest.fn().mockResolvedValue(rdv) },
    utilisateur: { findMany: jest.fn().mockResolvedValue(COMPTES) },
  };
  const email = { envoyerInvitationAgenda: jest.fn().mockResolvedValue({ envoye: true }) };
  return { s: new InvitationsAgendaService(prisma as never, email as never), email, prisma };
};

describe('InvitationsAgendaService', () => {
  it('chaque invité actif reçoit l’invitation, avec le calendrier de la réunion', async () => {
    const { s, email } = monter();
    expect(await s.envoyer('R1', 'REQUEST')).toBe(1);
    expect(email.envoyerInvitationAgenda).toHaveBeenCalledTimes(1);
    const i = email.envoyerInvitationAgenda.mock.calls[0][0];
    expect(i).toMatchObject({ email: 'moussa@gc.sn', methode: 'REQUEST', organisateurNom: 'Awa Diop' });
    expect(i.ics).toContain('UID:rdv-R1@hub360.space'); // même UID que l'abonnement
    expect(i.ics).toContain('mailto:awa@gc.sn');
    expect(i.ics).not.toContain('parti@gc.sn');
  });

  it('l’annulation reprend le même UID, version suivante', async () => {
    const { s, email } = monter();
    await s.envoyer('R1', 'CANCEL');
    const { ics } = email.envoyerInvitationAgenda.mock.calls[0][0];
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('UID:rdv-R1@hub360.space');
    expect(ics).toContain('SEQUENCE:1');
  });

  it('sans invité, rien ne part ; une erreur ne remonte jamais', async () => {
    const vide = monter({ ...RDV, invites: [] });
    expect(await vide.s.envoyer('R1', 'REQUEST')).toBe(0);
    expect(vide.email.envoyerInvitationAgenda).not.toHaveBeenCalled();
    const casse = monter();
    casse.prisma.rendezVous.findUnique.mockRejectedValue(new Error('base indisponible'));
    await expect(casse.s.envoyer('R1', 'REQUEST')).resolves.toBe(0);
  });
});
