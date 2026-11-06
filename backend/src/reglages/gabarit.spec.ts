import { appliquer, appliquerLignes, type ContenuGabarit, decrire, ErreurGabarit, libelleVersion } from './gabarit';
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
    expect(essai([{ carte: 'documents_client', tache: 'ninea', champ: 'heures', valeur: 2 }])).toThrow(
      'pas de temps standard',
    );
    expect(essai([{ carte: 'releves_existants', champ: 'debut', valeur: 2 }])).toThrow('pas de fenêtre');
    expect(essai([{ carte: 'livrables', tache: 'esquisses', champ: 'heures', valeur: 1.25 }])).toThrow(
      'temps invalide',
    );
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
    expect(normaliser(def('jours_feries'), ['2026-12-25', '2026-04-04', '2026-12-25'])).toEqual([
      '2026-04-04',
      '2026-12-25',
    ]);
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

// Visa DPLG (revue Dir. GC, 21/10/2026) : réglé par tâche dans le gabarit.
describe('gabarit · visa DPLG', () => {
  const visees = GABARIT_GC_CONCEPTION.etapes.flatMap((e) =>
    e.cartes.flatMap((c) => c.taches.filter((t) => t.visaDplg).map((t) => `${c.cle}.${t.cle}`)),
  );

  it('par défaut : plans du permis, plans d’exécution, intégration et livraison', () => {
    expect(visees).toEqual([
      'permis_construire.plans_autorisation',
      'pe_architecture.pe_architecture',
      'tache_finale.integration_livraison',
    ]);
  });

  it('se coche et se décoche par tâche, jamais sur une carte ; décrit au journal', () => {
    const { contenu, appliques } = appliquer(GABARIT_GC_CONCEPTION, [
      { carte: 'permis_construire', tache: 'fiches_techniques', champ: 'visa', valeur: 1 },
    ]);
    expect(
      contenu.etapes
        .flatMap((e) => e.cartes)
        .find((c) => c.cle === 'permis_construire')!
        .taches.find((t) => t.cle === 'fiches_techniques')!.visaDplg,
    ).toBe(true);
    expect(decrire(appliques[0])).toBe('Permis de construire · Fiches techniques — visa DPLG : non → oui');
    expect(() => appliquer(GABARIT_GC_CONCEPTION, [{ carte: 'permis_construire', champ: 'visa', valeur: 1 }])).toThrow(
      ErreurGabarit,
    );
    expect(() =>
      appliquer(GABARIT_GC_CONCEPTION, [{ carte: 'permis_construire', tache: 'depot', champ: 'visa', valeur: 2 }]),
    ).toThrow(ErreurGabarit);
    // Déjà coché : rien à appliquer.
    expect(
      appliquer(GABARIT_GC_CONCEPTION, [
        { carte: 'pe_architecture', tache: 'pe_architecture', champ: 'visa', valeur: 1 },
      ]).appliques,
    ).toEqual([]);
  });
});

// Lignes ajoutées ou retirées (Réglages CIO, 01/11/2026).
describe('appliquerLignes', () => {
  const g = () => structuredClone(GABARIT_GC_CONCEPTION);
  const carte = (c: ContenuGabarit, cle: string) => c.etapes.flatMap((e) => e.cartes).find((x) => x.cle === cle)!;

  it('ajoute une ligne en fin de carte, avec fenêtre, temps, visa et fichier facultatif ; sans toucher l’original', () => {
    const avant = g();
    const { contenu, appliques } = appliquerLignes(
      avant,
      [
        {
          carte: 'documents_client',
          libelle: 'Attestation de propriété',
          debut: 2,
          fin: 4,
          heures: 1.5,
          visaDplg: true,
          fichierObligatoire: false,
        },
      ],
      [],
    );
    const t = carte(contenu, 'documents_client').taches.at(-1)!;
    expect(t).toEqual({
      cle: 'l_attestation_de_propriete',
      libelle: 'Attestation de propriété',
      fenetre: { debut: 2, fin: 4 },
      temps: { type: 'heures', heures: 1.5 },
      visaDplg: true,
      fichierFacultatif: true,
    });
    expect(carte(avant, 'documents_client').taches.at(-1)!.cle).toBe('expertise');
    expect(appliques[0].libelle).toBe(
      'Documents du client · Attestation de propriété — ligne ajoutée (J2 → J4, 1.5 h, visa DPLG, fichier facultatif)',
    );
  });

  it('sans heures : sans temps atelier ; carte au temps « par unité » ou « au total » : part de la carte', () => {
    const c = g();
    const parUnite = c.etapes
      .flatMap((e) => e.cartes)
      .find((x) => x.temps?.type === 'par_unite' || x.temps?.type === 'total')!;
    const { contenu } = appliquerLignes(
      c,
      [
        { carte: 'documents_client', libelle: 'Quitus fiscal' },
        { carte: parUnite.cle, libelle: 'Ligne en plus', heures: 4 },
      ],
      [],
    );
    expect(carte(contenu, 'documents_client').taches.at(-1)!.temps).toEqual({ type: 'sans' });
    expect(carte(contenu, parUnite.cle).taches.at(-1)!.temps).toEqual({ type: 'part_carte' });
  });

  it('retire une ligne ; refuse la dernière d’une carte et celle qui ouvre une autre carte', () => {
    const { contenu } = appliquerLignes(g(), [], [{ carte: 'documents_client', tache: 'ninea' }]);
    expect(carte(contenu, 'documents_client').taches.some((t) => t.cle === 'ninea')).toBe(false);
    expect(() => appliquerLignes(g(), [], [{ carte: 'livrables', tache: 'details_facade' }])).toThrow(
      /conditionne l’ouverture de la carte/,
    );
    const une = g();
    carte(une, 'documents_client').taches = carte(une, 'documents_client').taches.slice(0, 1);
    expect(() => appliquerLignes(une, [], [{ carte: 'documents_client', tache: 'piece_identite' }])).toThrow(
      'une carte garde au moins une ligne',
    );
  });

  it('refuse un doublon, une fenêtre incohérente, une carte sans lignes', () => {
    expect(() => appliquerLignes(g(), [{ carte: 'documents_client', libelle: 'ninea' }], [])).toThrow('existe déjà');
    expect(() => appliquerLignes(g(), [{ carte: 'documents_client', libelle: 'Plan', debut: 5, fin: 2 }], [])).toThrow(
      'fenêtre invalide',
    );
    const fichiers = g()
      .etapes.flatMap((e) => e.cartes)
      .find((x) => x.fichiers);
    if (fichiers) {
      expect(() => appliquerLignes(g(), [{ carte: fichiers.cle, libelle: 'Une ligne' }], [])).toThrow(
        'ne porte pas de lignes',
      );
    }
  });
});
