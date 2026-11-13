import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ElementAgenda } from '@/lib/agenda';
import { FicheElement } from './fiche-element';

const confirmer = vi.hoisted(() => vi.fn());
vi.mock('@/components/confirmation', () => ({ useConfirmer: () => confirmer }));

const RDV: ElementAgenda = {
  id: 'R1',
  type: 'rendez_vous',
  titre: 'Point chantier',
  jour: '2026-11-12',
  debut: '2026-11-12T09:00:00.000Z',
  fin: '2026-11-12T10:00:00.000Z',
  lieu: 'Plateau',
  detail: 'Apporter les plans',
  organisateur: 'Awa Diop',
  invites: ['Moussa Sow'],
  annulable: true,
  modifiable: true,
  entretien: false,
  jeSuisOrganisateur: true,
  description: 'Apporter les plans',
  inviteIds: ['U2'],
};

// Fiche d'un élément de l'Agenda (12/11/2026).
describe('FicheElement', () => {
  const monter = (e: ElementAgenda) => {
    const props = { onClose: vi.fn(), onModifier: vi.fn(), onAnnuler: vi.fn(), onDecider: vi.fn() };
    render(<FicheElement e={e} {...props} />);
    return props;
  };

  it('son rendez-vous : détail, Modifier, et Annuler après confirmation', async () => {
    const p = monter(RDV);
    expect(screen.getByText(/Avec Moussa Sow · organisé par Awa Diop/)).toBeInTheDocument();
    expect(screen.getByText('Apporter les plans')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(p.onModifier).toHaveBeenCalledWith(RDV);
    confirmer.mockResolvedValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
    expect(p.onAnnuler).not.toHaveBeenCalled();
    confirmer.mockResolvedValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
    expect(p.onAnnuler).toHaveBeenCalledWith(RDV);
  });

  it('invité ou entretien : rien à modifier ; un entretien dit où le replanifier', () => {
    monter({ ...RDV, annulable: false, modifiable: false, entretien: true });
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.getByText(/se replanifie ou s’annule depuis le recrutement/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Fermer' }).length).toBeGreaterThan(0);
  });

  it('une demande d’absence se décide depuis la fiche', async () => {
    const demande = { id: 'D1', type: 'conge_paye' as const, jours: 3, validationFinale: false };
    const p = monter({ ...RDV, type: 'demande', debut: null, fin: null, annulable: false, modifiable: false, demande });
    expect(screen.getByText(/toute la journée/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Décider' }));
    expect(p.onDecider).toHaveBeenCalled();
  });
});
