import type { ElementAgendaDto } from '../agenda.dto';
import { CLE_HUB, decider, empreinte, empreinteGoogle, voulus, type Lien } from './reconciliation';

// Réconciliation HUB ↔ agenda externe (16/11/2026).
const MAINTENANT = new Date('2026-11-16T12:00:00.000Z');
const LIEN_HUB = 'https://app.hub360.space/admin/gc/agenda';
const el = (x: Partial<ElementAgendaDto> = {}): ElementAgendaDto =>
  ({
    id: 'R1',
    type: 'rendez_vous',
    titre: 'Point chantier',
    jour: '2026-11-20',
    debut: '2026-11-20T09:00:00.000Z',
    fin: '2026-11-20T10:00:00.000Z',
    lieu: 'Plateau',
    detail: null,
    lienVisio: null,
    maReponse: null,
    jeSuisOrganisateur: true,
    modifiable: true,
    annulable: true,
    serieId: null,
    entretien: false,
    ...x,
  }) as ElementAgendaDto;
const google = (x: Record<string, unknown> = {}) => ({
  id: 'G1',
  summary: 'Point chantier',
  location: 'Plateau',
  start: { dateTime: '2026-11-20T09:00:00.000Z' },
  end: { dateTime: '2026-11-20T10:00:00.000Z' },
  extendedProperties: { private: { [CLE_HUB]: 'R1' } },
  ...x,
});
const lienDe = (v = voulus([el()], LIEN_HUB).get('R1')!): Lien => ({
  cle: 'R1',
  idExterne: 'G1',
  empreinte: v.empreinte,
});
const decide = (elements: ElementAgendaDto[], liens: Lien[], actuels: ReturnType<typeof google>[]) =>
  decider(
    liens,
    voulus(elements, LIEN_HUB),
    new Map(actuels.map((g) => [g.extendedProperties.private[CLE_HUB], g])),
    MAINTENANT,
  ).map((a) => a.type);

describe('voulus', () => {
  it('ses réunions et celles où elle est invitée ; jamais une déclinée ni une échéance', () => {
    const v = voulus(
      [el(), el({ id: 'R2', maReponse: 'non' }), el({ id: 'T1', type: 'echeance', debut: null, fin: null })],
      LIEN_HUB,
    );
    expect([...v.keys()]).toEqual(['R1']);
    expect(v.get('R1')!.ecriture).toMatchObject({
      summary: 'Point chantier',
      location: 'Plateau',
      start: { dateTime: '2026-11-20T09:00:00.000Z' },
      extendedProperties: { private: { [CLE_HUB]: 'R1' } },
    });
    expect(v.get('R1')!.ecriture.description).toContain(LIEN_HUB);
  });

  it('la visio tient lieu de lieu ; un entretien ne montre pas sa note', () => {
    const v = voulus(
      [el({ lieu: null, lienVisio: 'https://meet.google.com/x', entretien: true, detail: 'Recrutement' })],
      LIEN_HUB,
    );
    expect(v.get('R1')!.ecriture.location).toBe('https://meet.google.com/x');
    expect(v.get('R1')!.ecriture.description).not.toContain('Recrutement');
  });
});

describe('empreinte', () => {
  it('même contenu, même empreinte, que l’heure soit écrite avec ou sans millisecondes', () => {
    expect(
      empreinteGoogle(
        google({ start: { dateTime: '2026-11-20T09:00:00Z' }, end: { dateTime: '2026-11-20T10:00:00Z' } }),
      ),
    ).toBe(
      empreinte({
        titre: 'Point chantier',
        lieu: 'Plateau',
        debut: '2026-11-20T09:00:00.000Z',
        fin: '2026-11-20T10:00:00.000Z',
      }),
    );
  });
});

