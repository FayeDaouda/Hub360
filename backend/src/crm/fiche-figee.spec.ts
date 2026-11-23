import {
  FENETRE_TRACE_MS,
  MESSAGE_PRIX_FIGE,
  PREFIXE_TRACE,
  champsLibresModifies,
  champsPrixModifies,
  commentaireTrace,
  fusionnerTrace,
  messagePrixFige,
  traceARegrouper,
} from './fiche-figee';

// Fiche modifiée après la soumission au CFO (09/11/2026) : les champs du prix
// restent figés, les autres changements se tracent (une ligne regroupée par
// auteur dans une fenêtre de 30 min).

const PRIX = { categorie: 'conception', surfaceTerrain: 400, nbPlanches: 3 };

describe('champsPrixModifies', () => {
  it('rien demandé (undefined partout) → aucun champ', () => {
    expect(champsPrixModifies(PRIX, {})).toEqual([]);
  });

  it('mêmes valeurs renvoyées par l’écran → pas un changement', () => {
    expect(champsPrixModifies(PRIX, { ...PRIX })).toEqual([]);
  });

  it('chaque champ du prix changé est nommé, dans l’ordre catégorie, surface, planches', () => {
    expect(champsPrixModifies(PRIX, { categorie: 'suivi', surfaceTerrain: 401, nbPlanches: 4 })).toEqual([
      'Catégorie',
      'Surface du terrain',
      'Nombre de planches',
    ]);
  });

  it('planches seules changées → seul « Nombre de planches »', () => {
    expect(champsPrixModifies(PRIX, { nbPlanches: 2 })).toEqual(['Nombre de planches']);
  });

  it('catégorie vide (null) alors qu’elle était renseignée → changement', () => {
    expect(champsPrixModifies(PRIX, { categorie: null })).toEqual(['Catégorie']);
  });

  it('catégorie déjà vide renvoyée vide → pas un changement', () => {
    expect(champsPrixModifies({ ...PRIX, categorie: null }, { categorie: null })).toEqual([]);
  });

  it('surface ramenée à 0 → changement (0 n’est pas « non demandé »)', () => {
    expect(champsPrixModifies(PRIX, { surfaceTerrain: 0 })).toEqual(['Surface du terrain']);
  });
});

describe('messagePrixFige', () => {
  it('nomme les champs puis renvoie vers « Refaire une offre » ou un renvoi du CFO', () => {
    expect(messagePrixFige(['Catégorie', 'Nombre de planches'])).toBe(
      `Catégorie, Nombre de planches : ${MESSAGE_PRIX_FIGE}`,
    );
    expect(MESSAGE_PRIX_FIGE).toContain('Refaire une offre');
  });
});

describe('champsLibresModifies', () => {
  const FICHE = {
    typeProjet: 'residentiel',
    usage: 'maisons_individuelles',
    forme: 'villa',
    gabarit: 1,
    annexes: ['bureau'],
  };
  const LIBRES = { standing: 'haut', gamme: 'premium', ficheProgramme: FICHE };

  it('rien demandé → aucun champ', () => {
    expect(champsLibresModifies(LIBRES, {})).toEqual([]);
  });

  it('fiche Programme identique avec les clés dans un autre ordre → pas un changement', () => {
    const reordonnee = {
      annexes: ['bureau'],
      gabarit: 1,
      forme: 'villa',
      typeProjet: 'residentiel',
      usage: 'maisons_individuelles',
    };
    expect(champsLibresModifies(LIBRES, { ficheProgramme: reordonnee })).toEqual([]);
  });

  it('clés imbriquées (composition) dans un autre ordre → pas un changement', () => {
    const actuel = { ...LIBRES, ficheProgramme: { composition: [{ de: 0, a: 1, usage: 'logements', nb: 2 }] } };
    const demande = { ficheProgramme: { composition: [{ nb: 2, usage: 'logements', a: 1, de: 0 }] } };
    expect(champsLibresModifies(actuel, demande)).toEqual([]);
  });

  it('ordre des éléments d’une liste différent → changement (l’ordre d’une liste compte)', () => {
    const actuel = { ...LIBRES, ficheProgramme: { annexes: ['bureau', 'buanderie'] } };
    expect(champsLibresModifies(actuel, { ficheProgramme: { annexes: ['buanderie', 'bureau'] } })).toEqual([
      'fiche Programme',
    ]);
  });

  it('valeur de la fiche Programme changée → « fiche Programme »', () => {
    expect(champsLibresModifies(LIBRES, { ficheProgramme: { ...FICHE, gabarit: 2 } })).toEqual(['fiche Programme']);
  });

  it('première fiche Programme sur un dossier qui n’en avait pas (null) → changement', () => {
    expect(champsLibresModifies({ ...LIBRES, ficheProgramme: null }, { ficheProgramme: FICHE })).toEqual([
      'fiche Programme',
    ]);
  });

  it('standing et gamme changés → nommés après la fiche Programme', () => {
    expect(
      champsLibresModifies(LIBRES, { ficheProgramme: { ...FICHE, gabarit: 3 }, standing: 'moyen', gamme: 'eco' }),
    ).toEqual(['fiche Programme', 'standing', 'gamme']);
  });

  it('standing et gamme renvoyés identiques → aucun champ', () => {
    expect(champsLibresModifies(LIBRES, { standing: 'haut', gamme: 'premium' })).toEqual([]);
  });

  it('standing effacé (null) → changement', () => {
    expect(champsLibresModifies(LIBRES, { standing: null })).toEqual(['standing']);
  });
});

