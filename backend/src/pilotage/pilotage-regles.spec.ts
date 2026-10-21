import { echeanceReporting, evaluer, moisAReporter, moisSuivant, numeroDecision, rappelsReporting, statutDecision, statutReporting } from './pilotage-regles';

// Pilotage (maquettes du boss) : reportings J+5, registre, objectifs.
describe('reportings mensuels', () => {
  it('échéance au 5 du mois suivant, passage d’année compris', () => {
    expect(echeanceReporting('2026-09')).toBe('2026-10-05');
    expect(moisSuivant('2026-12')).toBe('2027-01');
    expect(echeanceReporting('2026-12')).toBe('2027-01-05');
  });

  it('seuls les mois clos depuis le début du HUB sont à reporter', () => {
    expect(moisAReporter('2026-09-30')).toEqual([]);
    expect(moisAReporter('2026-10-05')).toEqual(['2026-09']);
    expect(moisAReporter('2026-12-01')).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('statut : à déposer jusqu’à l’échéance, en retard ensuite ; dépôt à l’heure ou en retard', () => {
    expect(statutReporting('2026-09', null, '2026-10-05')).toBe('a_deposer');
    expect(statutReporting('2026-09', null, '2026-10-06')).toBe('en_retard');
    expect(statutReporting('2026-09', '2026-10-04', '2026-10-20')).toBe('depose');
    expect(statutReporting('2026-09', '2026-10-07', '2026-10-20')).toBe('depose_en_retard');
  });
});

describe('registre des décisions', () => {
  it('numéro D-NNN', () => {
    expect(numeroDecision(6)).toBe('D-006');
    expect(numeroDecision(1234)).toBe('D-1234');
  });

  it('ouverte, échéance dépassée, close', () => {
    expect(statutDecision({ echeance: null, closeLe: null }, '2026-10-05')).toBe('ouverte');
    expect(statutDecision({ echeance: '2026-10-05', closeLe: null }, '2026-10-05')).toBe('ouverte');
    expect(statutDecision({ echeance: '2026-09-22', closeLe: null }, '2026-10-05')).toBe('echeance_depassee');
    expect(statutDecision({ echeance: '2026-09-22', closeLe: '2026-10-01' }, '2026-10-05')).toBe('close');
  });
});

describe('évaluation des indicateurs', () => {
  it('objectif fixé : minimum, maximum, zone', () => {
    expect(evaluer(2, { type: 'minimum', valeur: 4 }).evaluation).toBe('hors_objectif');
    expect(evaluer(4, { type: 'minimum', valeur: 4 }).evaluation).toBe('dans_objectif');
    expect(evaluer(12, { type: 'maximum', valeur: 10 }).evaluation).toBe('hors_objectif');
    expect(evaluer(85, { type: 'zone', de: 70, a: 100 }).evaluation).toBe('dans_objectif');
    expect(evaluer(67, { type: 'zone', de: 70, a: 100 }).evaluation).toBe('hors_objectif');
  });

  it('objectif à fixer : jamais « hors objectif », la proposition ne colore que si atteinte', () => {
    expect(evaluer(94, { type: 'minimum', valeur: null, propose: 90 })).toEqual({ evaluation: 'a_fixer', atteintPropose: true });
    expect(evaluer(67, { type: 'zone', de: null, a: null, propose: { de: 70, a: 100 } })).toEqual({ evaluation: 'a_fixer', atteintPropose: false });
    expect(evaluer(1, { type: 'maximum', valeur: null })).toEqual({ evaluation: 'a_fixer', atteintPropose: false });
  });

  it('sans donnée', () => {
    expect(evaluer(null, { type: 'minimum', valeur: 50 }).evaluation).toBe('sans_donnee');
  });
});

// Revue Dir. GC (21/10/2026, lot 3) : rappel avant le 5, relances en retard.
describe('rappels d’un reporting', () => {
  const cles = (jour: string, depose = false) => rappelsReporting('2026-09', depose, jour, 3).map((r) => `${r.cible}:${r.cle}`);

  it('rien avant la fenêtre de rappel ni une fois déposé', () => {
    expect(cles('2026-10-01')).toEqual([]);
    expect(cles('2026-10-20', true)).toEqual([]);
  });

  it('rappel à l’émetteur 3 jours avant le 5, une seule clé jusqu’à l’échéance', () => {
    expect(cles('2026-10-02')).toEqual(['emetteur:avant']);
    expect(cles('2026-10-05')).toEqual(['emetteur:avant']);
  });

  it('en retard : l’émetteur relancé chaque semaine, le destinataire prévenu une fois', () => {
    expect(cles('2026-10-06')).toEqual(['emetteur:retard:0', 'destinataire:retard-destinataire']);
    expect(cles('2026-10-12')).toEqual(['emetteur:retard:0', 'destinataire:retard-destinataire']);
    expect(cles('2026-10-13')).toEqual(['emetteur:retard:1', 'destinataire:retard-destinataire']);
    expect(cles('2026-10-21')).toEqual(['emetteur:retard:2', 'destinataire:retard-destinataire']);
  });
});