describe('decider', () => {
  it('nouvelle réunion : créée ; rien de changé : rien', () => {
    expect(decide([el()], [], [])).toEqual(['creer']);
    expect(decide([el()], [lienDe()], [google()])).toEqual([]);
  });

  it('changée dans le HUB : Google suit', () => {
    expect(decide([el({ titre: 'Point chantier (déplacé)' })], [lienDe()], [google()])).toEqual(['mettre_a_jour']);
  });

  it('changée dans Google par l’organisateur : le HUB suit ; par un invité : la version du HUB revient', () => {
    const deplacee = google({ start: { dateTime: '2026-11-20T14:00:00Z' }, end: { dateTime: '2026-11-20T15:00:00Z' } });
    expect(decide([el()], [lienDe()], [deplacee])).toEqual(['reprendre']);
    expect(decide([el({ jeSuisOrganisateur: false, modifiable: false })], [lienDe()], [deplacee])).toEqual([
      'retablir',
    ]);
    // Un entretien (non modifiable d'ici) : la version du HUB revient aussi.
    expect(decide([el({ modifiable: false, entretien: true })], [lienDe()], [deplacee])).toEqual(['retablir']);
  });

  it('supprimée dans Google : l’organisateur l’annule, un invité la décline (à venir seulement)', () => {
    expect(decide([el()], [lienDe()], [])).toEqual(['annuler_hub']);
    expect(decide([el({ jeSuisOrganisateur: false })], [lienDe()], [])).toEqual(['decliner_hub']);
    expect(decide([el()], [lienDe()], [google({ status: 'cancelled' })])).toEqual(['annuler_hub']);
    // Passée : on ne touche plus à rien.
    const passee = el({ debut: '2026-11-10T09:00:00.000Z', fin: '2026-11-10T10:00:00.000Z' });
    expect(decide([passee], [lienDe(voulus([passee], LIEN_HUB).get('R1')!)], [])).toEqual(['oublier']);
  });

  it('supprimée dans Google sans droit de l’annuler (entretien) : elle revient ; une date de série effacée par un invité : masquée', () => {
    expect(decide([el({ annulable: false, entretien: true })], [lienDe()], [])).toEqual(['recreer']);
    const occ = el({ id: 'S1:2026-11-20T09:00:00.000Z', serieId: 'S1', jeSuisOrganisateur: false });
    const lienOcc = { ...lienDe(voulus([occ], LIEN_HUB).get(occ.id)!), cle: occ.id };
    expect(decide([occ], [lienOcc], [])).toEqual(['masquer']);
    // Masquée : on ne la réécrit plus.
    expect(decide([occ], [{ ...lienOcc, empreinte: 'masque' }], [])).toEqual([]);
  });

  it('changée dans Google ET dans le HUB : la version du HUB l’emporte ; journée entière : jamais reprise', () => {
    const deplacee = google({ start: { dateTime: '2026-11-20T14:00:00Z' }, end: { dateTime: '2026-11-20T15:00:00Z' } });
    expect(decide([el({ titre: 'Nouveau titre' })], [lienDe()], [deplacee])).toEqual(['retablir']);
    const journee = google({ start: { date: '2026-11-21' }, end: { date: '2026-11-22' } });
    expect(decide([el()], [lienDe()], [journee])).toEqual(['retablir']);
  });

  it('déjà chez Google sans lien (tournée interrompue) : adoptée, pas recréée', () => {
    expect(decide([el()], [], [google()])).toEqual(['adopter']);
    expect(decide([el()], [], [])).toEqual(['creer']);
  });

  it('plus dans le HUB : retirée de Google si à venir ; passée ou déjà absente : oubliée', () => {
    expect(decide([], [lienDe()], [google()])).toEqual(['supprimer_google']);
    expect(decide([], [lienDe()], [])).toEqual(['oublier']);
    const passee = google({ start: { dateTime: '2026-11-10T09:00:00Z' }, end: { dateTime: '2026-11-10T10:00:00Z' } });
    expect(decide([], [lienDe()], [passee])).toEqual(['oublier']);
  });
});
