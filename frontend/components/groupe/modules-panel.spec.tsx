import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_RIGHTS, NO_RIGHTS } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { getComptesGroupe } from '@/lib/groupe';
import {
  basculerMaintenance,
  basculerModule,
  getCatalogueModules,
  getInterrupteurs,
  type CatalogueModules,
  type Interrupteurs,
} from '@/lib/interrupteurs';
import { getJournalAudit, type LigneAudit } from '@/lib/pilotage';
import { getMatriceRoles } from '@/lib/roles';
import type { CompteGroupe, MatriceRoles, SocieteComptes } from '@/lib/types';
import { ModulesPanel } from './modules-panel';

// API mockée ; les calculs (impact, couverture, dernière bascule) restent les vrais.
vi.mock('@/lib/interrupteurs', () => ({
  getInterrupteurs: vi.fn(),
  getCatalogueModules: vi.fn(),
  basculerModule: vi.fn(),
  basculerMaintenance: vi.fn(),
}));
vi.mock('@/lib/roles', () => ({ getMatriceRoles: vi.fn() }));
vi.mock('@/lib/groupe', () => ({ getComptesGroupe: vi.fn() }));
vi.mock('@/lib/pilotage', () => ({ getJournalAudit: vi.fn() }));

const chargerEtat = vi.mocked(getInterrupteurs);
const chargerCatalogue = vi.mocked(getCatalogueModules);
const chargerMatrice = vi.mocked(getMatriceRoles);
const chargerComptes = vi.mocked(getComptesGroupe);
const chargerJournal = vi.mocked(getJournalAudit);
const basculer = vi.mocked(basculerModule);
const maintenance = vi.mocked(basculerMaintenance);

// Horloge figée (seule Date est simulée : userEvent garde ses vrais minuteurs).
const MAINTENANT = new Date('2026-11-08T10:00:00Z');
const SLUG = 'grey-concrete';

// CRM et RH en service, Finances coupé depuis le 03/11 ; HUB ouvert.
const ETAT: Interrupteurs = {
  modules: [
    { cle: 'crm', nom: 'CRM', actif: true, desactiveLe: null, motif: null },
    { cle: 'finances', nom: 'Finances', actif: false, desactiveLe: '2026-11-03T08:00:00Z', motif: 'Clôture comptable' },
    { cle: 'rh', nom: 'RH', actif: true, desactiveLe: null, motif: null },
    { cle: 'projets', nom: 'Projets', actif: true, desactiveLe: null, motif: null },
  ],
  maintenance: { actif: false, message: '', depuis: { le: '2026-11-02T18:30:00Z', par: 'Awa Sarr' } },
};

const CATALOGUE: CatalogueModules = {
  familles: [
    {
      nom: 'Commercial',
      modules: [
        { nom: 'Registre CRM', statut: 'en_service', note: null, module: { cle: 'crm', actif: true } },
        { nom: 'Offres', statut: 'en_partie', note: null, module: { cle: 'crm', actif: true } },
      ],
    },
    {
      nom: 'Gestion',
      modules: [
        { nom: 'Factures', statut: 'en_service', note: null, module: { cle: 'finances', actif: false } },
        { nom: 'Paie', statut: 'en_partie', note: null, module: { cle: 'rh', actif: true } },
        { nom: 'Agenda', statut: 'a_venir', note: 'au premier trimestre', module: null },
      ],
    },
  ],
};

// CIO = carte blanche (jamais compté) ; COO lit le CRM ; Salarié lit la RH ;
// Chef de projet lit les Projets mais n'a aucun compte actif.
const MATRICE: MatriceRoles = {
  modules: [
    { cle: 'crm', nom: 'CRM', etapes: [{ cle: 'crm.registre', nom: 'Registre', libelles: {} }] },
    { cle: 'finances', nom: 'Finances', etapes: [{ cle: 'finances.factures', nom: 'Factures', libelles: {} }] },
    { cle: 'rh', nom: 'RH', etapes: [{ cle: 'rh.dossiers', nom: 'Dossiers', libelles: {} }] },
    { cle: 'projets', nom: 'Projets', etapes: [{ cle: 'projets.taches', nom: 'Tâches', libelles: {} }] },
  ],
  roles: [
    { id: 'R-CIO', nom: 'CIO', transverse: true, carteBlanche: true, droits: {} },
    { id: 'R-COO', nom: 'COO', transverse: false, carteBlanche: false, droits: { 'crm.registre': ALL_RIGHTS } },
    {
      id: 'R-SAL',
      nom: 'Salarié',
      transverse: false,
      carteBlanche: false,
      droits: { 'rh.dossiers': { ...NO_RIGHTS, lecture: true } },
    },
    {
      id: 'R-CDP',
      nom: 'Chef de projet',
      transverse: false,
      carteBlanche: false,
      droits: { 'projets.taches': ALL_RIGHTS },
    },
  ],
};

