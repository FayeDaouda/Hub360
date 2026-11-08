import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmLeave, useUnsavedChangesGuard } from './unsaved-changes-guard';

// Routeur stable : la garde le met dans les dépendances de son effet.
// Navigation : push, ou replace quand la sentinelle d'historique de la garde
// est en tête (leaveTo) — les deux sont une sortie de l'écran.
const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const navigations = () => [...routeur.push.mock.calls, ...routeur.replace.mock.calls];
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

// Écran d'essai : quelques liens et la fenêtre renvoyée par la garde.
function Ecran({
  enAttente,
  enregistrer = vi.fn().mockResolvedValue(true),
}: {
  enAttente: number;
  enregistrer?: () => Promise<true | string>;
}) {
  const fenetre = useUnsavedChangesGuard({
    pending: enAttente,
    description: `${enAttente} cases modifiées`,
    save: enregistrer,
  });
  return (
    <main>
      {/* Balises <a> brutes voulues : la garde doit intercepter tout lien interne (next/link en rend une). */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/admin/grey-concrete/crm?vue=registre#haut">CRM</a>
      <a href="https://exemple.com/ailleurs">Site externe</a>
      <a href="//exemple.com/admin/grey-concrete">Autre site sans protocole</a>
      <a href="/admin/grey-concrete/finances" target="_blank" rel="noreferrer">
        Finances (nouvel onglet)
      </a>
      <a href="/admin/grey-concrete/export.csv" download>
        Exporter
      </a>
      <a href="#section">Ancre de la page</a>
      {fenetre}
    </main>
  );
}

// Adresse transmise au routeur : même origine et bon chemin (le routeur accepte
// un chemin ou une adresse absolue de même origine).
function destination(appel = 0) {
  const url = new URL(navigations()[appel][0] as string, window.location.href);
  expect(url.origin).toBe(window.location.origin);
  return url.pathname + url.search + url.hash;
}
const CIBLE_CRM = '/admin/grey-concrete/crm?vue=registre#haut';

const fenetre = () => screen.queryByRole('alertdialog', { name: 'Modifications non enregistrées' });

// Clics laissés passer par la garde : ceux dont la navigation n'a pas été
// empêchée à la capture (la garde fait seulement preventDefault, pour que les
// gestionnaires du lien — fermer un menu — s'exécutent). On empêche ensuite
// la navigation par défaut, que jsdom ne sait pas faire.
let clicsLaisses: string[] = [];
const enregistrerClic = (e: MouseEvent) => {
  const a = (e.target as Element).closest('a');
  if (a && !e.defaultPrevented) clicsLaisses.push(a.textContent ?? '');
  e.preventDefault();
};

beforeEach(() => {
  clicsLaisses = [];
  routeur.push.mockReset();
  routeur.replace.mockReset();
  // Pas de sentinelle d'un test précédent en tête de l'historique.
  window.history.replaceState(null, '', window.location.href);
  window.history.replaceState(null, '', '/admin/grey-concrete/droits');
  window.addEventListener('click', enregistrerClic);
});

afterEach(() => {
  window.removeEventListener('click', enregistrerClic);
});

describe('useUnsavedChangesGuard · sans changement en attente', () => {
  it('confirmLeave() résout true immédiatement', async () => {
    render(<Ecran enAttente={0} />);
    await expect(confirmLeave()).resolves.toBe(true);
    expect(fenetre()).not.toBeInTheDocument();
  });

  it('confirmLeave() résout true quand aucun écran gardé n’est monté', async () => {
    await expect(confirmLeave()).resolves.toBe(true);
  });

  it('n’intercepte aucun clic sur un lien interne', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={0} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    expect(clicsLaisses).toEqual(['CRM']);
    expect(fenetre()).not.toBeInTheDocument();
    expect(navigations()).toHaveLength(0);
  });

  it('cesse de garder quand les changements sont enregistrés ou annulés (enAttente revient à 0)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Ecran enAttente={3} />);
    rerender(<Ecran enAttente={0} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    expect(clicsLaisses).toEqual(['CRM']);
    expect(fenetre()).not.toBeInTheDocument();
    await expect(confirmLeave()).resolves.toBe(true);
  });

  it('cesse de garder quand l’écran est démonté', async () => {
    const { unmount } = render(<Ecran enAttente={3} />);
    unmount();
    await expect(confirmLeave()).resolves.toBe(true);
  });
});

