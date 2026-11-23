import { describe, expect, it } from 'vitest';
import type { ElementAgenda } from './agenda';
import { cleContinue, placerSemaine, semainesDuMois, type Segment } from './agenda-mois';

// Un élément complet ; journée entière par défaut (debut/fin nuls).
const el = (e: Partial<ElementAgenda> & Pick<ElementAgenda, 'id' | 'jour'>): ElementAgenda => ({
  type: 'rendez_vous',
  titre: e.id,
  debut: null,
  fin: null,
  lieu: null,
  detail: null,
  organisateur: null,
  invites: [],
  annulable: false,
  modifiable: false,
  entretien: false,
  jeSuisOrganisateur: true,
  serieId: null,
  occurrence: null,
  regle: null,
  regleTexte: null,
  occurrenceModifiee: false,
  serie: null,
  lienVisio: null,
  rappelMinutes: null,
  maReponse: null,
  participants: [],
  description: null,
  inviteIds: [],
  ...e,
});
// Un congé réparti jour par jour par le serveur (« <id>:<jour> »).
const conge = (id: string, jours: string[], titre = id): ElementAgenda[] =>
  jours.map((jour) => el({ id: `${id}:${jour}`, type: 'conge', titre, jour }));
// Un rendez-vous avec heure (la fin ne compte pas pour le placement).
const rdv = (id: string, jour: string, heure: string): ElementAgenda =>
  el({ id, jour, debut: `${jour}T${heure}:00.000Z`, fin: `${jour}T23:00:00.000Z` });

// Semaine du lundi 23 au dimanche 29 novembre 2026.
const LUNDI = '2026-11-23';
const resume = (s: Segment) => ({ id: s.e.id, col: s.col, span: s.span, ligne: s.ligne });

describe('cleContinue', () => {
  it('rend null pour un élément avec une heure', () => {
    expect(cleContinue(rdv('r1:2026-11-23', '2026-11-23', '09:00'))).toBeNull();
  });

  it('rend null pour un id sans suffixe « :<jour> »', () => {
    expect(cleContinue(el({ id: 'e1', type: 'echeance', jour: '2026-11-23' }))).toBeNull();
  });

  it('rend null si le suffixe ne correspond pas au jour de l’élément', () => {
    expect(cleContinue(el({ id: 'c1:2026-11-24', type: 'conge', jour: '2026-11-23' }))).toBeNull();
  });

  it('donne la même clé à tous les jours d’un même congé', () => {
    const [a, b] = conge('c1', ['2026-11-23', '2026-11-24']);
    expect(cleContinue(a)).not.toBeNull();
    expect(cleContinue(a)).toBe(cleContinue(b));
  });

  it('donne une clé différente au même congé superposé depuis l’agenda d’un collègue', () => {
    const [a] = conge('c1', ['2026-11-23']);
    const chezDior = { ...a, calque: { id: 'U7', nom: 'Dior Sourang', couleur: 'azur' } };
    const chezAwa = { ...a, calque: { id: 'U8', nom: 'Awa Diop', couleur: 'jade' } };
    expect(cleContinue(chezDior)).not.toBe(cleContinue(a));
    expect(cleContinue(chezDior)).not.toBe(cleContinue(chezAwa));
  });
});

describe('semainesDuMois', () => {
  it('montre 6 semaines pour novembre 2026 (du lundi 26 octobre)', () => {
    expect(semainesDuMois('2026-10-26', '2026-11')).toBe(6);
  });

  it('montre 5 semaines pour décembre 2026 (passage à l’année suivante)', () => {
    expect(semainesDuMois('2026-11-30', '2026-12')).toBe(5);
  });

  it('montre 4 semaines pour février 2027, qui commence un lundi', () => {
    expect(semainesDuMois('2027-02-01', '2027-02')).toBe(4);
  });
});