let n = 0;
const compte = (roleId: string, statut: CompteGroupe['statut'] = 'actif'): CompteGroupe => ({
  id: `U-${++n}`,
  prenom: 'P',
  nom: `N${n}`,
  email: `u${n}@greyconcrete.hub`,
  statut,
  role: { id: roleId, nom: roleId },
  administration: false,
  doubleFacteur: false,
  verrouilleJusquau: null,
});
const societe = (slug: string, comptes: CompteGroupe[]): SocieteComptes => ({
  id: `S-${slug}`,
  nom: slug,
  slug,
  rolesAttribuables: [],
  comptes,
  dossiersSansCompte: [],
  cellules: [],
});
// La société affichée est retrouvée par son slug parmi celles du groupe.
const COMPTES = {
  societes: [
    societe('grey-holding', [compte('R-COO'), compte('R-COO'), compte('R-COO'), compte('R-COO')]),
    societe(SLUG, [
      compte('R-CIO'),
      compte('R-COO'),
      compte('R-COO'),
      compte('R-COO', 'desactive'),
      compte('R-SAL'),
      compte('R-CDP', 'en_attente'),
    ]),
  ],
};

const ligne = (maj: Pick<LigneAudit, 'action' | 'detail' | 'le'> & Partial<LigneAudit>): LigneAudit => ({
  id: `L-${++n}`,
  categorie: 'administration',
  par: 'Admin HUB',
  ...maj,
});
const JOURNAL = {
  debut: '2025-11-08',
  fin: '2026-11-08',
  lignes: [
    ligne({
      action: 'Module désactivé',
      detail: 'finances · Finances désactivé · motif : Clôture comptable',
      le: '2026-11-03T08:00:00Z',
    }),
  ],
};

async function afficher() {
  render(<ModulesPanel slug={SLUG} societe="Grey Concrete" />);
  await screen.findByRole('heading', { name: 'Modules de Grey Concrete' });
}

