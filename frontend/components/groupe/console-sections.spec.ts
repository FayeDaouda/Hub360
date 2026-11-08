import { describe, expect, it } from 'vitest';
import {
  definitionSection,
  GROUPES_CONSOLE,
  lienSection,
  SECTION_PAR_DEFAUT,
  sectionDepuisParametre,
} from './console-sections';

describe('sections de l’Administration du HUB', () => {
  it('lit la section demandée dans l’adresse', () => {
    expect(sectionDepuisParametre('journal')).toBe('journal');
    expect(sectionDepuisParametre('deblocages')).toBe('deblocages');
  });

  it('retombe sur la section par défaut sans paramètre ou avec une valeur inconnue', () => {
    expect(sectionDepuisParametre(null)).toBe(SECTION_PAR_DEFAUT);
    expect(sectionDepuisParametre('')).toBe(SECTION_PAR_DEFAUT);
    expect(sectionDepuisParametre('salaires')).toBe(SECTION_PAR_DEFAUT);
    expect(sectionDepuisParametre('constructor')).toBe(SECTION_PAR_DEFAUT);
  });

  it('mène l’ancienne adresse « Interrupteurs » vers « Modules »', () => {
    expect(sectionDepuisParametre('interrupteurs')).toBe('modules');
  });

  it('garde l’adresse nue pour la section par défaut', () => {
    expect(lienSection(SECTION_PAR_DEFAUT)).toBe('/groupe');
    expect(lienSection('droits')).toBe('/groupe?onglet=droits');
  });

  it('fait l’aller-retour adresse → section pour chaque section', () => {
    for (const s of GROUPES_CONSOLE.flatMap((g) => g.sections)) {
      const onglet = new URL(lienSection(s.cle), 'http://hub').searchParams.get('onglet');
      expect(sectionDepuisParametre(onglet)).toBe(s.cle);
    }
  });

  it('rattache chaque section à son groupe et nomme la société dans les explications', () => {
    expect(definitionSection('modules').groupe).toBe('Plateforme');
    expect(definitionSection('droits').description('Grey Concrete')).toContain('Grey Concrete');
  });
});
