import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RendezVousFormulaire, valeursVides } from './rendez-vous-formulaire';

const api = vi.hoisted(() => ({ creerRendezVous: vi.fn(), modifierRendezVous: vi.fn(), getDisponibilites: vi.fn() }));
vi.mock('@/lib/agenda', async (original) => ({ ...(await original<typeof import('@/lib/agenda')>()), ...api }));

const PERSONNES = [
  { id: 'U2', nom: 'Moussa Sow' },
  { id: 'U3', nom: 'Fatou Ba' },
];

// Création et modification d'un rendez-vous (12/11/2026).
describe('RendezVousFormulaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.creerRendezVous.mockResolvedValue({ id: 'R9' });
    api.modifierRendezVous.mockResolvedValue({ ok: true });
  });

  it('création depuis un créneau : date et heures pré-remplies, heure de Dakar', async () => {
    const onEnregistre = vi.fn();
    render(
      <RendezVousFormulaire
        slug="gc"
        initial={valeursVides('2026-11-12', '14:30', '15:30')}
        personnes={PERSONNES}
        onClose={vi.fn()}
        onEnregistre={onEnregistre}
      />,
    );
    await userEvent.type(screen.getByLabelText('Objet'), 'Point budget');
    await userEvent.click(screen.getByLabelText('Fatou Ba'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.creerRendezVous).toHaveBeenCalledWith('gc', {
      titre: 'Point budget',
      debut: '2026-11-12T14:30:00.000Z',
      fin: '2026-11-12T15:30:00.000Z',
      lieu: undefined,
      description: undefined,
      inviteIds: ['U3'],
      lienVisio: null,
      rappelMinutes: null,
    });
    expect(onEnregistre).toHaveBeenCalled();
  });

  it('modification : PATCH du rendez-vous, un invité retiré ; la fin doit suivre le début', async () => {
    render(
      <RendezVousFormulaire
        slug="gc"
        rendezVousId="R1"
        initial={{ ...valeursVides('2026-11-12'), titre: 'Point', inviteIds: ['U2', 'U3'] }}
        personnes={PERSONNES}
        onClose={vi.fn()}
        onEnregistre={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: /Modifier le rendez-vous/ })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Moussa Sow'));
    const fin = screen.getByLabelText('Fin');
    await userEvent.clear(fin);
    await userEvent.type(fin, '08:00');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('La fin doit suivre le début.')).toBeInTheDocument();
    expect(api.modifierRendezVous).not.toHaveBeenCalled();
    await userEvent.clear(fin);
    await userEvent.type(fin, '11:00');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.modifierRendezVous).toHaveBeenCalledWith(
      'gc',
      'R1',
      expect.objectContaining({ fin: '2026-11-12T11:00:00.000Z', inviteIds: ['U3'] }),
    );
  });

  // B3 (12/11/2026).
  it('visio et rappel envoyés ; disponibilités à côté des noms, le rendez-vous modifié exclu', async () => {
    api.getDisponibilites.mockResolvedValue({ occupes: ['U2'], absents: ['U3'] });
    render(
      <RendezVousFormulaire
        slug="gc"
        rendezVousId="R1"
        initial={{ ...valeursVides('2026-11-12'), titre: 'Point', inviteIds: ['U2'] }}
        personnes={PERSONNES}
        avecDisponibilites
        onClose={vi.fn()}
        onEnregistre={vi.fn()}
      />,
    );
    expect(await screen.findByText('occupé')).toBeInTheDocument();
    expect(screen.getByText('absent')).toBeInTheDocument();
    expect(api.getDisponibilites).toHaveBeenCalledWith(
      'gc',
      '2026-11-12T09:00:00.000Z',
      '2026-11-12T10:00:00.000Z',
      ['U2', 'U3'], // les seules personnes envisagées
      'R1',
    );
    await userEvent.type(screen.getByLabelText('Lien visio (facultatif)'), 'https://zoom.us/j/1');
    await userEvent.selectOptions(screen.getByLabelText('Rappel'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.modifierRendezVous).toHaveBeenCalledWith(
      'gc',
      'R1',
      expect.objectContaining({ lienVisio: 'https://zoom.us/j/1', rappelMinutes: 30 }),
    );
  });

  it('sans le droit d’inviter, aucune disponibilité n’est lue', async () => {
    render(
      <RendezVousFormulaire
        slug="gc"
        initial={valeursVides('2026-11-12')}
        personnes={PERSONNES}
        onClose={vi.fn()}
        onEnregistre={vi.fn()}
      />,
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(api.getDisponibilites).not.toHaveBeenCalled();
  });
});
