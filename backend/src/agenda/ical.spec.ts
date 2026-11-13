import { calendrierIcal, echapperTexte, plierLigne } from './ical';

// Format iCalendar (RFC 5545) lu par Google, Apple et Outlook (12/11/2026).
const MAINTENANT = new Date('2026-11-12T08:30:00.000Z');
const lignes = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n');

describe('calendrierIcal', () => {
  it('échappe le texte : barre oblique inverse, point-virgule, virgule, retour à la ligne', () => {
    expect(echapperTexte('a\\b; c, d\ne')).toBe('a\\\\b\\; c\\, d\\ne');
  });

  it('plie les lignes à 75 octets sans couper un caractère accentué', () => {
    const longue = `SUMMARY:${'é'.repeat(80)}`;
    const pliee = plierLigne(longue);
    for (const l of pliee.split('\r\n')) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    expect(pliee.replace(/\r\n /g, '')).toBe(longue);
  });

  it('un rendez-vous horodaté en UTC, une journée entière avec le lendemain en fin', () => {
    const ics = calendrierIcal({
      nom: 'HUB · Grey Concrete',
      methode: 'PUBLISH',
      maintenant: MAINTENANT,
      evenements: [
        {
          uid: 'rdv-1@hub360.space',
          titre: 'Point chantier',
          debut: new Date('2026-11-13T09:00:00.000Z'),
          fin: new Date('2026-11-13T10:30:00.000Z'),
          lieu: 'Dakar, Plateau',
        },
        { uid: 'absence-2@hub360.space', titre: 'Absence', debut: '2026-12-30', fin: '2026-12-31', libre: false },
      ],
    });
    const l = lignes(ics);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(l).toEqual(
      expect.arrayContaining([
        'METHOD:PUBLISH',
        'X-WR-CALNAME:HUB · Grey Concrete',
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'DTSTAMP:20261112T083000Z',
        'DTSTART:20261113T090000Z',
        'DTEND:20261113T103000Z',
        'LOCATION:Dakar\\, Plateau',
        'DTSTART;VALUE=DATE:20261230',
        'DTEND;VALUE=DATE:20270101',
      ]),
    );
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('invitation : organisateur, invités à répondre ; annulation : statut annulé', () => {
    const evenement = {
      uid: 'rdv-1@hub360.space',
      titre: 'Réunion',
      debut: new Date('2026-11-13T09:00:00.000Z'),
      fin: new Date('2026-11-13T10:00:00.000Z'),
      organisateur: { nom: 'Awa "la" Diop', email: 'awa@gc.sn' },
      invites: [{ nom: 'Moussa Sow', email: 'moussa@gc.sn' }],
    };
    const invitation = lignes(calendrierIcal({ nom: 'HUB', methode: 'REQUEST', evenements: [evenement] }));
    expect(invitation).toEqual(
      expect.arrayContaining([
        'METHOD:REQUEST',
        'ORGANIZER;CN="Awa la Diop":mailto:awa@gc.sn',
        'ATTENDEE;CN="Moussa Sow";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:moussa@gc.sn',
        'STATUS:CONFIRMED',
      ]),
    );
    expect(invitation.some((x) => x.startsWith('REFRESH-INTERVAL'))).toBe(false);
    const annulation = lignes(
      calendrierIcal({ nom: 'HUB', methode: 'CANCEL', evenements: [{ ...evenement, sequence: 1 }] }),
    );
    expect(annulation).toEqual(expect.arrayContaining(['METHOD:CANCEL', 'STATUS:CANCELLED', 'SEQUENCE:1']));
  });

  it('un retour à la ligne dans un nom d’invité ou une adresse ne crée pas de nouvelle propriété', () => {
    const ics = calendrierIcal({
      nom: 'HUB',
      methode: 'REQUEST',
      maintenant: MAINTENANT,
      evenements: [
        {
          uid: 'rdv-1@hub360.space',
          titre: 'Réunion',
          debut: new Date('2026-11-13T09:00:00.000Z'),
          fin: new Date('2026-11-13T10:00:00.000Z'),
          organisateur: { nom: 'Awa\r\nATTENDEE:mailto:pirate@x.sn', email: 'awa@gc.sn\r\nX-PIRATE:1' },
          invites: [{ nom: 'Moussa\nSow\t"chef"', email: ' moussa@gc.sn\n;RSVP=FALSE' }],
        },
      ],
    });
    const l = lignes(ics);
    // Aucune ligne injectée : chaque ligne reste une propriété connue.
    expect(l.some((x) => x.startsWith('ATTENDEE:'))).toBe(false);
    expect(l.some((x) => x.startsWith('X-PIRATE'))).toBe(false);
    expect(l.filter((x) => x.startsWith('ATTENDEE;'))).toHaveLength(1);
    expect(l).toEqual(
      expect.arrayContaining([
        'ORGANIZER;CN="AwaATTENDEE:mailto:pirate@x.sn":mailto:awa@gc.snX-PIRATE1',
        'ATTENDEE;CN="MoussaSowchef";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:moussa@gc.snRSVP=FALSE',
      ]),
    );
    // Aucun CR ni LF isolé : seules les fins de ligne et les plis CRLF.
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  // Un retour chariot seul (CR) ne doit jamais ouvrir une nouvelle propriété
  // (RFC 5545 §3.3.11 : pas de caractère de contrôle dans un texte).
  it('un retour chariot seul dans le titre, le lieu ou la description ne casse pas une ligne', () => {
    const ics = calendrierIcal({
      nom: 'HUB',
      methode: 'PUBLISH',
      maintenant: MAINTENANT,
      evenements: [
        {
          uid: 'rdv-1@hub360.space',
          titre: 'Point\rchantier',
          debut: new Date('2026-11-13T09:00:00.000Z'),
          fin: new Date('2026-11-13T10:00:00.000Z'),
          lieu: 'Salle\rA',
          description: 'Ligne 1\r\nLigne 2\nLigne 3',
        },
      ],
    });
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(lignes(ics)).toContain('DESCRIPTION:Ligne 1\\nLigne 2\\nLigne 3');
  });

  it('refuse une journée entière mal formée', () => {
    expect(() =>
      calendrierIcal({
        nom: 'HUB',
        methode: 'PUBLISH',
        evenements: [{ uid: 'x', titre: 'x', debut: '13/11', fin: '13/11' }],
      }),
    ).toThrow();
  });

  it('rappel : une alerte après les propriétés de l’événement, jamais sur une annulation', () => {
    const e = {
      uid: 'rdv-1@hub360.space',
      titre: 'Point',
      debut: new Date('2026-11-13T09:00:00.000Z'),
      fin: new Date('2026-11-13T10:00:00.000Z'),
      rappelMinutes: 30,
    };
    const l = lignes(calendrierIcal({ nom: 'HUB', methode: 'REQUEST', evenements: [e] }));
    const debutAlerte = l.indexOf('BEGIN:VALARM');
    expect(l.slice(debutAlerte, debutAlerte + 5)).toEqual([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Point',
      'TRIGGER:-PT30M',
      'END:VALARM',
    ]);
    expect(debutAlerte).toBeGreaterThan(l.indexOf('TRANSP:OPAQUE'));
    expect(l[debutAlerte + 5]).toBe('END:VEVENT');
    expect(calendrierIcal({ nom: 'HUB', methode: 'CANCEL', evenements: [e] })).not.toContain('VALARM');
  });
});
