import { describe, expect, it } from 'vitest';
import type { LigneAudit } from '@/lib/pilotage';
import { recentUnblocks } from './deblocages-insights';

// Lignes telles que le journal d'audit les produit pour une intervention
// (backend/src/audit/journal-audit.service.ts) : catégorie « administration »,
// action = libellé de ACTIONS_INTERVENTION, détail = « cible · détail · motif : … ».
let n = 0;
const ligne = (action: string, detail: string, extra: Partial<LigneAudit> = {}): LigneAudit => ({
  id: `L${++n}`,
  le: '2026-11-07T10:00:00.000Z',
  categorie: 'administration',
  action,
  detail,
  par: 'Awa Sarr',
  ...extra,
});

describe('recentUnblocks', () => {
  describe('actions retenues', () => {
    it('reconnaît les cinq libellés exacts du journal pour les interventions sur un code', () => {
      const lignes = [
        ligne('Onboard sans signature du client', 'GB_TBD.26 · Onboard · motif : Client en voyage'),
        ligne('Projet ouvert sans F1', 'GB_TBD.27 · motif : Projet antérieur'),
        ligne('Cellules du projet modifiées', 'GB_TBD.28 · Cellule A · motif : Réorganisation'),
        ligne('Dossier perdu rouvert', 'GB_TBD.29 · motif : Client revenu'),
        ligne('Dossier / projet supprimé définitivement', 'GB_TBD.30 · motif : Doublon'),
      ];
      expect(recentUnblocks(lignes, 10).map((r) => [r.kind, r.code])).toEqual([
        ['onboard', 'GB_TBD.26'],
        ['ouverture', 'GB_TBD.27'],
        ['cellules', 'GB_TBD.28'],
        ['reouverture', 'GB_TBD.29'],
        ['suppression', 'GB_TBD.30'],
      ]);
    });

    it('garde l’identifiant, le libellé d’action, la date et l’auteur de la ligne', () => {
      const l = ligne('Dossier perdu rouvert', 'GB_TBD.29 · motif : Client revenu', {
        id: 'intervention:42',
        le: '2026-11-05T08:30:00.000Z',
        par: null,
      });
      expect(recentUnblocks([l])).toEqual([
        {
          id: 'intervention:42',
          kind: 'reouverture',
          action: 'Dossier perdu rouvert',
          code: 'GB_TBD.29',
          motif: 'Client revenu',
          le: '2026-11-05T08:30:00.000Z',
          par: null,
        },
      ]);
    });
  });

  describe('lignes écartées', () => {
    it('ignore les bascules de modules et la maintenance (section Modules)', () => {
      const lignes = [
        ligne('Module désactivé', 'finances · Finances désactivé · motif : Clôture'),
        ligne('Module réactivé', 'finances · Finances réactivé · motif : Fin de clôture'),
        ligne('Maintenance du HUB activée', 'HUB · Maintenance · motif : Mise à jour'),
        ligne('Maintenance du HUB levée', 'HUB · HUB rouvert · motif : Fini'),
      ];
      expect(recentUnblocks(lignes)).toEqual([]);
    });

    it('ignore un libellé connu hors de la catégorie administration', () => {
      const l = ligne('Dossier perdu rouvert', 'GB_TBD.29 · motif : x', { categorie: 'droits' });
      expect(recentUnblocks([l])).toEqual([]);
    });

    it('ignore une action proche mais différente du libellé exact', () => {
      const lignes = [
        ligne('dossier perdu rouvert', 'GB_TBD.29 · motif : casse'),
        ligne('Dossier perdu rouvert ', 'GB_TBD.29 · motif : espace final'),
        ligne('Projet ouvert', 'GB_TBD.27 · motif : tronqué'),
      ];
      expect(recentUnblocks(lignes)).toEqual([]);
    });

    it('ignore une action « toString » ou « constructor » (pas de clé héritée de l’objet)', () => {
      const lignes = [ligne('toString', 'GB_TBD.26 · motif : x'), ligne('constructor', 'GB_TBD.26 · motif : x')];
      expect(recentUnblocks(lignes)).toEqual([]);
    });

    it('ignore une intervention dont le détail est vide ou ne porte qu’un motif', () => {
      const lignes = [
        ligne('Dossier perdu rouvert', ''),
        ligne('Dossier perdu rouvert', 'motif : sans code'),
        ligne('Dossier perdu rouvert', '   · motif : code blanc'),
      ];
      expect(recentUnblocks(lignes)).toEqual([]);
    });
  });

  describe('code et motif', () => {
    it('prend le code au début du détail, sans espaces autour', () => {
      const l = ligne('Projet ouvert sans F1', '  GB_TBD.27  · Gabarit GC-CONCEPTION v3 · motif : Ancien Onboard');
      expect(recentUnblocks([l])[0].code).toBe('GB_TBD.27');
    });

    it('extrait le motif, même s’il contient lui-même « · »', () => {
      const l = ligne('Onboard sans signature du client', 'GB_TBD.26 · Onboard · motif : Client absent · rappel lundi');
      const [r] = recentUnblocks([l]);
      expect(r.code).toBe('GB_TBD.26');
      expect(r.motif).toBe('Client absent · rappel lundi');
    });

    it('motif absent : null, et le code reste celui du détail', () => {
      const [r] = recentUnblocks([ligne('Cellules du projet modifiées', 'GB_TBD.28 · Cellule A, Cellule B')]);
      expect(r.code).toBe('GB_TBD.28');
      expect(r.motif).toBeNull();
    });

    it('détail réduit au code : retenu, sans motif', () => {
      const [r] = recentUnblocks([ligne('Dossier perdu rouvert', 'GB_TBD.29')]);
      expect(r).toMatchObject({ code: 'GB_TBD.29', motif: null });
    });
  });

  describe('limite', () => {
    const neuf = Array.from({ length: 9 }, (_, i) =>
      ligne('Dossier perdu rouvert', `GB_TBD.${10 + i} · motif : m${i}`),
    );

    it('rend les cinq premières par défaut, dans l’ordre du journal (plus récent d’abord)', () => {
      expect(recentUnblocks(neuf).map((r) => r.code)).toEqual([
        'GB_TBD.10',
        'GB_TBD.11',
        'GB_TBD.12',
        'GB_TBD.13',
        'GB_TBD.14',
      ]);
    });

    it('respecte une limite donnée, sans compter les lignes écartées', () => {
      const lignes = [
        ligne('Module désactivé', 'finances · Finances désactivé · motif : x'),
        neuf[0],
        ligne('Matrice modifiée', 'CFO › Finances', { categorie: 'droits' }),
        neuf[1],
        neuf[2],
      ];
      expect(recentUnblocks(lignes, 2).map((r) => r.code)).toEqual(['GB_TBD.10', 'GB_TBD.11']);
    });

    it('limite à zéro ou journal vide : aucune intervention', () => {
      expect(recentUnblocks(neuf, 0)).toEqual([]);
      expect(recentUnblocks([])).toEqual([]);
    });

    it('garde chaque intervention, même plusieurs sur le même code', () => {
      const lignes = [
        ligne('Cellules du projet modifiées', 'GB_TBD.28 · motif : a'),
        ligne('Projet ouvert sans F1', 'GB_TBD.28 · motif : b'),
      ];
      expect(recentUnblocks(lignes).map((r) => r.kind)).toEqual(['cellules', 'ouverture']);
    });
  });
});
