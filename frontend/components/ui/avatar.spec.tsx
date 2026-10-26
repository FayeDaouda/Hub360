import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompanyAvatar, PersonAvatar } from './avatar';

describe('PersonAvatar', () => {
  it('initiales sur la couleur de la personne, pastille « absent »', () => {
    const { container } = render(<PersonAvatar name="Fatou Ndiaye" colorKey="u1" size="sm" absent />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toBe('av av--sm');
    expect(avatar).toHaveAttribute('aria-hidden');
    expect(avatar.getAttribute('style')).toMatch(/background/);
    expect(avatar.querySelector('.av-absent')).toBeInTheDocument();
  });

  it('photo quand elle existe, sans couleur de fond', () => {
    const { container } = render(<PersonAvatar name="Fatou Ndiaye" photo="data:image/png;base64,AAAA" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toBe('av av--md');
    expect(avatar.querySelector('img')).toHaveAttribute('alt', '');
    expect(avatar).not.toHaveAttribute('style');
  });
});

describe('CompanyAvatar', () => {
  const company = { nom: 'Grey Concrete', logoUrl: null, logoUrlSombre: null, couleurMarque: '#123456', icone: null };

  it('sans logo : initiale sur la couleur de marque', () => {
    const { container } = render(<CompanyAvatar company={company} size="lg" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toBe('avatar avatar-lg');
    expect(avatar).toHaveTextContent('G');
  });

  it('logo sombre sur le verre, texte alternatif au choix', () => {
    render(
      <CompanyAvatar
        company={{ ...company, logoUrl: '/clair.png', logoUrlSombre: '/sombre.png' }}
        theme="glass"
        alt=""
      />,
    );
    expect(document.querySelector('.avatar--glass img')).toHaveAttribute('src', '/sombre.png');
    expect(document.querySelector('.avatar--glass img')).toHaveAttribute('alt', '');
  });
});
