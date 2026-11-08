import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sectionAccessible } from '@/lib/acces-back-office';
import type { Session } from '@/lib/types';
import { NavigationConsole, NavigationConsoleMobile } from './console-navigation';
import { lienSection, type SectionConsole } from './console-sections';

vi.mock('@/lib/acces-back-office', () => ({ sectionAccessible: vi.fn() }));
const accessible = vi.mocked(sectionAccessible);

const SESSION: Session = {
  access_token: 'jeton',
  utilisateur: { id: 'U1', email: 'a@b.c', nom: 'Sarr', prenom: 'Awa' },
  societe: { id: 'S1', nom: 'Grey Concrete', slug: 'grey-concrete' },
  role: 'CIO',
  permissions: {},
};

const SECTIONS: [string, SectionConsole][] = [
  ['Comptes & rôles', 'comptes'],
  ['Droits des rôles', 'droits'],
  ['Modules', 'modules'],
  ['Journal d’audit', 'journal'],
  ['Déblocages', 'deblocages'],
];

beforeEach(() => {
  accessible.mockReset();
  accessible.mockReturnValue(true);
});

describe('NavigationConsole', () => {
  it('liste les 5 sections en liens vers leur adresse', () => {
    render(<NavigationConsole session={SESSION} active="comptes" />);
    const nav = screen.getByRole('navigation', { name: 'Sections de l’administration' });
    for (const [libelle, cle] of SECTIONS) {
      expect(within(nav).getByRole('link', { name: libelle })).toHaveAttribute('href', lienSection(cle));
    }
  });

  it('marque la seule section active avec aria-current="page"', () => {
    render(<NavigationConsole session={SESSION} active="journal" />);
    expect(screen.getByRole('link', { name: 'Journal d’audit' })).toHaveAttribute('aria-current', 'page');
    for (const [libelle, cle] of SECTIONS.filter(([, c]) => c !== 'journal')) {
      expect(screen.getByRole('link', { name: libelle }), cle).not.toHaveAttribute('aria-current');
    }
  });

  it('propose « Réglages du HUB » quand la section paramètres est accessible', () => {
    render(<NavigationConsole session={SESSION} active="comptes" />);
    expect(accessible).toHaveBeenCalledWith(SESSION, 'parametres');
    expect(screen.getByRole('link', { name: 'Réglages du HUB' })).toHaveAttribute(
      'href',
      '/admin/grey-concrete/reglages',
    );
  });

  it('masque « Réglages du HUB » quand la section paramètres n’est pas accessible', () => {
    accessible.mockReturnValue(false);
    render(<NavigationConsole session={SESSION} active="comptes" />);
    expect(screen.queryByRole('link', { name: 'Réglages du HUB' })).not.toBeInTheDocument();
  });

  it.each([true, false])('garde toujours le lien « Back-office <société> » (paramètres accessibles : %s)', (ok) => {
    accessible.mockReturnValue(ok);
    render(<NavigationConsole session={SESSION} active="comptes" />);
    expect(screen.getByRole('link', { name: 'Back-office Grey Concrete' })).toHaveAttribute(
      'href',
      '/admin/grey-concrete',
    );
  });
});

describe('NavigationConsoleMobile', () => {
  it('ouvre le panneau des sections au clic (aria-expanded false puis true)', async () => {
    render(<NavigationConsoleMobile session={SESSION} active="droits" />);
    const bouton = screen.getByRole('button', { name: 'Sections de l’administration' });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(bouton);

    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    const panneau = screen.getByRole('dialog', { name: 'Sections de l’administration' });
    for (const [libelle, cle] of SECTIONS) {
      expect(within(panneau).getByRole('link', { name: libelle })).toHaveAttribute('href', lienSection(cle));
    }
    expect(within(panneau).getByRole('link', { name: 'Droits des rôles' })).toHaveAttribute('aria-current', 'page');
    expect(within(panneau).getByRole('link', { name: 'Back-office Grey Concrete' })).toBeInTheDocument();
  });

  it('place le focus sur la section en cours à l’ouverture', async () => {
    render(<NavigationConsoleMobile session={SESSION} active="modules" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sections de l’administration' }));
    expect(screen.getByRole('link', { name: 'Modules' })).toHaveFocus();
  });
});