describe('placerSemaine', () => {
  it('réunit un congé de 3 jours dans la semaine en un seul segment', () => {
    const elements = conge('c1', ['2026-11-23', '2026-11-24', '2026-11-25']);
    const { segments, plus } = placerSemaine(elements, LUNDI, 3);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ col: 0, span: 3, ligne: 0, suiteAvant: false, suiteApres: false });
    expect(segments[0].e).toBe(elements[0]);
    expect(plus).toEqual([]);
  });

  it('coupe en deux un congé interrompu par un jour libre', () => {
    const elements = conge('c1', ['2026-11-23', '2026-11-25']);
    const { segments } = placerSemaine(elements, LUNDI, 3);
    expect(segments.map(resume)).toEqual([
      { id: 'c1:2026-11-23', col: 0, span: 1, ligne: 0 },
      { id: 'c1:2026-11-25', col: 2, span: 1, ligne: 0 },
    ]);
  });

  it('marque la suite d’un congé qui déborde sur la semaine suivante', () => {
    // Du vendredi 27 novembre au mardi 1er décembre.
    const elements = conge('c1', ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01']);
    const avant = placerSemaine(elements, LUNDI, 3).segments;
    expect(avant).toHaveLength(1);
    expect(avant[0]).toMatchObject({ col: 4, span: 3, suiteAvant: false, suiteApres: true });

    const apres = placerSemaine(elements, '2026-11-30', 3).segments;
    expect(apres).toHaveLength(1);
    expect(apres[0]).toMatchObject({ col: 0, span: 2, suiteAvant: true, suiteApres: false });
    expect(apres[0].e.jour).toBe('2026-11-30');
  });

  it('ne réunit pas le même congé vu dans deux agendas superposés', () => {
    const calque = { id: 'U7', nom: 'Dior Sourang', couleur: 'azur' };
    const miens = conge('c1', ['2026-11-23', '2026-11-24']);
    const siens = miens.map((e) => ({ ...e, calque }));
    const { segments } = placerSemaine([...miens, ...siens], LUNDI, 5);
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.span === 2)).toBe(true);
    expect(segments.map((s) => s.ligne).sort()).toEqual([0, 1]);
  });

  it('ordonne : barres longues d’abord, puis journée entière, puis par heure', () => {
    const elements = [
      rdv('Point 14 h', '2026-11-25', '14:00'),
      rdv('Point 9 h', '2026-11-25', '09:00'),
      el({ id: 'Rendu APS', type: 'echeance', jour: '2026-11-25' }),
      el({ id: 'Livraison', type: 'echeance', jour: '2026-11-25' }),
      ...conge('c1', ['2026-11-23', '2026-11-24', '2026-11-25']),
    ];
    const { segments, plus } = placerSemaine(elements, LUNDI, 10);
    expect(segments.map(resume)).toEqual([
      { id: 'c1:2026-11-23', col: 0, span: 3, ligne: 0 },
      { id: 'Livraison', col: 2, span: 1, ligne: 1 },
      { id: 'Rendu APS', col: 2, span: 1, ligne: 2 },
      { id: 'Point 9 h', col: 2, span: 1, ligne: 3 },
      { id: 'Point 14 h', col: 2, span: 1, ligne: 4 },
    ]);
    expect(plus).toEqual([]);
  });

  it('attribue à chaque segment la première ligne libre de toutes ses cases, sans chevauchement', () => {
    const elements = [
      ...conge('A', ['2026-11-23', '2026-11-24']), // lun.–mar.
      ...conge('C', ['2026-11-24', '2026-11-25']), // mar.–mer.
      ...conge('B', ['2026-11-25', '2026-11-26']), // mer.–jeu.
      rdv('R', '2026-11-24', '10:00'), // mar.
    ];
    const { segments } = placerSemaine(elements, LUNDI, 10);
    const ligneDe = (prefixe: string) => segments.find((s) => s.e.id.startsWith(prefixe))!.ligne;
    expect(ligneDe('A')).toBe(0);
    expect(ligneDe('C')).toBe(1);
    expect(ligneDe('B')).toBe(0);
    expect(ligneDe('R')).toBe(2);
    // Invariant : dans chaque case, deux segments n'ont jamais la même ligne.
    for (let col = 0; col < 7; col++) {
      const lignes = segments.filter((s) => s.col <= col && col < s.col + s.span).map((s) => s.ligne);
      expect(new Set(lignes).size).toBe(lignes.length);
    }
  });

  it('n’affiche aucun « plus » quand tout tient dans les lignes', () => {
    const elements = [
      rdv('a', '2026-11-25', '08:00'),
      rdv('b', '2026-11-25', '09:00'),
      rdv('c', '2026-11-25', '10:00'),
    ];
    const { segments, plus } = placerSemaine(elements, LUNDI, 3);
    expect(segments).toHaveLength(3);
    expect(plus).toEqual([]);
  });

  it('avec 3 lignes et 5 éléments un jour : 2 visibles et « + 3 »', () => {
    const elements = ['08', '09', '10', '11', '12'].map((h) => rdv(`r${h}`, '2026-11-25', `${h}:00`));
    const { segments, plus } = placerSemaine(elements, LUNDI, 3);
    expect(segments.map((s) => s.e.id)).toEqual(['r08', 'r09']);
    expect(plus).toEqual([{ col: 2, jour: '2026-11-25', n: 3 }]);
  });

  it('compte une barre cachée sur la dernière ligne dans le « + n » de chacune de ses cases', () => {
    const elements = [
      ...conge('X', ['2026-11-23', '2026-11-24', '2026-11-25']), // lun.–mer., ligne 0
      ...conge('Y', ['2026-11-24', '2026-11-25', '2026-11-26']), // mar.–jeu., ligne 1
      ...conge('Z', ['2026-11-25', '2026-11-26']), // mer.–jeu., ligne 2 (la dernière)
      rdv('R', '2026-11-25', '10:00'), // mer., ligne 3 : le mercredi déborde
    ];
    const { segments, plus } = placerSemaine(elements, LUNDI, 3);
    // Z tiendrait le jeudi, mais il est caché parce que le mercredi déborde.
    expect(segments.map((s) => s.e.id)).toEqual(['X:2026-11-23', 'Y:2026-11-24']);
    expect(plus).toEqual([
      { col: 2, jour: '2026-11-25', n: 2 }, // Z et R
      { col: 3, jour: '2026-11-26', n: 1 }, // Z
    ]);
  });

  it('ignore les éléments hors de la semaine', () => {
    const elements = [rdv('avant', '2026-11-22', '09:00'), rdv('apres', '2026-11-30', '09:00')];
    expect(placerSemaine(elements, LUNDI, 3)).toEqual({ segments: [], plus: [] });
  });
});
