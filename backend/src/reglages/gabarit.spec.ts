import { appliquer, decrire, ErreurGabarit, libelleVersion } from './gabarit';
import { GABARIT_GC_CONCEPTION } from './gabarit-gc-conception';
import { normaliser, OBJECTIFS, REGLES } from './definitions';

const def = (cle: string) => [...REGLES, ...OBJECTIFS].find((d) => d.cle === cle)!;

describe('gabarit GC-CONCEPTION bêta 1.0 (transcription)', () => {
  const cartes = GABARIT_GC_CONCEPTION.etapes.flatMap((e) => e.cartes);
  it('6 étapes numérotées, clés de carte uniques, clés de tâche uniques par carte', () => {
    expect(GABARIT_GC_CONCEPTION.etapes.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(cartes.map((c) => c.cle)).size).toBe(cartes.length);
    for (const c of cartes) expect(new Set(c.taches.map((t) => t.cle)).size).toBe(c.taches.length);
  });
  it('fenêtres cohérentes et dans l’horizon J1 → J40 (budget atelier 320 h = 40 jours)', () => {
    for (const x of cartes.flatMap((c) => [c, ...c.taches])) {
      if (x.fenetre) expect(x.fenetre.debut <= x.fenetre.fin && x.fenetre.debut >= 1 && x.fenetre.fin <= 40).toBe(true);
    }
  });
});

describe('appliquer', () => {
  it('modifie une copie, ne garde que les changements effectifs', () => {
    const { contenu, appliques } = appliquer(GABARIT_GC_CONCEPTION, [
      { carte: 'livrables', tache: 'esquisses', champ: 'heures', valeur: 32 },
      { carte: 'livrables', champ: 'fin', valeur: 15 }, // inchangé
    ]);
    expect(appliques).toHaveLength(1);
    expect(decrire(appliques[0])).toBe('Livrables · Esquisses — temps : 40 h → 32 h');
    const esquisses = contenu.etapes[1].cartes[1].taches[0];
    expect(esquisses.temps).toEqual({ type: 'heures', heures: 32 });
    expect(GABARIT_GC_CONCEPTION.etapes[1].cartes[1].taches[0].temps).toEqual({ type: 'heures', heures: 40 });
  });
  it('temps par unité et fenêtre de carte modifiables, décimale acceptée', () => {
    const { appliques } = appliquer(GABARIT_GC_CONCEPTION, [
      { carte: 'interieurs', champ: 'heures', valeur: 6.5 },
      { carte: 'interieurs', champ: 'debut', valeur: 17 },
    ]);
    expect(appliques.map(decrire)).toEqual(['Intérieurs — temps : 8 h → 6.5 h', 'Intérieurs — début : J16 → J17']);
  });
  it('refuse champ absent, valeur invalide, fenêtre inversée', () => {
    const essai = (ch: Parameters<typeof appliquer>[1]) => () => appliquer(GABARIT_GC_CONCEPTION, ch);
    expect(essai([{ carte: 'inconnue', champ: 'fin', valeur: 3 }])).toThrow(ErreurGabarit);
    expect(essai([{ carte: 'documents_client', tache: 'ninea', champ: 'heures', valeur: 2 }])).toThrow('pas de temps standard');
    expect(essai([{ carte: 'releves_existants', champ: 'debut', valeur: 2 }])).toThrow('pas de fenêtre');
    expect(essai([{ carte: 'livrables', tache: 'esquisses', champ: 'heures', valeur: 1.25 }])).toThrow('temps invalide');
    expect(essai([{ carte: 'livrables', champ: 'debut', valeur: 16 }])).toThrow('commence après sa fin');
  });
  it('libellé de version', () => {
    expect([0, 1, 12].map(libelleVersion)).toEqual(['bêta 1.0', 'bêta 1.1', 'bêta 1.12']);
  });
});

describe('normaliser', () => {
  it('parts F1/F2/F3 : somme 100', () => {
    expect(normaliser(def('parts_factures'), { F1: 30, F2: 50, F3: 20 })).toEqual({ F1: 30, F2: 50, F3: 20 });
    expect(() => normaliser(def('parts_factures'), { F1: 40, F2: 40, F3: 10 })).toThrow('100 %');
  });
  it('jours fériés : dates valides, dédoublonnées et triées', () => {
    expect(normaliser(def('jours_feries'), ['2026-12-25', '2026-04-04', '2026-12-25'])).toEqual(['2026-04-04', '2026-12-25']);
    expect(() => normaliser(def('jours_feries'), ['25/12/2026'])).toThrow('AAAA-MM-JJ');
  });
  it('objectifs : vide = à fixer, zone ordonnée', () => {
    expect(normaliser(def('objectif_taches_a_temps'), null)).toBeNull();
    expect(normaliser(def('objectif_charge_equipes'), { de: 70, a: 100 })).toEqual({ de: 70, a: 100 });
    expect(() => normaliser(def('objectif_charge_equipes'), { de: 100, a: 70 })).toThrow('zone');
    expect(() => normaliser(def('objectif_conversion_chantier'), 120)).toThrow('pourcentage');
  });
  it('choix et entier bornés', () => {
    expect(() => normaliser(def('pilote_etudes'), 'stagiaire')).toThrow('choix inconnu');
    expect(() => normaliser(def('delai_levee_reserves_jours'), 0)).toThrow('entier');
  });
});
