import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changerActifCompte, changerRoleCompte, getComptesGroupe } from '@/lib/groupe';
import type { CompteGroupe, SocieteComptes } from '@/lib/types';
import { ComptesRolesPanel } from './comptes-roles-panel';

// API mockée ; libelleRole et comparerRoles restent les vrais (libellés et
// ordre affichés).
vi.mock('@/lib/groupe', async () => {
  const reel = await vi.importActual<typeof import('@/lib/groupe')>('@/lib/groupe');
  return {
    libelleRole: reel.libelleRole,
    comparerRoles: reel.comparerRoles,
    getComptesGroupe: vi.fn(),
    changerActifCompte: vi.fn(),
    changerRoleCompte: vi.fn(),
    couperSessionsCompte: vi.fn(),
    creerCompte: vi.fn(),
    debloquerCompte: vi.fn(),
    envoyerReinitialisationCompte: vi.fn(),
    reinitialiserDoubleFacteur: vi.fn(),
    renvoyerInvitation: vi.fn(),
  };
});

const confirmer = vi.fn<(demande: unknown) => Promise<boolean>>();
vi.mock('@/components/confirmation', () => ({ useConfirmer: () => confirmer }));

const charger = vi.mocked(getComptesGroupe);
const changerActif = vi.mocked(changerActifCompte);

// Horloge figée (seule Date est simulée : userEvent garde ses vrais minuteurs).
const MAINTENANT = new Date('2026-11-07T10:00:00Z');

const compte = (maj: Partial<CompteGroupe> & { id: string; prenom: string; nom: string }): CompteGroupe => ({
  email: `${maj.prenom.toLowerCase()}.${maj.nom.toLowerCase()}@greyconcrete.hub`,
  statut: 'actif',
  role: { id: 'R-SAL', nom: 'Salarié' },
  administration: false,
  doubleFacteur: false,
  verrouilleJusquau: null,
  ...maj,
});

const MOI = compte({ id: 'U-MOI', prenom: 'Awa', nom: 'Sarr', role: { id: 'R-CIO', nom: 'CIO (transverse)' } });
const ADMIN = compte({
  id: 'U-ADM',
  prenom: 'Admin',
  nom: 'Groupe',
  role: { id: 'R-HOLD', nom: 'holding_admin' },
  administration: true,
});
// Actif, 2FA, verrouillé jusqu'à 12 h 30 (heure de Dakar = UTC).
const FATOU = compte({
  id: 'U-FAT',
  prenom: 'Fatou',
  nom: 'Diop',
  role: { id: 'R-COO', nom: 'COO' },
  doubleFacteur: true,
  verrouilleJusquau: '2026-11-07T12:30:00Z',
});
const AMINATA = compte({ id: 'U-AMI', prenom: 'Aminata', nom: 'Ba', role: { id: 'R-DIR', nom: 'Dir. GC' } });
const MOUSSA = compte({ id: 'U-MOU', prenom: 'Moussa', nom: 'Ndiaye', statut: 'en_attente' });
// Désactivé, verrouillage expiré.
const IBRAHIMA = compte({
  id: 'U-IBR',
  prenom: 'Ibrahima',
  nom: 'Fall',
  statut: 'desactive',
  verrouilleJusquau: '2026-11-07T09:00:00Z',
});

const societe = (comptes: CompteGroupe[]): SocieteComptes => ({
  id: 'S-GC',
  nom: 'Grey Concrete',
  slug: 'grey-concrete',
  rolesAttribuables: [
    { id: 'R-SAL', nom: 'Salarié', transverse: false },
    { id: 'R-COO', nom: 'COO', transverse: false },
    { id: 'R-DIR', nom: 'Dir. GC', transverse: false },
    { id: 'R-CEO', nom: 'CEO (transverse)', transverse: true },
  ],
  comptes,
  dossiersSansCompte: [],
  cellules: [],
});

const TOUS = [MOI, ADMIN, FATOU, AMINATA, MOUSSA, IBRAHIMA];

async function afficher(comptes: CompteGroupe[] = TOUS) {
  charger.mockResolvedValue({ societes: [societe(comptes)] });
  render(<ComptesRolesPanel moiId="U-MOI" />);
  await screen.findByRole('table');
}

