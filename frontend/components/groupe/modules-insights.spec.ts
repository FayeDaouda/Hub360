import { describe, expect, it } from 'vitest';
import { ALL_RIGHTS, NO_RIGHTS } from '@hub/domain';
import type { CatalogueModules } from '@/lib/interrupteurs';
import type { LigneAudit } from '@/lib/pilotage';
import type { CompteGroupe, MatriceRoles, SocieteComptes } from '@/lib/types';
import { lastModuleToggle, moduleCoverage, moduleImpact } from './modules-insights';

// Deux modules : CRM (2 étapes) et Finances (1 étape).
// CIO = carte blanche (jamais compté) ; COO lit le CRM par sa 2e étape
// seulement ; Dir. GC écrit sans lire (ne compte pas) ; Salarié lit les
// Finances ; Comptable lit le CRM mais n'a aucun compte.
const MATRICE: MatriceRoles = {
  modules: [
    {
      cle: 'crm',
      nom: 'CRM',
      etapes: [
        { cle: 'crm.registre', nom: 'Registre', libelles: {} },
        { cle: 'crm.offres', nom: 'Offres', libelles: {} },
      ],
    },
    { cle: 'finances', nom: 'Finances', etapes: [{ cle: 'finances.factures', nom: 'Factures', libelles: {} }] },
  ],
  roles: [
    { id: 'R-CIO', nom: 'CIO', transverse: true, carteBlanche: true, droits: {} },
    {
      id: 'R-COO',
      nom: 'COO',
      transverse: false,
      carteBlanche: false,
      droits: { 'crm.registre': NO_RIGHTS, 'crm.offres': { ...NO_RIGHTS, lecture: true } },
    },
    {
      id: 'R-DIR',
      nom: 'Dir. GC',
      transverse: false,
      carteBlanche: false,
      droits: { 'crm.registre': { ...NO_RIGHTS, ecriture: true, validation: true } },
    },
    {
      id: 'R-SAL',
      nom: 'Salarié',
      transverse: false,
      carteBlanche: false,
      droits: { 'finances.factures': ALL_RIGHTS },
    },
    { id: 'R-CPT', nom: 'Comptable', transverse: false, carteBlanche: false, droits: { 'crm.registre': ALL_RIGHTS } },
  ],
};

let n = 0;
const compte = (roleId: string, nomRole: string, statut: CompteGroupe['statut'] = 'actif'): CompteGroupe => ({
  id: `U-${++n}`,
  prenom: 'P',
  nom: `N${n}`,
  email: `u${n}@greyconcrete.hub`,
  statut,
  role: { id: roleId, nom: nomRole },
  administration: false,
  doubleFacteur: false,
  verrouilleJusquau: null,
});

const societe = (comptes: CompteGroupe[]): SocieteComptes => ({
  id: 'S-GC',
  nom: 'Grey Concrete',
  slug: 'grey-concrete',
  rolesAttribuables: [],
  comptes,
  dossiersSansCompte: [],
  cellules: [],
});

describe('moduleImpact', () => {
  it('compte les comptes actifs dont le rôle lit au moins une étape du module', () => {
    const s = societe([compte('R-COO', 'COO'), compte('R-COO', 'COO'), compte('R-SAL', 'Salarié')]);
    expect(moduleImpact('crm', MATRICE, s)).toEqual({ comptes: 2, roles: [{ nom: 'COO', comptes: 2 }] });
    expect(moduleImpact('finances', MATRICE, s)).toEqual({ comptes: 1, roles: [{ nom: 'Salarié', comptes: 1 }] });
  });

  it('ne compte pas les rôles à carte blanche, qui gardent l’accès à tout', () => {
    const s = societe([compte('R-CIO', 'CIO'), compte('R-CIO', 'CIO')]);
    expect(moduleImpact('crm', MATRICE, s)).toEqual({ comptes: 0, roles: [] });
  });

  it('ne compte pas un rôle qui écrit ou valide sans avoir la Lecture', () => {
    const s = societe([compte('R-DIR', 'Dir. GC')]);
    expect(moduleImpact('crm', MATRICE, s)).toEqual({ comptes: 0, roles: [] });
  });

  it('ne compte que les comptes actifs (ni en attente, ni désactivés)', () => {
    const s = societe([
      compte('R-COO', 'COO'),
      compte('R-COO', 'COO', 'en_attente'),
      compte('R-COO', 'COO', 'desactive'),
    ]);
    expect(moduleImpact('crm', MATRICE, s)).toEqual({ comptes: 1, roles: [{ nom: 'COO', comptes: 1 }] });
  });

  it('omet les rôles concernés qui n’ont aucun compte actif', () => {
    const s = societe([compte('R-COO', 'COO'), compte('R-CPT', 'Comptable', 'desactive')]);
    const impact = moduleImpact('crm', MATRICE, s);
    expect(impact.roles.map((r) => r.nom)).toEqual(['COO']);
  });

  it('rattache un compte à son rôle par l’identifiant, pas par le nom affiché', () => {
    // Nom affiché différent de celui de la matrice, même identifiant : compté.
    // Même nom, autre identifiant : pas compté.
    const s = societe([compte('R-COO', 'Directeur des opérations'), compte('R-AUTRE', 'COO')]);
    expect(moduleImpact('crm', MATRICE, s)).toEqual({ comptes: 1, roles: [{ nom: 'COO', comptes: 1 }] });
  });

  it('renvoie zéro pour un module inconnu de la matrice', () => {
    const s = societe([compte('R-COO', 'COO'), compte('R-SAL', 'Salarié')]);
    expect(moduleImpact('inconnu', MATRICE, s)).toEqual({ comptes: 0, roles: [] });
  });

  it('renvoie zéro pour une société sans compte', () => {
    expect(moduleImpact('crm', MATRICE, societe([]))).toEqual({ comptes: 0, roles: [] });
  });
});

