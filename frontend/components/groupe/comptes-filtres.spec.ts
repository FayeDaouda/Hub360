import { describe, expect, it } from 'vitest';
import type { CompteGroupe } from '@/lib/types';
import {
  CRITERES_PAR_DEFAUT,
  compterComptes,
  estVerrouille,
  filtrerComptes,
  filtresActifs,
  type CriteresComptes,
} from './comptes-filtres';

// Horloge figée : aucune dépendance à l'heure réelle.
const MAINTENANT = new Date('2026-11-07T10:00:00Z');
const PASSE = '2026-11-07T09:59:00Z';
const FUTUR = '2026-11-07T10:15:00Z';

const compte = (maj: Partial<CompteGroupe> & { id: string }): CompteGroupe => ({
  prenom: 'Prénom',
  nom: 'Nom',
  email: `${maj.id.toLowerCase()}@greyconcrete.hub`,
  statut: 'actif',
  role: { id: 'R-SAL', nom: 'Salarié' },
  administration: false,
  doubleFacteur: false,
  verrouilleJusquau: null,
  ...maj,
});

const COMPTES: CompteGroupe[] = [
  compte({ id: 'A1', prenom: 'Fatou', nom: 'Diop', role: { id: 'R-COO', nom: 'COO' }, verrouilleJusquau: FUTUR }),
  compte({ id: 'A2', prenom: 'Aminata', nom: 'Ba', role: { id: 'R-DIR', nom: 'Dir. GC' } }),
  compte({ id: 'P1', prenom: 'Moussa', nom: 'Ndiaye', statut: 'en_attente', email: 'm.ndiaye@exemple.sn' }),
  compte({ id: 'D1', prenom: 'Ibrahima', nom: 'Fall', statut: 'desactive', verrouilleJusquau: PASSE }),
  compte({
    id: 'H1',
    prenom: 'Admin',
    nom: 'Groupe',
    role: { id: 'R-HOLD', nom: 'holding_admin' },
    administration: true,
  }),
];

const ids = (liste: CompteGroupe[]) => liste.map((c) => c.id);
const criteres = (maj: Partial<CriteresComptes>): CriteresComptes => ({ ...CRITERES_PAR_DEFAUT, ...maj });

describe('estVerrouille', () => {
  it('répond non quand le compte n’a jamais été verrouillé (null)', () => {
    expect(estVerrouille(compte({ id: 'X', verrouilleJusquau: null }), MAINTENANT)).toBe(false);
  });

  it('répond non quand la fin du verrouillage est passée', () => {
    expect(estVerrouille(compte({ id: 'X', verrouilleJusquau: PASSE }), MAINTENANT)).toBe(false);
  });

  it('répond oui quand la fin du verrouillage est encore à venir', () => {
    expect(estVerrouille(compte({ id: 'X', verrouilleJusquau: FUTUR }), MAINTENANT)).toBe(true);
  });

  it('répond non à l’instant exact de la fin du verrouillage (borne)', () => {
    expect(estVerrouille(compte({ id: 'X', verrouilleJusquau: MAINTENANT.toISOString() }), MAINTENANT)).toBe(false);
  });
});

describe('compterComptes', () => {
  it('compte les comptes de chacun des 5 filtres de statut', () => {
    expect(compterComptes(COMPTES, MAINTENANT)).toEqual({
      tous: 5,
      actif: 3,
      en_attente: 1,
      verrouille: 1,
      desactive: 1,
    });
  });

  it('renvoie zéro partout pour une liste vide', () => {
    expect(compterComptes([], MAINTENANT)).toEqual({ tous: 0, actif: 0, en_attente: 0, verrouille: 0, desactive: 0 });
  });

  it('ne compte pas comme verrouillé un compte dont le verrouillage a expiré', () => {
    const nombres = compterComptes([compte({ id: 'X', verrouilleJusquau: PASSE })], MAINTENANT);
    expect(nombres.verrouille).toBe(0);
    expect(nombres.actif).toBe(1);
  });
});