const interrupteur = (nom: RegExp | string) => screen.getByRole('switch', { name: nom });
const carte = (nomModule: string) => interrupteur(`Module ${nomModule}`).closest('li')!;
const fenetre = (nom: string) => screen.getByRole('dialog', { name: nom });
const champMotif = (d: HTMLElement) => within(d).getByLabelText('Motif');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  vi.clearAllMocks();
  chargerEtat.mockResolvedValue(ETAT);
  chargerCatalogue.mockResolvedValue(CATALOGUE);
  chargerMatrice.mockResolvedValue(MATRICE);
  chargerComptes.mockResolvedValue(COMPTES);
  chargerJournal.mockResolvedValue(JOURNAL);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ModulesPanel · état du HUB', () => {
  it('annonce le HUB ouvert, avec sa dernière réouverture donnée par le serveur', async () => {
    await afficher();
    const etat = screen.getByRole('article', { name: 'État du HUB' });
    expect(within(etat).getByRole('heading', { name: 'Le HUB est ouvert' })).toBeInTheDocument();
    expect(within(etat).getByText('Ouvert')).toBeInTheDocument();
    expect(within(etat).getByText('Rouvert le 02/11/2026 à 18:30 par Awa Sarr')).toBeInTheDocument();
    expect(within(etat).getByRole('button', { name: 'Fermer pour maintenance' })).toBeInTheDocument();
  });

  it('annonce le HUB fermé avec le message affiché aux comptes', async () => {
    chargerEtat.mockResolvedValue({ ...ETAT, maintenance: { actif: true, message: 'Retour vers 14 h', depuis: null } });
    await afficher();
    const etat = screen.getByRole('article', { name: 'État du HUB' });
    expect(within(etat).getByRole('heading', { name: 'Le HUB est fermé pour maintenance' })).toBeInTheDocument();
    expect(within(etat).getByText('« Retour vers 14 h »')).toBeInTheDocument();
    expect(within(etat).getByRole('button', { name: 'Rouvrir le HUB' })).toBeInTheDocument();
  });

  it('reprend le message par défaut du serveur quand le HUB est fermé sans message', async () => {
    chargerEtat.mockResolvedValue({ ...ETAT, maintenance: { actif: true, message: '   ', depuis: null } });
    await afficher();
    expect(screen.getByText('« Le HUB est en maintenance. Réessayez plus tard. »')).toBeInTheDocument();
  });

  it('annonce depuis quand et par qui le HUB est fermé', async () => {
    chargerEtat.mockResolvedValue({
      ...ETAT,
      maintenance: {
        actif: true,
        message: 'Retour vers 14 h',
        depuis: { le: '2026-11-08T09:15:00Z', par: 'Awa Sarr' },
      },
    });
    await afficher();
    const etat = screen.getByRole('article', { name: 'État du HUB' });
    expect(within(etat).getByText('Fermé le 08/11/2026 à 09:15 par Awa Sarr')).toBeInTheDocument();
  });

  it('ne tire pas la trace de la maintenance du journal de la société', async () => {
    // Le journal d'une société ne voit pas les bascules faites depuis une autre :
    // seule la trace du serveur compte, même absente.
    chargerEtat.mockResolvedValue({ ...ETAT, maintenance: { actif: false, message: '', depuis: null } });
    chargerJournal.mockResolvedValue({
      ...JOURNAL,
      lignes: [ligne({ action: 'Maintenance du HUB levée', detail: '', le: '2026-11-07T09:00:00Z' })],
    });
    await afficher();
    const etat = screen.getByRole('article', { name: 'État du HUB' });
    expect(within(etat).queryByText(/^Rouvert le/)).not.toBeInTheDocument();
  });

  it('dit que l’Administrateur HUB et le CIO gardent l’accès pendant la maintenance', async () => {
    await afficher();
    const etat = screen.getByRole('article', { name: 'État du HUB' });
    expect(within(etat).getByText(/sauf l’Administrateur HUB et le CIO/)).toBeInTheDocument();
  });

  it('lit le journal d’audit de la société sur un an glissant', async () => {
    await afficher();
    expect(chargerJournal).toHaveBeenCalledWith(SLUG, '2025-11-08');
    expect(chargerMatrice).toHaveBeenCalledWith(SLUG);
  });
});

describe('ModulesPanel · cartes des modules', () => {
  it('affiche une carte par module avec son interrupteur et le compteur activés / coupés', async () => {
    await afficher();
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(interrupteur('Module CRM')).toHaveAttribute('aria-checked', 'true');
    expect(interrupteur('Module Finances')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('3 activés · 1 coupé')).toBeInTheDocument();
  });

  it('dit ce que couvre chaque module d’après le catalogue', async () => {
    await afficher();
    expect(within(carte('CRM')).getByText('Registre CRM · Offres')).toBeInTheDocument();
    expect(within(carte('RH')).getByText('Paie')).toBeInTheDocument();
    // Rien au catalogue pour Projets : pas de ligne « couvre ».
    expect(carte('Projets').querySelector('.mod-carte-couvre')).toBeNull();
  });

  it('compte les comptes actifs de la société qui accèdent au module par leur rôle', async () => {
    await afficher();
    // 2 COO actifs (le désactivé, le CIO et les comptes de l'autre société ne comptent pas).
    expect(within(carte('CRM')).getByText('2 comptes y accèdent')).toBeInTheDocument();
    // Seul compte du rôle en attente : personne n'y accède.
    expect(within(carte('Projets')).getByText('Aucun compte n’y accède par son rôle')).toBeInTheDocument();
  });

  it('accorde le verbe au singulier quand un seul compte accède au module', async () => {
    await afficher();
    expect(within(carte('RH')).getByText('1 compte y accède')).toBeInTheDocument();
  });

  it('montre la pastille, la date et le motif d’un module coupé, et sa dernière bascule', async () => {
    await afficher();
    const finances = carte('Finances');
    expect(within(finances).getByText('Coupé')).toBeInTheDocument();
    // Une seule ligne d'historique (heure et auteur tirés du journal), puis le motif.
    expect(within(finances).getByText('le 03/11/2026 à 08:00 par Admin HUB')).toBeInTheDocument();
    expect(within(finances).getByText('« Clôture comptable »')).toBeInTheDocument();
    expect(within(finances).queryByText(/^le 03\/11\/2026$/)).not.toBeInTheDocument();
    expect(within(finances).queryByText(/y accèdent/)).not.toBeInTheDocument();
  });
});

