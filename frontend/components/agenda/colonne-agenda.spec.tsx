import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CALQUES_MAX, ColonneAgenda } from './colonne-agenda';

const PERSONNES = Array.from({ length: 7 }, (_, i) => ({ id: `U${i + 2}`, nom: `Collègue ${i + 2}` }));

// Colonne de gauche de l'Agenda (12/11/2026).
describe('ColonneAgenda', () => {
  const monter = (o: { collegues?: string[]; personnes?: typeof PERSONNES } = {}) => {
    const props = { onJour: vi.fn(), onMasques: vi.fn(), onCollegues: vi.fn() };
    render(
      <ColonneAgenda
        ancre="2026-11-12"
        du="2026-11-09"
        au="2026-11-15"
        aujourdhui="2026-11-12"
        masques={['conge']}
        personnes={o.personnes ?? PERSONNES}
        collegues={o.collegues ?? []}
        {...props}
      />,
    );
    return props;
  };

  it('mini-calendrier : un jour cliqué y amène l’Agenda ; il se feuillette', async () => {
    const p = monter();
    expect(screen.getByText('novembre 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'mercredi 18 novembre' }));
    expect(p.onJour).toHaveBeenCalledWith('2026-11-18');
    await userEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(screen.getByText('décembre 2026')).toBeInTheDocument();
  });

  it('mes agendas : décocher masque un type, recocher le remontre', async () => {
    const p = monter();
    expect(screen.getByLabelText('Absence')).not.toBeChecked();
    await userEvent.click(screen.getByLabelText('Échéance'));
    expect(p.onMasques).toHaveBeenLastCalledWith(['conge', 'echeance']);
    await userEvent.click(screen.getByLabelText('Absence'));
    expect(p.onMasques).toHaveBeenLastCalledWith([]);
  });

  it(`collègues : ${CALQUES_MAX} au plus, les autres grisés ; sans le droit, rien`, async () => {
    const p = monter({ collegues: PERSONNES.slice(0, CALQUES_MAX).map((x) => x.id) });
    expect(screen.getByLabelText('Collègue 8')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Collègue 2'));
    expect(p.onCollegues).toHaveBeenCalledWith(PERSONNES.slice(1, CALQUES_MAX).map((x) => x.id));
  });

  it('sans collègue à proposer (pas le droit), la section n’apparaît pas', () => {
    monter({ personnes: [] });
    expect(screen.queryByText('Agendas de collègues')).not.toBeInTheDocument();
  });
});