describe('useUnsavedChangesGuard · clic sur un lien interne avec des changements en attente', () => {
  it('bloque la navigation et ouvre la fenêtre « Modifications non enregistrées »', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    expect(clicsLaisses).toEqual([]);
    expect(fenetre()).toBeInTheDocument();
    expect(fenetre()).toHaveAccessibleDescription(/3 cases modifiées ne sont pas encore enregistrées/);
    expect(navigations()).toHaveLength(0);
  });

  it('accorde le message au singulier pour un seul changement', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={1} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    expect(fenetre()).toHaveAccessibleDescription(/n’est pas encore enregistrée/);
  });

  it('place le focus sur « Enregistrer et continuer » à l’ouverture', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    expect(screen.getByRole('button', { name: 'Enregistrer et continuer' })).toHaveFocus();
  });

  it('« Rester sur la page » ferme la fenêtre sans naviguer', async () => {
    const user = userEvent.setup();
    const enregistrer = vi.fn().mockResolvedValue(true);
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Rester sur la page' }));
    expect(fenetre()).not.toBeInTheDocument();
    expect(navigations()).toHaveLength(0);
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('Échap équivaut à « Rester sur la page »', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.keyboard('{Escape}');
    expect(fenetre()).not.toBeInTheDocument();
    expect(navigations()).toHaveLength(0);
  });

  it('la croix « Fermer » équivaut à « Rester sur la page »', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(fenetre()).not.toBeInTheDocument();
    expect(navigations()).toHaveLength(0);
  });

  it('« Quitter sans enregistrer » navigue vers le chemin du lien (avec paramètres et ancre), sans enregistrer', async () => {
    const user = userEvent.setup();
    const enregistrer = vi.fn().mockResolvedValue(true);
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Quitter sans enregistrer' }));
    expect(fenetre()).not.toBeInTheDocument();
    expect(navigations()).toHaveLength(1);
    expect(navigations()).toHaveLength(1);
    expect(destination()).toBe(CIBLE_CRM);
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('« Enregistrer et continuer » enregistre puis navigue quand l’enregistrement réussit', async () => {
    const user = userEvent.setup();
    const enregistrer = vi.fn().mockResolvedValue(true);
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    expect(enregistrer).toHaveBeenCalledTimes(1);
    expect(navigations()).toHaveLength(1);
    expect(destination()).toBe(CIBLE_CRM);
    expect(fenetre()).not.toBeInTheDocument();
  });

  it('« Enregistrer et continuer » affiche le message d’erreur et reste quand l’enregistrement échoue', async () => {
    const user = userEvent.setup();
    const enregistrer = vi.fn().mockResolvedValue('L’enregistrement a échoué (403).');
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    expect(enregistrer).toHaveBeenCalledTimes(1);
    expect(fenetre()).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('L’enregistrement a échoué');
    expect(navigations()).toHaveLength(0);
    // Les boutons redeviennent utilisables pour réessayer ou rester.
    expect(screen.getByRole('button', { name: 'Enregistrer et continuer' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Rester sur la page' }));
    expect(fenetre()).not.toBeInTheDocument();
  });

  it('« Enregistrer et continuer » traite une exception comme un échec (erreur affichée, on reste)', async () => {
    const user = userEvent.setup();
    const enregistrer = vi.fn().mockRejectedValue(new Error('réseau coupé'));
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('L’enregistrement a échoué');
    expect(navigations()).toHaveLength(0);
  });

  it('pendant l’enregistrement, désactive les trois choix et ignore Échap', async () => {
    const user = userEvent.setup();
    let terminer: (ok: true | string) => void = () => {};
    const enregistrer = vi.fn(() => new Promise<true | string>((r) => (terminer = r)));
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rester sur la page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitter sans enregistrer' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(fenetre()).toBeInTheDocument();
    await act(async () => terminer(true));
    expect(navigations()).toHaveLength(1);
    expect(destination()).toBe(CIBLE_CRM);
  });
});

describe('useUnsavedChangesGuard · clics laissés passer malgré des changements en attente', () => {
  it.each([
    ['un lien externe (autre origine)', 'Site externe'],
    ['un lien « //autre-site » (relatif au protocole, autre origine)', 'Autre site sans protocole'],
    ['un lien qui s’ouvre dans un nouvel onglet (target=_blank)', 'Finances (nouvel onglet)'],
    ['un lien de téléchargement', 'Exporter'],
    ['une ancre de la même page', 'Ancre de la page'],
  ])('n’intercepte pas %s', async (_cas, libelle) => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    await user.click(screen.getByRole('link', { name: libelle }));
    expect(clicsLaisses).toEqual([libelle]);
    expect(fenetre()).not.toBeInTheDocument();
    expect(navigations()).toHaveLength(0);
  });

  it.each([
    ['Ctrl', 'Control'],
    ['Cmd', 'Meta'],
    ['Maj', 'Shift'],
  ])('n’intercepte pas un %s-clic sur un lien interne (ouverture ailleurs)', async (_touche, code) => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    await user.keyboard(`{${code}>}`);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.keyboard(`{/${code}}`);
    expect(clicsLaisses).toEqual(['CRM']);
    expect(fenetre()).not.toBeInTheDocument();
  });
});

describe('demanderSortie · avec des changements en attente', () => {
  it('ouvre la fenêtre et résout false si l’on reste', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    let reponse!: Promise<boolean>;
    act(() => {
      reponse = confirmLeave();
    });
    expect(fenetre()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rester sur la page' }));
    await expect(reponse).resolves.toBe(false);
    expect(navigations()).toHaveLength(0);
  });

  it('résout true si l’on quitte sans enregistrer (sans naviguer elle-même)', async () => {
    const user = userEvent.setup();
    const enregistrer = vi.fn().mockResolvedValue(true);
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    let reponse!: Promise<boolean>;
    act(() => {
      reponse = confirmLeave();
    });
    await user.click(screen.getByRole('button', { name: 'Quitter sans enregistrer' }));
    await expect(reponse).resolves.toBe(true);
    expect(enregistrer).not.toHaveBeenCalled();
    expect(navigations()).toHaveLength(0);
  });

  it('résout true après « Enregistrer et continuer » réussi', async () => {
    const user = userEvent.setup();
    const enregistrer = vi.fn().mockResolvedValue(true);
    render(<Ecran enAttente={3} enregistrer={enregistrer} />);
    let reponse!: Promise<boolean>;
    act(() => {
      reponse = confirmLeave();
    });
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    await expect(reponse).resolves.toBe(true);
    expect(enregistrer).toHaveBeenCalledTimes(1);
  });

  it('résout false sur Échap', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={3} />);
    let reponse!: Promise<boolean>;
    act(() => {
      reponse = confirmLeave();
    });
    await user.keyboard('{Escape}');
    expect(fenetre()).not.toBeInTheDocument();
    await expect(reponse).resolves.toBe(false);
  });
});

