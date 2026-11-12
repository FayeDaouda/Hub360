import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ElementAgenda } from '@/lib/agenda';
import { GrilleHoraire } from './grille-horaire';

const J = '2026-11-12';
const el = (e: Partial<ElementAgenda> & Pick<ElementAgenda, 'id' | 'type'>): ElementAgenda => ({
  titre: e.id,
  jour: J,
  debut: null,
  fin: null,
  lieu: null,
  detail: null,
  organisateur: null,
  invites: [],
  annulable: false,
  modifiable: false,
  entretien: false,
  jeSuisOrganisateur: true,
  description: null,
  inviteIds: [],
  ...e,
});
const ELEMENTS = [
  el({
    id: 'Point chantier',
    type: 'rendez_vous',
    debut: `${J}T09:00:00.000Z`,
    fin: `${J}T10:00:00.000Z`,
    lieu: 'Plateau',
  }),
  el({ id: 'Plans RDC', type: 'echeance' }),
];

// Grille horaire de l'Agenda (12/11/2026).
describe('GrilleHoraire', () => {
  const monter = (peutCreer = true) => {
    const props = { onCreneau: vi.fn(), onOuvrir: vi.fn(), onJour: vi.fn() };
    const r = render(
      <GrilleHoraire jours={[J]} aujourdhui="2026-11-20" elements={ELEMENTS} peutCreer={peutCreer} {...props} />,
    );
    return { ...props, ...r };
  };

  it('le rendez-vous à son heure, l’échéance dans le bandeau « Journée » ; un clic ouvre la fiche', () => {
    const { onOuvrir, container } = monter();
    const bloc = screen.getByRole('button', { name: /Point chantier/ });
    expect(bloc).toHaveStyle({ top: '432px', height: '46px' }); // 9 h × 48 px, 1 h − 2 px
    expect(bloc).toHaveTextContent('09:00 – 10:00 · Plateau');
    expect(container.querySelector('.agenda-grille-journee')).toHaveTextContent('Plans RDC');
    fireEvent.click(bloc);
    expect(onOuvrir).toHaveBeenCalledWith(ELEMENTS[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Plans RDC' }));
    expect(onOuvrir).toHaveBeenLastCalledWith(ELEMENTS[1]);
  });

  it('un créneau vide cliqué propose la demi-heure, pour une heure', () => {
    const { onCreneau, container } = monter();
    fireEvent.click(container.querySelector('.agenda-grille-colonne')!, { clientY: 14.75 * 48 });
    expect(onCreneau).toHaveBeenCalledWith(J, '14:30', '15:30');
  });

  it('sans le droit de créer, cliquer un créneau ne fait rien', () => {
    const { onCreneau, container } = monter(false);
    fireEvent.click(container.querySelector('.agenda-grille-colonne')!, { clientY: 600 });
    expect(onCreneau).not.toHaveBeenCalled();
  });

  it('une réunion qui passe minuit se voit aussi le lendemain, jusqu’à son heure de fin', () => {
    const nuit = el({
      id: 'Astreinte',
      type: 'rendez_vous',
      debut: `${J}T23:00:00.000Z`,
      fin: '2026-11-13T01:00:00.000Z',
    });
    const { container } = render(
      <GrilleHoraire
        jours={[J, '2026-11-13']}
        aujourdhui="2026-11-20"
        elements={[nuit]}
        peutCreer={false}
        onCreneau={vi.fn()}
        onOuvrir={vi.fn()}
      />,
    );
    const [veille, lendemain] = container.querySelectorAll('.agenda-grille-colonne');
    expect(veille.querySelector('.agenda-bloc')).toHaveStyle({ top: `${23 * 48}px` });
    expect(lendemain.querySelector('.agenda-bloc')).toHaveStyle({ top: '0px', height: `${48 - 2}px` });
  });
});
