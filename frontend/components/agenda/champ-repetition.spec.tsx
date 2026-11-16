import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChampRepetition } from './champ-repetition';

// Répétition d'un rendez-vous (16/11/2026). Premier rendez-vous : lundi 16/11 à 9 h.
const PREMIER = '2026-11-16T09:00:00.000Z';
function Banc({ depart = null as string | null, onRegle = vi.fn() }) {
  const [regle, setRegle] = useState<string | null>(depart);
  return (
    <ChampRepetition
      regle={regle}
      premier={PREMIER}
      onChange={(r) => {
        setRegle(r);
        onRegle(r);
      }}
    />
  );
}

describe('ChampRepetition', () => {
  it('les choix courants pour la date du premier rendez-vous ; « Ne se répète pas » efface', async () => {
    const onRegle = vi.fn();
    render(<Banc onRegle={onRegle} />);
    const liste = screen.getByLabelText('Répétition');
    expect([...(liste as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Ne se répète pas',
      'Chaque jour',
      'Chaque jour ouvré (du lundi au vendredi)',
      'Chaque semaine le lundi',
      'Toutes les 2 semaines le lundi',
      'Chaque mois le 16',
      'Chaque mois le 3e lundi',
      'Chaque année le 16 novembre',
      'Personnalisée…',
    ]);
    await userEvent.selectOptions(liste, 'Chaque mois le 3e lundi');
    expect(onRegle).toHaveBeenLastCalledWith('FREQ=MONTHLY;BYDAY=3MO');
    await userEvent.selectOptions(liste, 'Ne se répète pas');
    expect(onRegle).toHaveBeenLastCalledWith(null);
  });

  it('personnalisée : toutes les 2 semaines, lundi et mercredi, 6 fois', async () => {
    const onRegle = vi.fn();
    render(<Banc onRegle={onRegle} />);
    await userEvent.selectOptions(screen.getByLabelText('Répétition'), 'Personnalisée…');
    // Champ numérique contrôlé : remplacer la valeur sélectionnée.
    await userEvent.tripleClick(screen.getByLabelText('Intervalle'));
    await userEvent.keyboard('2');
    await userEvent.click(screen.getByRole('button', { name: 'mercredi' }));
    await userEvent.click(screen.getByLabelText(/Après/));
    await userEvent.tripleClick(screen.getByLabelText('Nombre de fois'));
    await userEvent.keyboard('6');
    expect(onRegle).toHaveBeenLastCalledWith('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6');
    expect(
      screen.getByText('Toutes les 2 semaines le lundi et mercredi, 6 fois', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('une règle reçue hors des choix courants reste proposée, décrite', () => {
    render(<Banc depart="FREQ=WEEKLY;INTERVAL=3;BYDAY=FR;UNTIL=20270101T235959Z" />);
    expect((screen.getByLabelText('Répétition') as HTMLSelectElement).selectedOptions[0].text).toBe(
      'Toutes les 3 semaines le vendredi, jusqu’au 1 janvier 2027',
    );
  });
});