describe('ModulesPanel · couper ou réactiver un module', () => {
  it('ouvre la fenêtre « Couper le module » avec les comptes, les rôles et les pages concernés', async () => {
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    expect(within(d).getByText('Accès retiré à 2 comptes de Grey Concrete')).toBeInTheDocument();
    expect(within(d).getByRole('listitem')).toHaveTextContent('COO · 2 comptes');
    expect(within(d).getByText('Concerne : Registre CRM, Offres')).toBeInTheDocument();
  });

  it('exige un motif d’au moins 3 caractères, espaces exclus', async () => {
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    const bouton = within(d).getByRole('button', { name: 'Couper le module' });
    expect(bouton).toBeDisabled();
    await userEvent.type(champMotif(d), 'ab ');
    expect(bouton).toBeDisabled();
    await userEvent.type(champMotif(d), 'c');
    expect(bouton).toBeEnabled();
  });

  it('coupe le module avec le motif, puis met la carte à jour et relit le journal', async () => {
    const apres: Interrupteurs = {
      ...ETAT,
      modules: ETAT.modules.map((m) =>
        m.cle === 'crm' ? { ...m, actif: false, desactiveLe: '2026-11-08T10:00:00Z', motif: 'Audit des offres' } : m,
      ),
    };
    basculer.mockResolvedValue(apres);
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), '  Audit des offres  ');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));

    expect(basculer).toHaveBeenCalledWith(SLUG, 'crm', false, 'Audit des offres');
    expect(await screen.findByRole('switch', { name: 'Module CRM', checked: false })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(carte('CRM')).getByText('le 08/11/2026')).toBeInTheDocument();
    expect(within(carte('CRM')).getByText('« Audit des offres »')).toBeInTheDocument();
    expect(screen.getByText('2 activés · 2 coupés')).toBeInTheDocument();
    expect(chargerJournal).toHaveBeenCalledTimes(2);
  });

  it('garde la relecture du journal qui suit une bascule, même si le premier chargement répond après', async () => {
    let repondreChargement: (j: typeof JOURNAL) => void = () => {};
    chargerJournal.mockReturnValueOnce(new Promise((r) => (repondreChargement = r)));
    chargerJournal.mockResolvedValueOnce({
      ...JOURNAL,
      lignes: [
        ligne({
          action: 'Module désactivé',
          detail: 'crm · CRM désactivé · motif : Audit',
          le: '2026-11-08T10:00:00Z',
        }),
      ],
    });
    basculer.mockResolvedValue({
      ...ETAT,
      modules: ETAT.modules.map((m) => (m.cle === 'crm' ? { ...m, actif: false, motif: 'Audit' } : m)),
    });
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), 'Audit');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));
    expect(await within(carte('CRM')).findByText('le 08/11/2026 à 10:00 par Admin HUB')).toBeInTheDocument();

    // Le premier chargement (plus ancien) arrive enfin : il n'écrase pas la relecture.
    repondreChargement(JOURNAL);
    await screen.findByRole('switch', { name: 'Module CRM', checked: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(within(carte('CRM')).getByText('le 08/11/2026 à 10:00 par Admin HUB')).toBeInTheDocument();
  });

  it('garde la page en place si la relecture du journal échoue après une bascule', async () => {
    chargerJournal.mockResolvedValueOnce(JOURNAL).mockRejectedValueOnce(new Error('réseau'));
    basculer.mockResolvedValue({
      ...ETAT,
      modules: ETAT.modules.map((m) => (m.cle === 'crm' ? { ...m, actif: false, motif: 'Audit' } : m)),
    });
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), 'Audit');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));
    expect(await screen.findByRole('switch', { name: 'Module CRM', checked: false })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Modules de Grey Concrete' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marque aussi « Coupé » les fonctions du catalogue après avoir coupé leur module', async () => {
    basculer.mockResolvedValue({
      ...ETAT,
      modules: ETAT.modules.map((m) => (m.cle === 'crm' ? { ...m, actif: false, motif: 'x' } : m)),
    });
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), 'Audit');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));
    await screen.findByRole('switch', { name: 'Module CRM', checked: false });
    const commercial = screen.getByRole('region', { name: 'Commercial' });
    expect(within(commercial).getAllByText('Coupé')).toHaveLength(2);
  });

  it('garde la fenêtre ouverte et affiche l’erreur du serveur si la bascule échoue', async () => {
    basculer.mockRejectedValue(new ApiError('Ce module ne peut pas être coupé.', 409));
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), 'Audit');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));

    expect(await within(d).findByRole('alert')).toHaveTextContent('Ce module ne peut pas être coupé.');
    expect(within(d).getByRole('button', { name: 'Couper le module' })).toBeEnabled();
    expect(interrupteur('Module CRM')).toHaveAttribute('aria-checked', 'true');
  });

  it('affiche un message générique si la bascule échoue sans réponse du serveur', async () => {
    basculer.mockRejectedValue(new TypeError('Failed to fetch'));
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), 'Audit');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));
    expect(await within(d).findByRole('alert')).toHaveTextContent(
      'La modification n’a pas été enregistrée. Rien n’a changé ; réessayez dans un instant.',
    );
  });

  it('réactive un module coupé avec le motif saisi', async () => {
    basculer.mockResolvedValue({
      ...ETAT,
      modules: ETAT.modules.map((m) =>
        m.cle === 'finances' ? { ...m, actif: true, desactiveLe: null, motif: null } : m,
      ),
    });
    await afficher();
    await userEvent.click(interrupteur('Module Finances'));
    const d = fenetre('Réactiver le module Finances');
    expect(within(d).getByText('Aucun compte n’y accède aujourd’hui par son rôle.')).toBeInTheDocument();
    await userEvent.type(champMotif(d), 'Clôture terminée');
    await userEvent.click(within(d).getByRole('button', { name: 'Réactiver le module' }));

    expect(basculer).toHaveBeenCalledWith(SLUG, 'finances', true, 'Clôture terminée');
    expect(await screen.findByRole('switch', { name: 'Module Finances', checked: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('referme la fenêtre sans rien envoyer sur « Annuler »', async () => {
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    await userEvent.click(within(fenetre('Couper le module CRM')).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(basculer).not.toHaveBeenCalled();
  });

  it('ne se referme pas avec Échap pendant l’envoi', async () => {
    basculer.mockReturnValue(new Promise(() => {}));
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), 'Audit');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));
    expect(within(d).getByRole('button', { name: 'Coupure…' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Couper le module CRM' })).toBeInTheDocument();
  });
});

describe('ModulesPanel · maintenance du HUB', () => {
  it('montre un aperçu avec le message par défaut, puis avec le message saisi', async () => {
    await afficher();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer pour maintenance' }));
    const d = fenetre('Fermer le HUB pour maintenance');
    expect(within(d).getByText('Le HUB est en maintenance. Réessayez plus tard.')).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText('Message affiché aux comptes'), 'Retour vers 14 h');
    expect(within(d).getByText('Retour vers 14 h')).toBeInTheDocument();
    expect(within(d).queryByText('Le HUB est en maintenance. Réessayez plus tard.')).not.toBeInTheDocument();
  });

  it('ferme le HUB avec le message et le motif, puis affiche l’état fermé', async () => {
    maintenance.mockResolvedValue({ ...ETAT, maintenance: { actif: true, message: 'Retour vers 14 h', depuis: null } });
    await afficher();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer pour maintenance' }));
    const d = fenetre('Fermer le HUB pour maintenance');
    await userEvent.type(within(d).getByLabelText('Message affiché aux comptes'), ' Retour vers 14 h ');
    await userEvent.type(champMotif(d), 'Mise à jour');
    await userEvent.click(within(d).getByRole('button', { name: 'Fermer le HUB' }));

    expect(maintenance).toHaveBeenCalledWith(SLUG, true, 'Retour vers 14 h', 'Mise à jour');
    expect(await screen.findByRole('heading', { name: 'Le HUB est fermé pour maintenance' })).toBeInTheDocument();
    expect(screen.getByText('« Retour vers 14 h »')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rouvre le HUB sans demander de message, en gardant celui en place', async () => {
    chargerEtat.mockResolvedValue({ ...ETAT, maintenance: { actif: true, message: 'Retour vers 14 h', depuis: null } });
    maintenance.mockResolvedValue(ETAT);
    await afficher();
    await userEvent.click(screen.getByRole('button', { name: 'Rouvrir le HUB' }));
    const d = fenetre('Rouvrir le HUB');
    expect(within(d).queryByLabelText('Message affiché aux comptes')).not.toBeInTheDocument();
    await userEvent.type(champMotif(d), 'Mise à jour terminée');
    await userEvent.click(within(d).getByRole('button', { name: 'Rouvrir le HUB' }));

    expect(maintenance).toHaveBeenCalledWith(SLUG, false, 'Retour vers 14 h', 'Mise à jour terminée');
    expect(await screen.findByRole('heading', { name: 'Le HUB est ouvert' })).toBeInTheDocument();
  });
});

describe('ModulesPanel · catalogue du HUB', () => {
  // Fonctions affichées, famille par famille (régions nommées d'après la famille).
  const fonctions = () =>
    CATALOGUE.familles
      .flatMap((f) => screen.queryAllByRole('region', { name: f.nom }))
      .flatMap((r) => within(r).queryAllByRole('listitem'))
      .map((li) => li.querySelector('.mod-fonction-nom')?.firstChild?.textContent);

  it('liste toutes les fonctions par famille, avec les compteurs de chaque filtre', async () => {
    await afficher();
    const filtres = screen.getByRole('group', { name: 'Filtrer le catalogue' });
    expect(within(filtres).getByRole('button', { name: 'Tous (5)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filtres).getByRole('button', { name: 'En service (2)' })).toBeInTheDocument();
    expect(within(filtres).getByRole('button', { name: 'En partie (2)' })).toBeInTheDocument();
    expect(within(filtres).getByRole('button', { name: 'À venir (1)' })).toBeInTheDocument();
    expect(fonctions()).toEqual(['Registre CRM', 'Offres', 'Factures', 'Paie', 'Agenda']);
    expect(screen.getByText('au premier trimestre')).toBeInTheDocument();
  });

  it('marque « Coupé » une fonction dont le module est coupé', async () => {
    await afficher();
    const gestion = screen.getByRole('region', { name: 'Gestion' });
    const factures = within(gestion).getByText('Factures').closest('li')!;
    expect(within(factures).getByText('Coupé')).toBeInTheDocument();
    expect(within(within(gestion).getByText('Paie').closest('li')!).queryByText('Coupé')).not.toBeInTheDocument();
  });

  it('filtre les fonctions en service, en partie ou à venir, et masque les familles vides', async () => {
    await afficher();
    const filtres = screen.getByRole('group', { name: 'Filtrer le catalogue' });

    await userEvent.click(within(filtres).getByRole('button', { name: 'En service (2)' }));
    expect(within(filtres).getByRole('button', { name: 'En service (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filtres).getByRole('button', { name: 'Tous (5)' })).toHaveAttribute('aria-pressed', 'false');
    expect(fonctions()).toEqual(['Registre CRM', 'Factures']);

    await userEvent.click(within(filtres).getByRole('button', { name: 'En partie (2)' }));
    expect(fonctions()).toEqual(['Offres', 'Paie']);

    await userEvent.click(within(filtres).getByRole('button', { name: 'À venir (1)' }));
    expect(fonctions()).toEqual(['Agenda']);
    expect(screen.queryByRole('region', { name: 'Commercial' })).not.toBeInTheDocument();

    await userEvent.click(within(filtres).getByRole('button', { name: 'Tous (5)' }));
    expect(fonctions()).toHaveLength(5);
  });

  it('dit qu’aucune fonction n’a ce statut quand le filtre ne garde rien', async () => {
    chargerCatalogue.mockResolvedValue({ familles: [CATALOGUE.familles[0]] });
    await afficher();
    await userEvent.click(screen.getByRole('button', { name: 'À venir (0)' }));
    expect(screen.getByText('Aucune fonction avec ce statut.')).toBeInTheDocument();
  });
});

describe('ModulesPanel · lectures en échec', () => {
  it('s’affiche sans l’impact si la matrice des droits ne se lit pas', async () => {
    chargerMatrice.mockRejectedValue(new ApiError('Accès refusé', 403));
    await afficher();
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(screen.queryByText(/y accèdent|n’y accède/)).not.toBeInTheDocument();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    expect(within(d).queryByText(/Accès retiré/)).not.toBeInTheDocument();
    expect(within(d).getByText('Concerne : Registre CRM, Offres')).toBeInTheDocument();
  });

  it('s’affiche sans l’impact si les comptes du groupe ne se lisent pas', async () => {
    chargerComptes.mockRejectedValue(new Error('réseau coupé'));
    await afficher();
    expect(screen.queryByText(/y accèdent|n’y accède/)).not.toBeInTheDocument();
  });

  it('s’affiche sans l’impact si la société n’est pas parmi les comptes du groupe', async () => {
    chargerComptes.mockResolvedValue({ societes: [COMPTES.societes[0]] });
    await afficher();
    expect(screen.queryByText(/y accèdent|n’y accède/)).not.toBeInTheDocument();
  });

  it('s’affiche sans historique si le journal d’audit ne se lit pas', async () => {
    chargerJournal.mockRejectedValue(new ApiError('Accès refusé', 403));
    await afficher();
    // Sans journal : la date de coupure seule, et le motif.
    expect(within(carte('Finances')).getByText('le 03/11/2026')).toBeInTheDocument();
    expect(within(carte('Finances')).getByText('« Clôture comptable »')).toBeInTheDocument();
    expect(await within(carte('CRM')).findByText('2 comptes y accèdent')).toBeInTheDocument();
    // Plus de dernière bascule des modules ; celle de la maintenance vient du serveur.
    expect(screen.queryByText(/ à \d\d:\d\d par /, { selector: '.mod-carte *' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Réactivé le/)).not.toBeInTheDocument();
    expect(screen.getByText('Rouvert le 02/11/2026 à 18:30 par Awa Sarr')).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur et un bouton « Réessayer » si les interrupteurs ne se lisent pas', async () => {
    chargerEtat.mockRejectedValueOnce(new ApiError('Réservé à l’Administrateur HUB.', 403));
    render(<ModulesPanel slug={SLUG} societe="Grey Concrete" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Réservé à l’Administrateur HUB.');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('heading', { name: 'Modules de Grey Concrete' })).toBeInTheDocument();
    expect(chargerEtat).toHaveBeenCalledTimes(2);
  });

  it('affiche un message générique si le catalogue ne se lit pas sans réponse du serveur', async () => {
    chargerCatalogue.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ModulesPanel slug={SLUG} societe="Grey Concrete" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Les modules n’ont pas pu être chargés. Vérifiez votre connexion, puis réessayez.',
    );
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('ModulesPanel · accessibilité et messages', () => {
  it('place le focus dans la fenêtre, puis le rend à l’interrupteur à la fermeture', async () => {
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    expect(champMotif(d)).toHaveFocus();
    await userEvent.click(within(d).getByRole('button', { name: 'Annuler' }));
    await new Promise((r) => requestAnimationFrame(r));
    expect(interrupteur('Module CRM')).toHaveFocus();
  });

  it('place le focus sur le message quand on ferme le HUB', async () => {
    await afficher();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer pour maintenance' }));
    const d = fenetre('Fermer le HUB pour maintenance');
    expect(within(d).getByLabelText('Message affiché aux comptes')).toHaveFocus();
  });

  it('relie l’aide du motif au champ', async () => {
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    expect(champMotif(fenetre('Couper le module CRM'))).toHaveAccessibleDescription(
      'Obligatoire, 3 caractères au moins. Inscrit au journal d’audit.',
    );
  });

  it('annonce la bascule faite aux lecteurs d’écran', async () => {
    basculer.mockResolvedValue({
      ...ETAT,
      modules: ETAT.modules.map((m) => (m.cle === 'crm' ? { ...m, actif: false, motif: 'Audit' } : m)),
    });
    await afficher();
    await userEvent.click(interrupteur('Module CRM'));
    const d = fenetre('Couper le module CRM');
    await userEvent.type(champMotif(d), 'Audit');
    await userEvent.click(within(d).getByRole('button', { name: 'Couper le module' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Module CRM coupé pour Grey Concrete.');
  });

  it('ne montre pas le texte brut d’une panne du serveur', async () => {
    chargerEtat.mockRejectedValueOnce(new ApiError('Internal server error', 500));
    render(<ModulesPanel slug={SLUG} societe="Grey Concrete" />);
    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Les modules n’ont pas pu être chargés.');
    expect(alerte).not.toHaveTextContent('Internal server error');
  });

  it('ne répète pas le nom du module dans ce qu’il couvre', async () => {
    chargerCatalogue.mockResolvedValue({
      familles: [
        {
          nom: 'Personnes',
          modules: [{ nom: 'RH', statut: 'en_service', note: null, module: { cle: 'rh', actif: true } }],
        },
      ],
    });
    await afficher();
    expect(within(carte('RH')).getAllByText('RH')).toHaveLength(1);
  });
});
