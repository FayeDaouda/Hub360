import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Localite } from '@/lib/types';
import { LocaliteSelect } from './localite-select';

const l = (id: string, nom: string, code: string, region: string, zone: Localite['zone'] = 'dakar'): Localite =>
  ({ id, nom, code, region, zone, arrondissement: null, commune: null, codeVerrouille: false }) as Localite;
const LOCALITES = [
  l('1', 'Ouakam', 'OUA', 'Dakar'),
  l('2', 'Almadies', 'ALM', 'Dakar'),
  l('3', 'Thiès', 'THI', 'Thiès', 'senegal'),
  l('4', 'Mermoz-Sacré-Cœur', 'MER', 'Dakar'),
];

// Recherche d'une localité (06/11/2026).
describe('LocaliteSelect', () => {
  it('cherche sans accents, choisit au clavier', async () => {
    const onChange = vi.fn();
    render(<LocaliteSelect localites={LOCALITES} valeur="" onChange={onChange} />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'thies');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['ThièsTHI']);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('3');
  });

  it('le nom qui commence par le terme passe devant ; le code aussi se cherche', async () => {
    render(<LocaliteSelect localites={LOCALITES} valeur="" onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'me');
    expect(screen.getAllByRole('option')[0].textContent).toContain('Mermoz');
    await userEvent.clear(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'alm');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('montre la localité choisie et l’efface', async () => {
    const onChange = vi.fn();
    render(<LocaliteSelect localites={LOCALITES} valeur="1" onChange={onChange} />);
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Ouakam (OUA)');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la localité' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
