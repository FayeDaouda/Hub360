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
  regle: null,
  exceptions: [],
  sequence: 0,
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
    candidature: { count: jest.fn().mockResolvedValue(0) },
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

  it('l’annulation reprend le même UID, version suivante (incrémentée en base avant l’envoi)', async () => {
    const { s, email } = monter({ ...RDV, sequence: 1 });
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

  it('destinataires : l’envoi se limite à eux (l’annulation aux invités retirés)', async () => {
    const { s, email, prisma } = monter({ ...RDV, invites: [{ utilisateurId: 'U3' }], sequence: 2 });
    prisma.utilisateur.findMany.mockResolvedValue([COMPTES[0], COMPTES[1]]);
    expect(await s.envoyer('R1', 'CANCEL', { destinataires: ['U2'] })).toBe(1);
    const i = email.envoyerInvitationAgenda.mock.calls[0][0];
    expect(i).toMatchObject({ email: 'moussa@gc.sn', methode: 'CANCEL' });
    expect(i.ics).toContain('SEQUENCE:2');
    expect(prisma.utilisateur.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['U1', 'U2'] } } }),
    );
  });

  it('un entretien part sans le nom du candidat (titre, e-mail, calendrier)', async () => {
    const { s, email, prisma } = monter({
      ...RDV,
      titre: 'Entretien · Awa Diop · Comptable',
      description: 'Recrutement',
    });
    prisma.candidature.count.mockResolvedValue(1);
    await s.envoyer('R1', 'REQUEST');
    const i = email.envoyerInvitationAgenda.mock.calls[0][0];
    expect(i.titre).toBe('Entretien de recrutement');
    expect(i.ics).toContain('SUMMARY:Entretien de recrutement');
    expect(i.ics).not.toContain('Awa Diop · Comptable');
  });
  // Lot B3 (12/11/2026) : lien visio et rappel dans l'invitation.
  describe('visio et rappel', () => {
    // Le calendrier plie les lignes à 75 octets : on le déplie pour le lire.
    const deplier = (ics: string) => ics.replace(/\r\n /g, '');
    const VISIO = 'https://meet.google.com/abc-defg-hij';

    it('sans lieu, la visio sert de lieu et ouvre la description du calendrier', async () => {
      const { s, email } = monter({ ...RDV, lieu: null, lienVisio: VISIO, description: 'Ordre du jour' });
      await s.envoyer('R1', 'REQUEST');
      const i = email.envoyerInvitationAgenda.mock.calls[0][0];
      const ics = deplier(i.ics);
      expect(ics).toContain(`LOCATION:${VISIO}`);
      expect(ics).toMatch(new RegExp(`DESCRIPTION:Visio : ${VISIO}\\\\nOrdre du jour\\\\nDans le HUB : `));
      // L'e-mail reçoit le lien à part, et pas de lieu.
      expect(i).toMatchObject({ lieu: null, lienVisio: VISIO });
    });

    it('avec un lieu, le lieu reste le lieu ; la visio est dans la description', async () => {
      const { s, email } = monter({ ...RDV, lienVisio: VISIO });
      await s.envoyer('R1', 'REQUEST');
      const ics = deplier(email.envoyerInvitationAgenda.mock.calls[0][0].ics);
      expect(ics).toContain('LOCATION:Plateau');
      expect(ics).not.toContain(`LOCATION:${VISIO}`);
      expect(ics).toContain(`DESCRIPTION:Visio : ${VISIO}`);
    });

    it('sans visio ni lieu : ni LOCATION, ni ligne « Visio » dans la description', async () => {
      const { s, email } = monter({ ...RDV, lieu: null, lienVisio: null });
      await s.envoyer('R1', 'REQUEST');
      const ics = deplier(email.envoyerInvitationAgenda.mock.calls[0][0].ics);
      expect(ics).not.toContain('LOCATION:');
      expect(ics).not.toContain('Visio');
    });

    it('un rappel demandé ajoute une alerte au calendrier, ces minutes avant le début', async () => {
      const { s, email } = monter({ ...RDV, rappelMinutes: 30 });
      await s.envoyer('R1', 'REQUEST');
      const ics = deplier(email.envoyerInvitationAgenda.mock.calls[0][0].ics);
      expect(ics).toContain('BEGIN:VALARM');
      expect(ics).toContain('TRIGGER:-PT30M');
      // L'alerte est dans l'événement, avant sa fin.
      expect(ics.indexOf('END:VALARM')).toBeLessThan(ics.indexOf('END:VEVENT'));
    });

    it('la veille : alerte de 1440 minutes', async () => {
      const { s, email } = monter({ ...RDV, rappelMinutes: 1440 });
      await s.envoyer('R1', 'REQUEST');
      expect(deplier(email.envoyerInvitationAgenda.mock.calls[0][0].ics)).toContain('TRIGGER:-PT1440M');
    });

    it('sans rappel, aucune alerte ; une annulation n’en porte jamais', async () => {
      const sans = monter({ ...RDV, rappelMinutes: null });
      await sans.s.envoyer('R1', 'REQUEST');
      expect(sans.email.envoyerInvitationAgenda.mock.calls[0][0].ics).not.toContain('VALARM');
      const annulee = monter({ ...RDV, rappelMinutes: 30, sequence: 1 });
      await annulee.s.envoyer('R1', 'CANCEL');
      expect(annulee.email.envoyerInvitationAgenda.mock.calls[0][0].ics).not.toContain('VALARM');
    });

    it('un entretien garde la visio mais pas la note (le nom du candidat n’en sort pas)', async () => {
      const { s, email, prisma } = monter({
        ...RDV,
        titre: 'Entretien · Khady Fall · Comptable',
        description: 'Candidate Khady Fall',
        lieu: null,
        lienVisio: VISIO,
      });
      prisma.candidature.count.mockResolvedValue(1);
      await s.envoyer('R1', 'REQUEST');
      const ics = deplier(email.envoyerInvitationAgenda.mock.calls[0][0].ics);
      expect(ics).toContain(`DESCRIPTION:Visio : ${VISIO}`);
      expect(ics).not.toContain('Khady Fall');
    });
  });

  // Récurrence (16/11/2026).
  it('série : la règle, les dates annulées, puis chaque occurrence modifiée (même UID)', async () => {
    const { s, email } = monter({
      ...RDV,
      regle: 'FREQ=WEEKLY;BYDAY=FR',
      exceptions: [
        {
          occurrence: new Date('2026-11-20T09:00:00.000Z'),
          annulee: true,
          titre: null,
          debut: null,
          fin: null,
          lieu: null,
          description: null,
          lienVisio: null,
        },
        {
          occurrence: new Date('2026-11-27T09:00:00.000Z'),
          annulee: false,
          titre: null,
          debut: new Date('2026-11-27T14:00:00.000Z'),
          fin: new Date('2026-11-27T15:00:00.000Z'),
          lieu: 'Chantier',
          description: null,
          lienVisio: null,
        },
      ],
    });
    await s.envoyer('R1', 'REQUEST');
    const ics: string = email.envoyerInvitationAgenda.mock.calls[0][0].ics.replace(/\r\n /g, '');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR');
    expect(ics).toContain('EXDATE:20261120T090000Z');
    expect(ics).toContain('RECURRENCE-ID:20261127T090000Z');
    expect(ics).toContain('DTSTART:20261127T140000Z');
    expect(ics).toContain('LOCATION:Chantier');
    expect(ics.match(/UID:rdv-R1@hub360.space/g)).toHaveLength(2);
  });

  it('série annulée (CANCEL) : la série seule, sans ses occurrences modifiées', async () => {
    const { s, email } = monter({
      ...RDV,
      regle: 'FREQ=WEEKLY;BYDAY=FR',
      exceptions: [
        {
          occurrence: new Date('2026-11-27T09:00:00.000Z'),
          annulee: false,
          titre: 'X',
          debut: null,
          fin: null,
          lieu: null,
          description: null,
          lienVisio: null,
        },
      ],
    });
    await s.envoyer('R1', 'CANCEL');
    const ics: string = email.envoyerInvitationAgenda.mock.calls[0][0].ics;
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).not.toContain('RECURRENCE-ID');
  });
});