const CATALOGUE: CatalogueModules = {
  familles: [
    {
      nom: 'Commercial',
      modules: [
        { nom: 'Registre CRM', statut: 'en_service', note: null, module: { cle: 'crm', actif: true } },
        { nom: 'Offres', statut: 'en_partie', note: null, module: { cle: 'crm', actif: true } },
        { nom: 'Tableau CRM', statut: 'en_service', note: null, module: { cle: 'crm_totaux', actif: true } },
      ],
    },
    {
      nom: 'Gestion',
      modules: [
        { nom: 'Factures', statut: 'en_service', note: null, module: { cle: 'finances', actif: true } },
        { nom: 'Agenda', statut: 'a_venir', note: 'bientôt', module: null },
      ],
    },
  ],
};

describe('moduleCoverage', () => {
  it('liste les fonctions du catalogue qui reposent sur le module, toutes familles confondues', () => {
    expect(moduleCoverage('crm', CATALOGUE)).toEqual(['Registre CRM', 'Offres']);
    expect(moduleCoverage('finances', CATALOGUE)).toEqual(['Factures']);
  });

  it('renvoie une liste vide pour un module que rien ne couvre', () => {
    expect(moduleCoverage('rh', CATALOGUE)).toEqual([]);
    expect(moduleCoverage('crm', { familles: [] })).toEqual([]);
  });
});

const ligne = (maj: Partial<LigneAudit> & Pick<LigneAudit, 'action' | 'detail'>): LigneAudit => ({
  id: `L-${++n}`,
  le: '2026-11-01T10:00:00Z',
  categorie: 'administration',
  par: 'Admin HUB',
  ...maj,
});

describe('lastModuleToggle', () => {
  it('renvoie la bascule la plus récente du module, c’est-à-dire la première de la liste', () => {
    const lignes = [
      ligne({ action: 'Module réactivé', detail: 'crm · CRM réactivé · motif : fin', le: '2026-11-05T09:00:00Z' }),
      ligne({ action: 'Module désactivé', detail: 'crm · CRM désactivé · motif : test', le: '2026-11-02T09:00:00Z' }),
    ];
    expect(lastModuleToggle('crm', lignes)).toEqual({ coupe: false, le: '2026-11-05T09:00:00Z', par: 'Admin HUB' });
  });

  it('signale une coupure quand la dernière bascule est « Module désactivé »', () => {
    const lignes = [ligne({ action: 'Module désactivé', detail: 'crm · CRM désactivé · motif : test', par: null })];
    expect(lastModuleToggle('crm', lignes)).toEqual({ coupe: true, le: '2026-11-01T10:00:00Z', par: null });
  });

  it('ne confond pas « crm » avec « crm_totaux »', () => {
    const lignes = [ligne({ action: 'Module désactivé', detail: 'crm_totaux · Totaux CRM désactivé · motif : x' })];
    expect(lastModuleToggle('crm', lignes)).toBeNull();
    expect(lastModuleToggle('crm_totaux', lignes)?.coupe).toBe(true);
  });

  it('ignore les lignes d’une autre catégorie que l’administration', () => {
    const lignes = [ligne({ categorie: 'droits', action: 'Module désactivé', detail: 'crm · CRM désactivé' })];
    expect(lastModuleToggle('crm', lignes)).toBeNull();
  });

  it('ignore les autres actions de l’administration, même si le détail commence par la clé', () => {
    const lignes = [
      ligne({ action: 'Maintenance du HUB activée', detail: 'crm · message' }),
      ligne({ action: 'Compte débloqué', detail: 'crm · Fatou Diop' }),
    ];
    expect(lastModuleToggle('crm', lignes)).toBeNull();
  });

  it('exige la clé en tête du détail, suivie du séparateur', () => {
    const lignes = [
      ligne({ action: 'Module désactivé', detail: 'finances · crm · faux positif' }),
      ligne({ action: 'Module désactivé', detail: 'crm désactivé sans séparateur' }),
    ];
    expect(lastModuleToggle('crm', lignes)).toBeNull();
  });

  it('renvoie null pour un journal vide', () => {
    expect(lastModuleToggle('crm', [])).toBeNull();
  });
});
