import { describe, expect, it } from 'vitest';
import type { LigneAudit } from '@/lib/pilotage';
import {
  DEFAULT_CRITERIA,
  SYSTEM_AUTHOR,
  authorsOf,
  countByCategory,
  dayTitle,
  filterLines,
  groupByDay,
  hasActiveFilters,
  matchAuthorAndSearch,
  periodRange,
  rangeError,
  readCriteria,
  splitMotif,
  writeCriteria,
  type JournalCriteria,
} from './journal-filters';

// Jour de référence : dimanche 8 novembre 2026 (Dakar = UTC).
const TODAY = '2026-11-08';

// Nombre de jours d'une période, bornes incluses.
const daysIn = (r: { from: string; to: string }) =>
  (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000 + 1;

const criteria = (maj: Partial<JournalCriteria> = {}): JournalCriteria => ({ ...DEFAULT_CRITERIA, ...maj });

let n = 0;
const ligne = (maj: Partial<LigneAudit> = {}): LigneAudit => ({
  id: `L${++n}`,
  le: '2026-11-07T10:00:00.000Z',
  categorie: 'droits',
  action: 'Matrice modifiée',
  detail: 'CFO › Finances',
  par: 'Awa Sarr',
  ...maj,
});

describe('periodRange', () => {
  it('7 jours : du 2 au 8 novembre, aujourd’hui compris', () => {
    const r = periodRange(criteria({ period: '7j' }), TODAY);
    expect(r).toEqual({ from: '2026-11-02', to: TODAY });
    expect(daysIn(r)).toBe(7);
  });

  it('30 jours : du 10 octobre au 8 novembre, comme le serveur sans dates', () => {
    const r = periodRange(criteria({ period: '30j' }), TODAY);
    expect(r).toEqual({ from: '2026-10-10', to: TODAY });
    expect(daysIn(r)).toBe(30);
  });

  it('3 mois : commence le lendemain du même jour trois mois plus tôt', () => {
    expect(periodRange(criteria({ period: '3m' }), TODAY)).toEqual({ from: '2026-08-09', to: TODAY });
  });

  it('3 mois un 31 : part du dernier jour du mois trois mois plus tôt, sans déborder', () => {
    // 31 mai − 3 mois = 28 février (2026 n'est pas bissextile), lendemain = 1er mars.
    expect(periodRange(criteria({ period: '3m' }), '2026-05-31')).toEqual({ from: '2026-03-01', to: '2026-05-31' });
  });

  it('12 mois : 365 jours, toujours sous le plafond de 366 jours du serveur', () => {
    const r = periodRange(criteria({ period: '12m' }), TODAY);
    expect(r).toEqual({ from: '2025-11-09', to: TODAY });
    expect(daysIn(r)).toBeLessThanOrEqual(366);
    expect(rangeError(r.from, r.to)).toBeNull();
  });

  it('12 mois traversant un 29 février : reste lisible', () => {
    const r = periodRange(criteria({ period: '12m' }), '2028-03-15');
    expect(daysIn(r)).toBeLessThanOrEqual(366);
    expect(rangeError(r.from, r.to)).toBeNull();
  });

  it('dates choisies : rend les dates telles quelles, même vides', () => {
    expect(periodRange(criteria({ period: 'perso', from: '2026-01-01', to: '2026-02-01' }), TODAY)).toEqual({
      from: '2026-01-01',
      to: '2026-02-01',
    });
    expect(periodRange(criteria({ period: 'perso' }), TODAY)).toEqual({ from: '', to: '' });
  });

  it('les dates choisies sont ignorées hors période « perso »', () => {
    expect(periodRange(criteria({ period: '7j', from: '2020-01-01', to: '2020-01-02' }), TODAY)).toEqual({
      from: '2026-11-02',
      to: TODAY,
    });
  });
});

describe('rangeError', () => {
  it('refuse une date qui n’existe pas (mois 13, 30 février)', () => {
    expect(rangeError('2026-01-01', '2026-13-01')).toMatch(/n’existe pas/);
    expect(rangeError('2026-02-30', '2026-03-10')).toMatch(/n’existe pas/);
  });

  it('demande les deux dates quand l’une manque', () => {
    expect(rangeError('', '2026-11-08')).toBe('Choisissez une date de début et une date de fin.');
    expect(rangeError('2026-11-01', '')).toBe('Choisissez une date de début et une date de fin.');
    expect(rangeError('', '')).toBe('Choisissez une date de début et une date de fin.');
  });

  it('refuse un début postérieur à la fin', () => {
    expect(rangeError('2026-11-09', '2026-11-08')).toBe('La date de début doit précéder la date de fin.');
  });

  it('accepte un seul jour (début = fin)', () => {
    expect(rangeError('2026-11-08', '2026-11-08')).toBeNull();
  });

  it('accepte exactement 366 jours, bornes incluses', () => {
    expect(rangeError('2025-11-08', '2026-11-08')).toBeNull();
    // Année bissextile : 29/02/2028 → 28/02/2029 = 366 jours.
    expect(rangeError('2028-02-29', '2029-02-28')).toBeNull();
  });

  it('refuse plus d’un an (367 jours)', () => {
    expect(rangeError('2025-11-07', '2026-11-08')).toBe('Un an au plus par consultation : rapprochez les deux dates.');
  });
});

describe('readCriteria', () => {
  it('sans paramètre, rend les critères par défaut (30 jours, tout)', () => {
    expect(readCriteria(new URLSearchParams())).toEqual(DEFAULT_CRITERIA);
  });

  it('lit tous les critères de l’adresse, sauf une recherche (jamais lue dans l’adresse)', () => {
    const p = new URLSearchParams(
      'periode=perso&du=2026-01-01&au=2026-02-01&categorie=finances&par=Awa+Sarr&q=facture',
    );
    expect(readCriteria(p)).toEqual({
      period: 'perso',
      from: '2026-01-01',
      to: '2026-02-01',
      category: 'finances',
      author: 'Awa Sarr',
      search: '',
    });
  });

  it('une période, une catégorie ou une date inconnues reprennent la valeur par défaut', () => {
    const p = new URLSearchParams('periode=10ans&categorie=secrets&du=01/01/2026&au=demain');
    expect(readCriteria(p)).toEqual(DEFAULT_CRITERIA);
  });

  it('ne prend pas une propriété héritée (« toString », « __proto__ ») pour une catégorie', () => {
    expect(readCriteria(new URLSearchParams('categorie=toString&periode=__proto__'))).toEqual(DEFAULT_CRITERIA);
  });
});

describe('writeCriteria', () => {
  it('omet les valeurs par défaut : adresse vide pour les critères par défaut', () => {
    expect(writeCriteria(new URLSearchParams(), DEFAULT_CRITERIA).toString()).toBe('');
  });

  it('garde les autres paramètres de la page (onglet…)', () => {
    const next = writeCriteria(new URLSearchParams('onglet=journal'), criteria({ category: 'paie' }));
    expect(next.get('onglet')).toBe('journal');
    expect(next.get('categorie')).toBe('paie');
  });

  it('retire les critères revenus à leur valeur par défaut', () => {
    const avant = new URLSearchParams('onglet=journal&periode=7j&categorie=paie&par=Awa&q=x');
    expect(writeCriteria(avant, DEFAULT_CRITERIA).toString()).toBe('onglet=journal');
  });

  it('n’écrit du et au que pour la période « perso »', () => {
    const c = criteria({ period: '7j', from: '2026-01-01', to: '2026-02-01' });
    const next = writeCriteria(new URLSearchParams('du=2025-01-01&au=2025-02-01'), c);
    expect(next.get('periode')).toBe('7j');
    expect(next.has('du')).toBe(false);
    expect(next.has('au')).toBe(false);

    const perso = writeCriteria(new URLSearchParams(), { ...c, period: 'perso' });
    expect(perso.get('du')).toBe('2026-01-01');
    expect(perso.get('au')).toBe('2026-02-01');
  });

  it('n’écrit jamais la recherche (texte libre) dans l’adresse', () => {
    expect(writeCriteria(new URLSearchParams(), criteria({ search: 'facture' })).has('q')).toBe(false);
  });

  it('aller-retour : les critères écrits se relisent à l’identique', () => {
    const c: JournalCriteria = {
      period: 'perso',
      from: '2026-03-01',
      to: '2026-04-30',
      category: 'administration',
      author: SYSTEM_AUTHOR,
      search: '',
    };
    expect(readCriteria(writeCriteria(new URLSearchParams('onglet=journal'), c))).toEqual(c);
  });

  it('ne modifie pas les paramètres reçus', () => {
    const p = new URLSearchParams('onglet=journal');
    writeCriteria(p, criteria({ category: 'paie' }));
    expect(p.toString()).toBe('onglet=journal');
  });
});

describe('hasActiveFilters', () => {
  it('la période seule n’est pas un filtre', () => {
    expect(hasActiveFilters(criteria({ period: '7j' }))).toBe(false);
  });

  it('catégorie, auteur ou recherche non vide en sont', () => {
    expect(hasActiveFilters(criteria({ category: 'rh' }))).toBe(true);
    expect(hasActiveFilters(criteria({ author: SYSTEM_AUTHOR }))).toBe(true);
    expect(hasActiveFilters(criteria({ search: 'x' }))).toBe(true);
    expect(hasActiveFilters(criteria({ search: '  ' }))).toBe(false);
  });
});

describe('authorsOf', () => {
  it('trie les auteurs à la française, sans doublon, le HUB en dernier', () => {
    const lignes = [
      ligne({ par: 'Zeyna Ba' }),
      ligne({ par: null }),
      ligne({ par: 'Émile Diop' }),
      ligne({ par: 'Awa Sarr' }),
      ligne({ par: 'Zeyna Ba' }),
      ligne({ par: 'Fatou Ndiaye' }),
    ];
    // « Émile » se range avec les E, pas après Z.
    expect(authorsOf(lignes)).toEqual(['Awa Sarr', 'Émile Diop', 'Fatou Ndiaye', 'Zeyna Ba', SYSTEM_AUTHOR]);
  });

  it('sans trace du HUB, pas d’entrée « le HUB »', () => {
    expect(authorsOf([ligne({ par: 'Awa Sarr' })])).toEqual(['Awa Sarr']);
  });

  it('liste vide pour un journal vide', () => {
    expect(authorsOf([])).toEqual([]);
  });
});

describe('matchAuthorAndSearch et filterLines', () => {
  const reglage = ligne({
    categorie: 'reglages',
    action: 'Réglage modifié',
    detail: 'Délai · motif : audit',
    par: 'Awa Sarr',
  });
  const depart = ligne({ categorie: 'rh', action: 'Dossier archivé', detail: 'Moussa Fall', par: 'Émile Diop' });
  const verrou = ligne({ categorie: 'comptes', action: 'Compte verrouillé', detail: 'trop d’essais', par: null });
  const facture = ligne({ categorie: 'finances', action: 'Facture émise', detail: 'F2026-0001', par: 'Awa Sarr' });
  const toutes = [reglage, depart, verrou, facture];

  it('sans critère, garde toutes les traces', () => {
    expect(filterLines(toutes, DEFAULT_CRITERIA)).toEqual(toutes);
  });

  it('recherche sans tenir compte des accents ni de la casse', () => {
    expect(filterLines(toutes, criteria({ search: 'REGLAGE' }))).toEqual([reglage]);
    expect(filterLines(toutes, criteria({ search: 'émile' }))).toEqual([depart]);
    expect(filterLines(toutes, criteria({ search: 'emile' }))).toEqual([depart]);
  });

  it('recherche aussi dans le libellé de la catégorie (« Départs » pour rh)', () => {
    expect(filterLines(toutes, criteria({ search: 'départs' }))).toEqual([depart]);
  });

  it('recherche dans le détail, motif compris', () => {
    expect(filterLines(toutes, criteria({ search: 'audit' }))).toEqual([reglage]);
  });

  it('recherche « hub » trouve les traces faites par le HUB lui-même', () => {
    expect(filterLines(toutes, criteria({ search: 'hub' }))).toEqual([verrou]);
  });

  it('ignore les espaces autour du texte cherché', () => {
    expect(filterLines(toutes, criteria({ search: '  facture  ' }))).toEqual([facture]);
  });

  it('filtre par auteur, « le HUB » désignant les traces sans auteur', () => {
    expect(filterLines(toutes, criteria({ author: 'Awa Sarr' }))).toEqual([reglage, facture]);
    expect(filterLines(toutes, criteria({ author: SYSTEM_AUTHOR }))).toEqual([verrou]);
  });

  it('filterLines applique en plus la catégorie, matchAuthorAndSearch non', () => {
    const c = criteria({ author: 'Awa Sarr', category: 'finances' });
    expect(matchAuthorAndSearch(toutes, c)).toEqual([reglage, facture]);
    expect(filterLines(toutes, c)).toEqual([facture]);
  });

  it('aucun résultat : liste vide', () => {
    expect(filterLines(toutes, criteria({ search: 'introuvable' }))).toEqual([]);
  });
});

describe('countByCategory', () => {
  it('compte chaque catégorie, zéro pour les absentes', () => {
    const counts = countByCategory([
      ligne({ categorie: 'finances' }),
      ligne({ categorie: 'finances' }),
      ligne({ categorie: 'paie' }),
    ]);
    expect(counts).toEqual({
      comptes: 0,
      droits: 0,
      finances: 2,
      reglages: 0,
      rh: 0,
      paie: 1,
      pilotage: 0,
      administration: 0,
    });
  });

  it('journal vide : toutes les catégories à zéro', () => {
    expect(Object.values(countByCategory([])).every((v) => v === 0)).toBe(true);
  });
});

describe('dayTitle', () => {
  it('aujourd’hui : « Aujourd’hui · dimanche 8 novembre »', () => {
    expect(dayTitle('2026-11-08', TODAY)).toBe('Aujourd’hui · dimanche 8 novembre');
  });

  it('la veille : « Hier · samedi 7 novembre »', () => {
    expect(dayTitle('2026-11-07', TODAY)).toBe('Hier · samedi 7 novembre');
  });

  it('un autre jour de l’année : jour de la semaine en majuscule, sans année', () => {
    expect(dayTitle('2026-11-05', TODAY)).toBe('Jeudi 5 novembre');
  });

  it('une autre année : l’année est ajoutée', () => {
    expect(dayTitle('2025-12-31', TODAY)).toBe('Mercredi 31 décembre 2025');
  });

  it('« Hier » le 1er janvier pointe le 31 décembre de l’année précédente', () => {
    expect(dayTitle('2026-12-31', '2027-01-01')).toBe('Hier · jeudi 31 décembre');
  });
});

describe('groupByDay', () => {
  it('regroupe les traces par jour dans l’ordre reçu, avec leur titre', () => {
    const a = ligne({ le: '2026-11-08T09:00:00.000Z' });
    const b = ligne({ le: '2026-11-07T18:00:00.000Z' });
    const c = ligne({ le: '2026-11-07T08:00:00.000Z' });
    const d = ligne({ le: '2026-11-05T08:00:00.000Z' });
    expect(groupByDay([a, b, c, d], TODAY)).toEqual([
      { day: '2026-11-08', title: 'Aujourd’hui · dimanche 8 novembre', lines: [a] },
      { day: '2026-11-07', title: 'Hier · samedi 7 novembre', lines: [b, c] },
      { day: '2026-11-05', title: 'Jeudi 5 novembre', lines: [d] },
    ]);
  });

  it('heure de Dakar (UTC) : une trace à 23h30 UTC reste le jour même, quel que soit le fuseau de l’appareil', () => {
    // Les tests tournent en Pacific/Kiritimati (UTC+14) : là-bas, ce serait déjà le lendemain.
    const tard = ligne({ le: '2026-11-07T23:30:00.000Z' });
    const tot = ligne({ le: '2026-11-07T00:30:00.000Z' });
    const jours = groupByDay([tard, tot], TODAY);
    expect(jours).toHaveLength(1);
    expect(jours[0].day).toBe('2026-11-07');
    expect(jours[0].lines).toEqual([tard, tot]);
  });

  it('minuit pile à Dakar ouvre un nouveau jour', () => {
    const jours = groupByDay(
      [ligne({ le: '2026-11-08T00:00:00.000Z' }), ligne({ le: '2026-11-07T23:59:59.999Z' })],
      TODAY,
    );
    expect(jours.map((j) => j.day)).toEqual(['2026-11-08', '2026-11-07']);
  });

  it('journal vide : aucun jour', () => {
    expect(groupByDay([], TODAY)).toEqual([]);
  });
});

// Formats réels du serveur : backend/src/audit/journal-audit.service.ts.
describe('splitMotif', () => {
  it('intervention complète « cible · détail · motif : … »', () => {
    expect(splitMotif('crm · CRM désactivé · motif : audit interne')).toEqual({
      detail: 'crm · CRM désactivé',
      motif: 'audit interne',
    });
  });

  it('intervention sans cible ni détail : « motif : … » seul', () => {
    expect(splitMotif('motif : maintenance planifiée')).toEqual({ detail: '', motif: 'maintenance planifiée' });
  });

  it('clôture de mois avec motif : « Mois · motif : … »', () => {
    expect(splitMotif('octobre 2026 · motif : erreur de saisie')).toEqual({
      detail: 'octobre 2026',
      motif: 'erreur de saisie',
    });
  });

  it('clôture de mois sans motif : détail inchangé', () => {
    expect(splitMotif('octobre 2026')).toEqual({ detail: 'octobre 2026', motif: null });
  });

  it('paiement supprimé avec motif', () => {
    expect(splitMotif('150 000 F CFA · F2026-0001 · motif : doublon')).toEqual({
      detail: '150 000 F CFA · F2026-0001',
      motif: 'doublon',
    });
  });

  it('réglage modifié : le « : » du libellé ne gêne pas la séparation', () => {
    expect(splitMotif('Délai de relance : 3 jours dès novembre 2026 · motif : ajustement')).toEqual({
      detail: 'Délai de relance : 3 jours dès novembre 2026',
      motif: 'ajustement',
    });
  });

  it('détail contenant le mot « motif » sans motif : rien n’est séparé', () => {
    const detail = 'F2026-0001 · 100 000 F CFA TTC · Erreur de facturation : le motif du client';
    expect(splitMotif(detail)).toEqual({ detail, motif: null });
  });

  it('« motif : » au milieu d’un texte libre (pas après « · ») : rien n’est séparé', () => {
    const detail = 'F2026-0001 · 100 000 F CFA TTC · Geste commercial : motif : client fidèle';
    expect(splitMotif(detail)).toEqual({ detail, motif: null });
  });

  it('motif vide : pas de motif affiché, détail sans le suffixe', () => {
    expect(splitMotif('crm · CRM désactivé · motif : ')).toEqual({ detail: 'crm · CRM désactivé', motif: null });
  });

  it('motif saisi contenant lui-même « motif : » : séparé à la première occurrence', () => {
    expect(splitMotif('crm · CRM désactivé · motif : voir motif : précédent')).toEqual({
      detail: 'crm · CRM désactivé',
      motif: 'voir motif : précédent',
    });
  });
});