describe('useUnsavedChangesGuard · gestionnaires du lien', () => {
  it('le lien intercepté exécute encore son propre onClick (un menu se referme), sans naviguer avant la réponse', async () => {
    const user = userEvent.setup();
    const fermerMenu = vi.fn();
    function EcranMenu() {
      const fenetre = useUnsavedChangesGuard({ pending: 2, description: '2 cases modifiées', save: vi.fn() });
      return (
        <main>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin/grey-concrete/crm" onClick={fermerMenu}>
            CRM du menu
          </a>
          {fenetre}
        </main>
      );
    }
    render(<EcranMenu />);
    await user.click(screen.getByRole('link', { name: 'CRM du menu' }));
    expect(fermerMenu).toHaveBeenCalledTimes(1);
    expect(fenetre()).toBeInTheDocument();
    expect(navigations()).toHaveLength(0);
  });
});

describe('useUnsavedChangesGuard · bouton Précédent', () => {
  it('pose une entrée sentinelle tant que des changements sont en attente, et la retire ensuite', () => {
    const avant = window.history.length;
    const { rerender } = render(<Ecran enAttente={2} />);
    expect(window.history.state?.hubUnsaved).toBe(true);
    expect(window.history.length).toBe(avant + 1);
    const retour = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    rerender(<Ecran enAttente={0} />);
    // Plus rien en attente : la sentinelle (en tête) est retirée par un retour.
    expect(retour).toHaveBeenCalledTimes(1);
    retour.mockRestore();
  });

  it('quitter par un lien quand la sentinelle est en tête la remplace (pas d’entrée orpheline)', async () => {
    const user = userEvent.setup();
    render(<Ecran enAttente={2} />);
    await user.click(screen.getByRole('link', { name: 'CRM' }));
    await user.click(screen.getByRole('button', { name: 'Quitter sans enregistrer' }));
    expect(routeur.replace).toHaveBeenCalledTimes(1);
    expect(routeur.push).not.toHaveBeenCalled();
  });
});