// Tuile-filtre : bouton aria-pressed dont le nom commence par son libellé.
const tuile = (libelle: string) => screen.getByRole('button', { name: new RegExp(`^${libelle}`) });
const valeurTuile = (libelle: string) => tuile(libelle).querySelector('.kpi-tuile-valeur')?.textContent;
// Comptes affichés, repérés par leur e-mail (cellule « Personne »).
const emailsAffiches = () =>
  [...document.querySelectorAll('tbody .groupe-email')].map((e) => e.textContent).filter(Boolean);
const boutonActions = (c: CompteGroupe) => screen.queryByRole('button', { name: `Actions pour ${c.prenom} ${c.nom}` });

async function ouvrirMenu(c: CompteGroupe) {
  const bouton = boutonActions(c)!;
  await userEvent.click(bouton);
  const liste = document.getElementById(bouton.getAttribute('aria-controls')!)!;
  return within(liste)
    .getAllByRole('button')
    .map((b) => b.textContent);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ComptesRolesPanel — tuiles de statut', () => {
  it('affiche les 5 tuiles avec le nombre de comptes de chaque statut', async () => {
    await afficher();
    expect(valeurTuile('Tous')).toBe('6');
    expect(valeurTuile('Actifs')).toBe('4');
    expect(valeurTuile('En attente')).toBe('1');
    expect(valeurTuile('Verrouillés')).toBe('1');
    expect(valeurTuile('Désactivés')).toBe('1');
    expect(document.querySelectorAll('.kpi-tuile')).toHaveLength(5);
  });

  it('n’affiche plus la tuile « Rôles de direction »', async () => {
    await afficher();
    expect(screen.queryByText(/Rôles de direction/)).not.toBeInTheDocument();
  });

  it('un clic sur « Invitations en attente » filtre la liste, un second clic revient à tous', async () => {
    await afficher();
    expect(tuile('En attente')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(tuile('En attente'));
    expect(tuile('En attente')).toHaveAttribute('aria-pressed', 'true');
    expect(emailsAffiches()).toEqual([MOUSSA.email]);
    expect(document.querySelector('.groupe-compteur')).toHaveTextContent('1 compte sur 6');

    await userEvent.click(tuile('En attente'));
    expect(tuile('En attente')).toHaveAttribute('aria-pressed', 'false');
    expect(emailsAffiches()).toHaveLength(6);
  });

  it('la tuile « Verrouillés » ne garde que les verrouillages encore en cours', async () => {
    await afficher();
    await userEvent.click(tuile('Verrouillés'));
    expect(emailsAffiches()).toEqual([FATOU.email]);
  });

  it('une tuile sans compte affiche le message vide du statut et « Effacer les filtres »', async () => {
    await afficher([AMINATA, FATOU]);
    await userEvent.click(tuile('Désactivés'));
    expect(screen.getByText('Aucun compte désactivé.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(emailsAffiches()).toHaveLength(2);
  });
});

describe('ComptesRolesPanel — recherche et filtre par rôle', () => {
  it('la recherche filtre sur le nom, sans tenir compte de la casse', async () => {
    await afficher();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un compte' }), 'DIOP');
    expect(emailsAffiches()).toEqual([FATOU.email]);
  });

  it('la recherche trouve aussi le libellé lisible du rôle', async () => {
    await afficher();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un compte' }), 'administration groupe');
    expect(emailsAffiches()).toEqual([ADMIN.email]);
  });

  it('le filtre par rôle ne propose que les rôles portés et filtre la liste', async () => {
    await afficher();
    const select = screen.getByRole('combobox', { name: 'Filtrer par rôle' });
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Tous les rôles', 'Dir. GC', 'COO', 'Salarié', 'CIO', 'Administration groupe']);
    await userEvent.selectOptions(select, 'Salarié');
    expect(emailsAffiches()).toEqual([MOUSSA.email, IBRAHIMA.email]);
  });

  it('sans résultat : message dédié et « Effacer les filtres » qui remet tout à zéro', async () => {
    await afficher();
    const recherche = screen.getByRole('searchbox', { name: 'Rechercher un compte' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrer par rôle' }), 'COO');
    await userEvent.type(recherche, 'introuvable');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Aucun compte ne correspond à ces critères.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(recherche).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Filtrer par rôle' })).toHaveValue('');
    expect(emailsAffiches()).toHaveLength(6);
  });
});

describe('ComptesRolesPanel — lignes en lecture seule', () => {
  it('la ligne de la personne connectée n’a pas de menu d’actions', async () => {
    await afficher();
    expect(screen.getByText('Vous')).toBeInTheDocument();
    expect(boutonActions(MOI)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Rôle de Awa Sarr' })).not.toBeInTheDocument();
  });

  it('un compte d’administration n’a pas de menu d’actions', async () => {
    await afficher();
    expect(boutonActions(ADMIN)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Rôle de Admin Groupe' })).not.toBeInTheDocument();
  });

  it('les autres comptes ont leur menu et leur liste de rôles', async () => {
    await afficher();
    expect(boutonActions(AMINATA)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rôle de Aminata Ba' })).toHaveValue('R-DIR');
  });
});

describe('ComptesRolesPanel — menu d’un compte actif', () => {
  it('propose le lien de mot de passe, la coupure des sessions, puis Désactiver en dernier', async () => {
    await afficher();
    expect(await ouvrirMenu(AMINATA)).toEqual([
      'Envoyer un lien de mot de passe',
      'Couper les sessions',
      'Désactiver le compte',
    ]);
    const desactiver = screen.getByRole('button', { name: 'Désactiver le compte' });
    expect(desactiver).toHaveClass('menu-actions-danger');
    expect(desactiver.closest('li')).toHaveClass('menu-actions-separee');
  });

  it('« Désactiver » confirmé appelle changerActifCompte(id, false) et met la ligne à jour', async () => {
    confirmer.mockResolvedValue(true);
    changerActif.mockResolvedValue({ id: AMINATA.id, statut: 'desactive' });
    await afficher();
    await ouvrirMenu(AMINATA);
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte' }));

    expect(confirmer).toHaveBeenCalledWith(expect.objectContaining({ danger: true, confirmer: 'Désactiver' }));
    expect(changerActif).toHaveBeenCalledWith('U-AMI', false);
    expect(await screen.findByText('Compte désactivé')).toBeInTheDocument();
    expect(valeurTuile('Désactivés')).toBe('2');
    expect(await ouvrirMenu(AMINATA)).toEqual(['Réactiver le compte']);
  });

  it('« Désactiver » refusé n’appelle pas le serveur', async () => {
    confirmer.mockResolvedValue(false);
    await afficher();
    await ouvrirMenu(AMINATA);
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte' }));

    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(changerActif).not.toHaveBeenCalled();
    expect(valeurTuile('Désactivés')).toBe('1');
  });

  it('un échec du serveur s’affiche sur la ligne', async () => {
    confirmer.mockResolvedValue(true);
    changerActif.mockRejectedValue(new Error('réseau coupé'));
    await afficher();
    await ouvrirMenu(AMINATA);
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte' }));
    expect(
      await screen.findByText('L’action n’a pas abouti. Vérifiez votre connexion, puis réessayez.'),
    ).toBeInTheDocument();
    expect(valeurTuile('Désactivés')).toBe('1');
  });
});

describe('ComptesRolesPanel — menu selon le statut', () => {
  it('un compte désactivé ne propose que « Réactiver le compte »', async () => {
    changerActif.mockResolvedValue({ id: IBRAHIMA.id, statut: 'actif' });
    await afficher();
    expect(await ouvrirMenu(IBRAHIMA)).toEqual(['Réactiver le compte']);
    await userEvent.click(screen.getByRole('button', { name: 'Réactiver le compte' }));
    expect(confirmer).not.toHaveBeenCalled();
    expect(changerActif).toHaveBeenCalledWith('U-IBR', true);
  });

  it('une invitation en attente propose « Renvoyer l’invitation »', async () => {
    await afficher();
    expect(await ouvrirMenu(MOUSSA)).toEqual(['Renvoyer l’invitation']);
  });
});

describe('ComptesRolesPanel — déblocage', () => {
  it('propose « Débloquer » quand le verrouillage court encore', async () => {
    await afficher();
    const libelles = await ouvrirMenu(FATOU);
    expect(libelles).toContain('Débloquer maintenant (verrouillé jusqu’à 12:30)');
    expect(libelles).toContain('Réinitialiser la double authentification');
    expect(libelles.at(-1)).toBe('Désactiver le compte');
  });

  it('ne propose pas « Débloquer » quand le verrouillage a expiré', async () => {
    await afficher();
    expect((await ouvrirMenu(IBRAHIMA)).some((l) => l?.startsWith('Débloquer'))).toBe(false);
  });

  it('ne propose pas « Débloquer » à un compte jamais verrouillé', async () => {
    await afficher();
    expect((await ouvrirMenu(AMINATA)).some((l) => l?.startsWith('Débloquer'))).toBe(false);
  });
});

describe('ComptesRolesPanel — ligne modifiée sous un filtre', () => {
  it('reste affichée avec son message jusqu’au prochain changement de filtre', async () => {
    changerActif.mockResolvedValue({ id: AMINATA.id, statut: 'desactive' });
    confirmer.mockResolvedValue(true);
    await afficher();
    await userEvent.click(tuile('Actifs'));
    expect(emailsAffiches()).toContain(AMINATA.email);

    await ouvrirMenu(AMINATA);
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte' }));
    expect(await screen.findByText('Compte désactivé')).toBeInTheDocument();
    // Désactivée, elle ne répond plus au filtre « Actifs » mais reste visible.
    expect(emailsAffiches()).toContain(AMINATA.email);

    // Changement de filtre : la liste redevient exacte.
    await userEvent.click(tuile('Actifs'));
    await userEvent.click(tuile('Actifs'));
    expect(emailsAffiches()).not.toContain(AMINATA.email);
  });
});

describe('ComptesRolesPanel — rôle filtré qui disparaît', () => {
  it('le filtre revient à « Tous les rôles » quand plus personne ne porte le rôle', async () => {
    vi.mocked(changerRoleCompte).mockResolvedValue({ ...AMINATA, role: { id: 'R-COO', nom: 'COO' } });
    confirmer.mockResolvedValue(true);
    await afficher();
    const filtre = screen.getByRole('combobox', { name: 'Filtrer par rôle' });
    await userEvent.selectOptions(filtre, 'Dir. GC');
    expect(emailsAffiches()).toEqual([AMINATA.email]);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rôle de Aminata Ba' }), 'R-COO');
    expect(await screen.findByText('Rôle mis à jour')).toBeInTheDocument();
    expect(changerRoleCompte).toHaveBeenCalledTimes(1);
    expect(changerRoleCompte).toHaveBeenCalledWith('U-AMI', 'S-GC', 'R-COO');
    // « Dir. GC » n'est plus porté : le filtre et la liste reviennent à tous.
    expect(filtre).toHaveValue('');
    expect(emailsAffiches()).toHaveLength(TOUS.length);
  });
});

describe('ComptesRolesPanel — confirmation du changement de rôle', () => {
  const selectRole = () => screen.getByRole('combobox', { name: 'Rôle de Aminata Ba' });

  it('annuler la confirmation n’appelle pas le serveur et garde l’ancien rôle', async () => {
    confirmer.mockResolvedValue(false);
    await afficher();
    await userEvent.selectOptions(selectRole(), 'R-SAL');
    expect(confirmer).toHaveBeenCalledWith(
      expect.objectContaining({ titre: 'Passer Aminata Ba de Dir. GC à Salarié ?', confirmer: 'Changer le rôle' }),
    );
    expect(changerRoleCompte).not.toHaveBeenCalled();
    expect(selectRole()).toHaveValue('R-DIR');
  });

  it('demande une confirmation en rouge pour un rôle de direction ou transverse', async () => {
    confirmer.mockResolvedValue(false);
    await afficher();
    await userEvent.selectOptions(selectRole(), 'R-CEO');
    expect(confirmer).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
  });

  it('demande aussi une confirmation en rouge pour un rôle de direction non transverse (COO)', async () => {
    confirmer.mockResolvedValue(false);
    await afficher();
    await userEvent.selectOptions(selectRole(), 'R-COO');
    expect(confirmer).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
  });

  it('demande une confirmation sobre pour passer en Salarié', async () => {
    confirmer.mockResolvedValue(false);
    await afficher();
    await userEvent.selectOptions(selectRole(), 'R-SAL');
    expect(confirmer).toHaveBeenCalledWith(expect.objectContaining({ danger: false }));
  });
});