describe('commentaireTrace', () => {
  it('préfixe puis champs séparés par une virgule', () => {
    expect(commentaireTrace(['standing', 'gamme'])).toBe(`${PREFIXE_TRACE}standing, gamme`);
    expect(PREFIXE_TRACE).toBe('Fiche modifiée après soumission : ');
  });
});

describe('traceARegrouper', () => {
  const MAINTENANT = new Date('2026-11-09T10:00:00Z');
  const ligne = (o: Partial<{ parId: string | null; commentaire: string | null; creeLe: Date }> = {}) => ({
    parId: 'U1',
    commentaire: `${PREFIXE_TRACE}standing`,
    creeLe: new Date(MAINTENANT.getTime() - 5 * 60 * 1000),
    ...o,
  });

  it('même auteur, trace de fiche figée, il y a 5 min → regroupée', () => {
    expect(traceARegrouper(ligne(), 'U1', MAINTENANT)).toBe(true);
  });

  it('aucune ligne d’historique → nouvelle ligne', () => {
    expect(traceARegrouper(null, 'U1', MAINTENANT)).toBe(false);
  });

  it('autre auteur → nouvelle ligne', () => {
    expect(traceARegrouper(ligne({ parId: 'U2' }), 'U1', MAINTENANT)).toBe(false);
  });

  it('auteur inconnu (null) → nouvelle ligne', () => {
    expect(traceARegrouper(ligne({ parId: null }), 'U1', MAINTENANT)).toBe(false);
  });

  it('dernière ligne = une transition du cycle (soumission) → nouvelle ligne', () => {
    expect(traceARegrouper(ligne({ commentaire: 'Soumis au CFO' }), 'U1', MAINTENANT)).toBe(false);
  });

  it('dernière ligne sans commentaire → nouvelle ligne', () => {
    expect(traceARegrouper(ligne({ commentaire: null }), 'U1', MAINTENANT)).toBe(false);
  });

  it('juste avant la fin de la fenêtre (29 min 59 s) → regroupée', () => {
    const creeLe = new Date(MAINTENANT.getTime() - FENETRE_TRACE_MS + 1000);
    expect(traceARegrouper(ligne({ creeLe }), 'U1', MAINTENANT)).toBe(true);
  });

  it('pile 30 min → nouvelle ligne (borne exclue)', () => {
    const creeLe = new Date(MAINTENANT.getTime() - FENETRE_TRACE_MS);
    expect(traceARegrouper(ligne({ creeLe }), 'U1', MAINTENANT)).toBe(false);
    expect(FENETRE_TRACE_MS).toBe(30 * 60 * 1000);
  });
});

describe('fusionnerTrace', () => {
  it('ajoute les nouveaux champs à la suite, sans doublon, dans l’ordre d’arrivée', () => {
    expect(fusionnerTrace(`${PREFIXE_TRACE}standing, fiche Programme`, ['gamme', 'standing'])).toBe(
      `${PREFIXE_TRACE}standing, fiche Programme, gamme`,
    );
  });

  it('mêmes champs qu’avant → commentaire inchangé', () => {
    expect(fusionnerTrace(`${PREFIXE_TRACE}standing`, ['standing'])).toBe(`${PREFIXE_TRACE}standing`);
  });

  it('commentaire réduit au préfixe → seulement les nouveaux champs', () => {
    expect(fusionnerTrace(PREFIXE_TRACE, ['gamme'])).toBe(`${PREFIXE_TRACE}gamme`);
  });
});
