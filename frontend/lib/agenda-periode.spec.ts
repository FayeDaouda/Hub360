// @vitest-environment jsdom
// (toucheIgnoree lit la cible de la touche et le document)
import { afterEach, describe, expect, it } from 'vitest';
import {
  actionClavier,
  decaler,
  enGrille,
  intervalle,
  lundi,
  periode,
  periodeLue,
  titrePeriode,
  toucheIgnoree,
  VUES,
  VUES_TELEPHONE,
  type Vue,
} from './agenda-periode';

// Périodes de l'Agenda (18/11/2026).
describe('agenda-periode', () => {
  it('lundi : le lundi de la semaine, dimanche compris', () => {
    expect(lundi('2026-11-18')).toBe('2026-11-16');
    expect(lundi('2026-11-22')).toBe('2026-11-16');
    expect(lundi('2026-11-16')).toBe('2026-11-16');
  });

  it('période de chaque vue', () => {
    expect(periode('jour', '2026-11-18')).toEqual({ du: '2026-11-18', au: '2026-11-18' });
    expect(periode('3jours', '2026-11-18')).toEqual({ du: '2026-11-18', au: '2026-11-20' });
    expect(periode('semaine', '2026-11-18')).toEqual({ du: '2026-11-16', au: '2026-11-22' });
    // Mois : 6 semaines, du lundi précédant le 1er.
    expect(periode('mois', '2026-11-18')).toEqual({ du: '2026-10-26', au: '2026-12-06' });
    expect(periode('annee', '2026-11-18')).toEqual({ du: '2026-01-01', au: '2026-12-31' });
    // Mois et jour (téléphone) : la grille du mois entier.
    expect(periode('moisjour', '2026-11-18')).toEqual({ du: '2026-10-26', au: '2026-12-06' });
    expect(periode('planning', '2026-11-18')).toEqual({ du: '2026-11-18', au: '2026-12-17' });
  });

  it('les flèches avancent d’une période entière', () => {
    expect(decaler('jour', '2026-11-18', 1)).toBe('2026-11-19');
    expect(decaler('3jours', '2026-11-18', 1)).toBe('2026-11-21');
    expect(decaler('3jours', '2026-11-18', -1)).toBe('2026-11-15');
    expect(decaler('semaine', '2026-11-18', -1)).toBe('2026-11-11');
    expect(decaler('mois', '2026-11-18', 1)).toBe('2026-12-18');
    expect(decaler('moisjour', '2026-11-18', -1)).toBe('2026-10-18');
    expect(decaler('annee', '2026-11-18', 1)).toBe('2027-11-18');
    expect(decaler('planning', '2026-11-18', 1)).toBe('2026-12-18');
  });

  it('grille horaire : jour, 3 jours, semaine', () => {
    expect(
      ['jour', '3jours', 'semaine', 'mois', 'annee', 'planning', 'moisjour'].map((v) => enGrille(v as never)),
    ).toEqual([true, true, true, false, false, false, false]);
  });

  it('intervalle façon Google : même mois, deux mois, deux années', () => {
    expect(intervalle('2026-11-16', '2026-11-22')).toBe('16 – 22 novembre 2026');
    expect(intervalle('2026-11-30', '2026-12-06')).toBe('30 novembre – 6 décembre 2026');
    expect(intervalle('2026-12-28', '2027-01-03')).toBe('28 déc. 2026 – 3 janv. 2027');
    expect(intervalle('2026-11-18', '2026-11-18')).toBe('Mercredi 18 novembre 2026');
  });

  it('titre : complet sur ordinateur, le mois seulement sur téléphone', () => {
    expect(titrePeriode('semaine', '2026-11-18')).toBe('16 – 22 novembre 2026');
    expect(titrePeriode('jour', '2026-11-18')).toBe('Mercredi 18 novembre 2026');
    expect(titrePeriode('mois', '2026-11-18')).toBe('Novembre 2026');
    expect(titrePeriode('annee', '2026-11-18')).toBe('2026');
    expect(titrePeriode('3jours', '2026-11-18', true)).toBe('Novembre 2026');
    expect(titrePeriode('moisjour', '2026-11-18', true)).toBe('Novembre 2026');
    // Semaine à cheval : le mois de son jeudi.
    expect(titrePeriode('semaine', '2026-12-01', true)).toBe('Décembre 2026');
    expect(titrePeriode('semaine', '2026-11-30', true)).toBe('Décembre 2026');
    expect(titrePeriode('semaine', '2026-10-28', true)).toBe('Octobre 2026');
  });
});