describe('filtrerComptes', () => {
  it('renvoie tous les comptes avec les critères par défaut', () => {
    expect(ids(filtrerComptes(COMPTES, CRITERES_PAR_DEFAUT, MAINTENANT))).toEqual(['A1', 'A2', 'P1', 'D1', 'H1']);
  });

  it('filtre par statut actif, en attente ou désactivé', () => {
    expect(ids(filtrerComptes(COMPTES, criteres({ statut: 'actif' }), MAINTENANT))).toEqual(['A1', 'A2', 'H1']);
    expect(ids(filtrerComptes(COMPTES, criteres({ statut: 'en_attente' }), MAINTENANT))).toEqual(['P1']);
    expect(ids(filtrerComptes(COMPTES, criteres({ statut: 'desactive' }), MAINTENANT))).toEqual(['D1']);
  });

  it('le filtre « verrouillé » ne garde que les verrouillages encore en cours', () => {
    expect(ids(filtrerComptes(COMPTES, criteres({ statut: 'verrouille' }), MAINTENANT))).toEqual(['A1']);
  });

  it('filtre par rôle sur le nom technique exact', () => {
    expect(ids(filtrerComptes(COMPTES, criteres({ role: 'Salarié' }), MAINTENANT))).toEqual(['P1', 'D1']);
    expect(ids(filtrerComptes(COMPTES, criteres({ role: 'Dir. GC' }), MAINTENANT))).toEqual(['A2']);
  });

  it('n’accepte pas un nom de rôle approchant (pas de correspondance partielle)', () => {
    expect(filtrerComptes(COMPTES, criteres({ role: 'Dir.' }), MAINTENANT)).toEqual([]);
  });

  it('recherche le prénom et le nom sans tenir compte de la casse', () => {
    expect(ids(filtrerComptes(COMPTES, criteres({ recherche: 'FATOU' }), MAINTENANT))).toEqual(['A1']);
    expect(ids(filtrerComptes(COMPTES, criteres({ recherche: 'ndiaye' }), MAINTENANT))).toEqual(['P1']);
  });

  it('recherche dans l’e-mail', () => {
    expect(ids(filtrerComptes(COMPTES, criteres({ recherche: 'exemple.sn' }), MAINTENANT))).toEqual(['P1']);
  });

  it('recherche dans le libellé lisible du rôle, pas seulement son nom technique', () => {
    expect(ids(filtrerComptes(COMPTES, criteres({ recherche: 'administration groupe' }), MAINTENANT))).toEqual(['H1']);
  });

  it('ignore les espaces autour du terme recherché', () => {
    expect(ids(filtrerComptes(COMPTES, criteres({ recherche: '  Aminata  ' }), MAINTENANT))).toEqual(['A2']);
  });

  it('une recherche faite d’espaces seuls ne filtre rien', () => {
    expect(filtrerComptes(COMPTES, criteres({ recherche: '   ' }), MAINTENANT)).toHaveLength(5);
  });

  it('combine statut, rôle et recherche (tous doivent correspondre)', () => {
    expect(
      ids(filtrerComptes(COMPTES, criteres({ statut: 'desactive', role: 'Salarié', recherche: 'fall' }), MAINTENANT)),
    ).toEqual(['D1']);
    expect(filtrerComptes(COMPTES, criteres({ statut: 'actif', role: 'Salarié' }), MAINTENANT)).toEqual([]);
  });

  it('renvoie une liste vide quand rien ne correspond', () => {
    expect(filtrerComptes(COMPTES, criteres({ recherche: 'introuvable' }), MAINTENANT)).toEqual([]);
  });
});

describe('filtresActifs', () => {
  it('répond non pour les critères par défaut', () => {
    expect(filtresActifs(CRITERES_PAR_DEFAUT)).toBe(false);
  });

  it('répond oui dès qu’un statut, un rôle ou un terme est choisi', () => {
    expect(filtresActifs(criteres({ statut: 'verrouille' }))).toBe(true);
    expect(filtresActifs(criteres({ role: 'COO' }))).toBe(true);
    expect(filtresActifs(criteres({ recherche: 'diop' }))).toBe(true);
  });

  it('répond non pour une recherche faite d’espaces seuls', () => {
    expect(filtresActifs(criteres({ recherche: '   ' }))).toBe(false);
  });
});
