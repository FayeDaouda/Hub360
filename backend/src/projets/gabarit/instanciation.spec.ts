import { GABARIT_GC_CONCEPTION } from '../../reglages/gabarit-gc-conception';
import { instancier, type ContexteOuverture } from './instanciation';

const CTX: ContexteOuverture = {
  j1: '2026-09-10',
  feries: new Set(),
  chargesGc: { Notice: 2, Cachet: 1, Timbre: 1 },
  spcCommande: false,
  clientPersonnePhysique: true,
};
const cartes = instancier(GABARIT_GC_CONCEPTION, CTX);
const carte = (cle: string) => cartes.find((c) => c.cle === cle)!;
const tache = (c: string, t: string) => carte(c).taches.find((x) => x.cle === t)!;

describe('ouverture d’un projet selon GC-CONCEPTION (maquette Projets)', () => {
  it('fenêtres en dates figées : Documents du client J1 → J5 = 10/09 → 16/09', () => {
    expect(carte('documents_client')).toMatchObject({ debutJ: 1, finJ: 5, debutLe: '2026-09-10', finLe: '2026-09-16' });
    // Tâche sans fenêtre propre : échéance de référence = fin de la carte.
    expect(tache('documents_client', 'piece_identite').finLe).toBe('2026-09-16');
    expect(tache('livrables', 'details_facade')).toMatchObject({ finJ: 13, finLe: '2026-09-28' });
    expect(tache('tache_finale', 'integration_livraison').finLe).toBe('2026-11-04');
  });

  it('client personne physique → NINEA non nécessaire, avec le motif de la maquette', () => {
    expect(tache('documents_client', 'ninea')).toMatchObject({
      statut: 'non_necessaire',
      motif: 'Client personne physique (CRM) : sans objet',
    });
    const morale = instancier(GABARIT_GC_CONCEPTION, { ...CTX, clientPersonnePhysique: false });
    expect(morale.find((c) => c.cle === 'documents_client')!.taches.find((t) => t.cle === 'ninea')!.statut).toBe(
      'a_faire',
    );
  });

  it('SPC absent de l’offre → autorisation de construire non nécessaire', () => {
    expect(tache('permis_construire', 'autorisation')).toMatchObject({
      statut: 'non_necessaire',
      motif: 'SPC non commandé au devis',
    });
    const avecSpc = instancier(GABARIT_GC_CONCEPTION, { ...CTX, spcCommande: true });
    expect(
      avecSpc.find((c) => c.cle === 'permis_construire')!.taches.find((t) => t.cle === 'autorisation')!.statut,
    ).toBe('a_faire');
  });

  it('temps résolus : charges GC des Réglages, sans temps atelier = null, équipements 24 h / 9', () => {
    expect(tache('permis_construire', 'notice_securite').heures).toBe(2);
    expect(tache('permis_construire', 'cachet_architecte').heures).toBe(1);
    expect(tache('documents_client', 'piece_identite').heures).toBeNull();
    expect(tache('livrables', 'esquisses').heures).toBe(40);
    expect(carte('equipements').taches.map((t) => t.heures)).toEqual(Array(9).fill(2.7));
  });

  it('permis de démolir désactivé par défaut ; Façades ouvre après Détails façade', () => {
    expect(carte('permis_demolir').desactivation).toBe('Procédure à compléter · désactivée par défaut');
    expect(carte('facades').ouvreApres).toEqual(['livrables.details_facade']);
  });

  it('six étapes dans l’ordre, cartes numérotées en continu', () => {
    expect([...new Set(cartes.map((c) => c.etapeNumero))]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(cartes.map((c) => c.ordre)).toEqual(cartes.map((_, i) => i));
  });
});