// Raccourcis clavier et annonce de la période (U5, 23/11/2026).
describe('agenda-periode · clavier (U5)', () => {
  const TOUTES = VUES.map((v) => v.cle);
  const ORDINATEUR = TOUTES.filter((v) => !VUES_TELEPHONE.includes(v));
  const touche = (key: string, x: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...x,
  });

  describe('actionClavier', () => {
    it('J, S, M, A, P choisissent la vue, en minuscule comme en majuscule', () => {
      const attendu: [string, Vue][] = [
        ['j', 'jour'],
        ['s', 'semaine'],
        ['m', 'mois'],
        ['a', 'annee'],
        ['p', 'planning'],
      ];
      for (const [lettre, vue] of attendu) {
        expect(actionClavier(touche(lettre), ORDINATEUR)).toEqual({ type: 'vue', vue });
        expect(actionClavier(touche(lettre.toUpperCase()), ORDINATEUR)).toEqual({ type: 'vue', vue });
      }
    });

    it('O et X (vues du téléphone) ne font rien quand elles ne sont pas proposées', () => {
      expect(actionClavier(touche('o'), ORDINATEUR)).toBeNull();
      expect(actionClavier(touche('X'), ORDINATEUR)).toBeNull();
    });

    it('O et X choisissent « Mois et jour » et « 3 jours » quand elles sont proposées (téléphone)', () => {
      expect(actionClavier(touche('o'), TOUTES)).toEqual({ type: 'vue', vue: 'moisjour' });
      expect(actionClavier(touche('x'), TOUTES)).toEqual({ type: 'vue', vue: '3jours' });
    });

    it('une lettre de vue absente des vues proposées ne fait rien', () => {
      expect(actionClavier(touche('m'), ['semaine', 'jour'])).toBeNull();
      expect(actionClavier(touche('s'), [])).toBeNull();
    });

    it('T revient à aujourd’hui, C crée, en minuscule comme en majuscule', () => {
      expect(actionClavier(touche('t'), ORDINATEUR)).toEqual({ type: 'aujourdhui' });
      expect(actionClavier(touche('T'), ORDINATEUR)).toEqual({ type: 'aujourdhui' });
      expect(actionClavier(touche('c'), ORDINATEUR)).toEqual({ type: 'creer' });
      expect(actionClavier(touche('C'), [])).toEqual({ type: 'creer' });
    });

    it('← recule et → avance d’une période', () => {
      expect(actionClavier(touche('ArrowLeft'), ORDINATEUR)).toEqual({ type: 'decaler', sens: -1 });
      expect(actionClavier(touche('ArrowRight'), ORDINATEUR)).toEqual({ type: 'decaler', sens: 1 });
    });

    it('rien avec Ctrl, ⌘ ou Alt (raccourcis du navigateur)', () => {
      for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
        expect(actionClavier(touche('s', mod), ORDINATEUR)).toBeNull();
        expect(actionClavier(touche('T', mod), ORDINATEUR)).toBeNull();
        expect(actionClavier(touche('c', mod), ORDINATEUR)).toBeNull();
        expect(actionClavier(touche('ArrowRight', mod), ORDINATEUR)).toBeNull();
      }
    });

    it('rien pour une autre touche (lettre sans raccourci, Entrée, flèches verticales, espace)', () => {
      for (const key of ['z', 'B', 'Enter', 'ArrowUp', 'ArrowDown', ' ', 'Escape', 'Tab', '1']) {
        expect(actionClavier(touche(key), TOUTES)).toBeNull();
      }
    });
  });

  describe('toucheIgnoree', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });
    const poser = (html: string) => {
      document.body.innerHTML = html;
      return document.getElementById('cible')!;
    };

    it('faux pour le corps de la page sans fenêtre ouverte', () => {
      expect(toucheIgnoree(document.body)).toBe(false);
      expect(toucheIgnoree(poser('<button id="cible">Semaine suivante</button>'))).toBe(false);
    });

    it('faux pour une cible absente ou qui n’est pas un élément', () => {
      expect(toucheIgnoree(null)).toBe(false);
      expect(toucheIgnoree(window)).toBe(false);
    });

    it('vrai dans un champ : input, textarea, select, contenteditable', () => {
      expect(toucheIgnoree(poser('<input id="cible" />'))).toBe(true);
      expect(toucheIgnoree(poser('<textarea id="cible"></textarea>'))).toBe(true);
      expect(toucheIgnoree(poser('<select id="cible"><option>a</option></select>'))).toBe(true);
      expect(toucheIgnoree(poser('<div contenteditable="true"><p id="cible">texte</p></div>'))).toBe(true);
    });

    it('vrai dans un menu ou une fenêtre ; dans un groupe de choix ou sur une case, les flèches seulement', () => {
      const vue = poser('<div role="radiogroup"><button id="cible" role="radio">Mois</button></div>');
      expect(toucheIgnoree(vue, 'ArrowRight')).toBe(true);
      expect(toucheIgnoree(vue, 's')).toBe(false);
      const caseACocher = poser('<input id="cible" type="checkbox" />');
      expect(toucheIgnoree(caseACocher, 'ArrowLeft')).toBe(true);
      expect(toucheIgnoree(caseACocher, 'm')).toBe(false);
      expect(toucheIgnoree(poser('<div role="menu"><button id="cible" role="menuitem">Jour</button></div>'))).toBe(
        true,
      );
      expect(toucheIgnoree(poser('<div role="dialog"><button id="cible">Fermer</button></div>'))).toBe(true);
    });

    it('un panneau non modal ouvert (chat) ne coupe pas les raccourcis de la page', () => {
      const cible = poser('<button id="cible">Aujourd’hui</button><div role="dialog" aria-modal="false"></div>');
      expect(toucheIgnoree(cible, 's')).toBe(false);
    });

    it('vrai dès qu’une fenêtre modale est ouverte, même si la touche vient d’ailleurs', () => {
      const cible = poser('<button id="cible">Aujourd’hui</button><div aria-modal="true"></div>');
      expect(toucheIgnoree(cible)).toBe(true);
      expect(toucheIgnoree(document.body)).toBe(true);
    });
  });

  describe('periodeLue', () => {
    // Lundi 23 novembre 2026.
    const L = '2026-11-23';

    it('Jour et « Mois et jour » : la vue puis la journée entière', () => {
      expect(periodeLue('jour', L)).toBe('Jour, lundi 23 novembre 2026');
      expect(periodeLue('moisjour', L)).toBe('Mois et jour, lundi 23 novembre 2026');
    });

    it('Semaine, 3 jours, Planning : la vue puis l’intervalle', () => {
      expect(periodeLue('semaine', L)).toBe('Semaine, 23 – 29 novembre 2026');
      expect(periodeLue('3jours', L)).toBe('3 jours, 23 – 25 novembre 2026');
      expect(periodeLue('planning', L)).toBe('Planning, 23 novembre – 22 décembre 2026');
    });

    it('Mois et Année : la vue puis le mois ou l’année', () => {
      expect(periodeLue('mois', L)).toBe('Mois, Novembre 2026');
      expect(periodeLue('annee', L)).toBe('Année, 2026');
    });

    it('la semaine entière même quand le titre court ne montrerait que le mois', () => {
      expect(periodeLue('semaine', '2026-12-01')).toBe('Semaine, 30 novembre – 6 décembre 2026');
    });
  });
});
