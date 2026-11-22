import { describe, expect, it } from 'vitest';
import {
  filtrer,
  lienEmail,
  lienTelephone,
  membresDeSaCellule,
  nomDe,
  parCellule,
  type CollegueAnnuaire,
} from './annuaire';

const c = (
  x: Partial<CollegueAnnuaire> & Pick<CollegueAnnuaire, 'utilisateurId' | 'prenom' | 'nom'>,
): CollegueAnnuaire => ({
  nomAffiche: null,
  photoUrl: null,
  poste: null,
  cellule: null,
  chef: null,
  estChef: false,
  telephone: null,
  email: `${x.prenom.toLowerCase()}@gc.sn`,
  societe: { slug: 'grey-concrete', nom: 'Grey Concrete' },
  memeSociete: true,
  absentJusquau: null,
  ...x,
});
const LEA = c({
  utilisateurId: 'U1',
  prenom: 'Léa',
  nom: 'Ndiaye',
  poste: 'Architecte',
  cellule: 'Conception',
  telephone: '+221 77 123 45 67',
});
const MOUSSA = c({
  utilisateurId: 'U2',
  prenom: 'Moussa',
  nom: 'Sow',
  cellule: 'Conception',
  estChef: true,
  absentJusquau: '2026-11-25',
});
const AWA = c({
  utilisateurId: 'U3',
  prenom: 'Awa',
  nom: 'Diop',
  nomAffiche: 'Awa D.',
  societe: { slug: 'coded', nom: "CODE'D" },
  memeSociete: false,
});
const TOUS = [LEA, MOUSSA, AWA];
const vide = { q: '', cellule: '', societe: '', absents: false };

describe('annuaire', () => {
  it('nom : celui choisi par la personne, sinon le nom officiel', () => {
    expect(nomDe(AWA)).toBe('Awa D.');
    expect(nomDe(LEA)).toBe('Léa Ndiaye');
  });

  it('recherche sans accents ni casse, mot par mot, dans le nom, le poste, la société, le téléphone', () => {
    expect(filtrer(TOUS, { ...vide, q: 'lea' }).map((m) => m.utilisateurId)).toEqual(['U1']);
    expect(filtrer(TOUS, { ...vide, q: 'archi ndiaye' }).map((m) => m.utilisateurId)).toEqual(['U1']);
    expect(filtrer(TOUS, { ...vide, q: "code'd" }).map((m) => m.utilisateurId)).toEqual(['U3']);
    expect(filtrer(TOUS, { ...vide, q: '77123' }).map((m) => m.utilisateurId)).toEqual(['U1']);
    expect(filtrer(TOUS, { ...vide, q: 'inconnu' })).toEqual([]);
  });

  it('filtres : cellule (« — » sans cellule), société, absents du jour', () => {
    expect(filtrer(TOUS, { ...vide, cellule: 'Conception' })).toHaveLength(2);
    expect(filtrer(TOUS, { ...vide, cellule: '—' }).map((m) => m.utilisateurId)).toEqual(['U3']);
    expect(filtrer(TOUS, { ...vide, societe: 'coded' }).map((m) => m.utilisateurId)).toEqual(['U3']);
    expect(filtrer(TOUS, { ...vide, absents: true }).map((m) => m.utilisateurId)).toEqual(['U2']);
  });

  it('par cellule : le chef d’équipe en tête, « Sans cellule » en dernier', () => {
    expect(parCellule(TOUS).map((g) => [g.cellule, g.membres.map((m) => m.utilisateurId)])).toEqual([
      ['Conception', ['U2', 'U1']],
      ['—', ['U3']],
    ]);
  });

  it('membres de sa cellule : même cellule et même société, sans la personne', () => {
    expect(membresDeSaCellule(TOUS, LEA).map((m) => m.utilisateurId)).toEqual(['U2']);
    expect(membresDeSaCellule(TOUS, AWA)).toEqual([]);
  });

  it('liens d’appel et d’e-mail : seulement pour une valeur de la forme attendue', () => {
    expect(lienTelephone('+221 77 123 45 67')).toBe('tel:+221771234567');
    expect(lienTelephone('77-123-45-67 (bureau)')).toBeNull();
    expect(lienTelephone('javascript:alert(1)')).toBeNull();
    expect(lienEmail('lea@gc.sn')).toBe('mailto:lea@gc.sn');
    expect(lienEmail('x@gc.sn?bcc=tiers@ext.com')).toBeNull();
    expect(lienEmail('pas une adresse')).toBeNull();
    expect(lienEmail(null)).toBeNull();
  });
});
