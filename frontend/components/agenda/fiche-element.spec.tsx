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
  serieId: null,
  occurrence: null,
  regle: null,
  regleTexte: null,
  occurrenceModifiee: false,
  serie: null,
  lienVisio: null,
  rappelMinutes: null,
  maReponse: null,
  participants: [{ nom: 'Moussa Sow', reponse: null }],
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
    expect(screen.getByText('Organisé par Awa Diop')).toBeInTheDocument();
    expect(screen.getByText('Moussa Sow')).toBeInTheDocument();
    expect(screen.getByText('Sans réponse')).toBeInTheDocument();
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

  // B3 (12/11/2026).
  it('visio et rappel : « Rejoindre la visio » ouvre le lien dans un nouvel onglet', () => {
    monter({ ...RDV, lienVisio: 'https://meet.google.com/abc-defg-hij', rappelMinutes: 30 });
    const lien = screen.getByRole('link', { name: 'Rejoindre la visio' });
    expect(lien).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Rappel 30 minutes avant')).toBeInTheDocument();
  });

  it('invité : Oui / Peut-être / Non, sa réponse en évidence ; jamais sur l’agenda d’un collègue', async () => {
    const onRepondre = vi.fn();
    const invite = {
      ...RDV,
      // À venir : on peut encore répondre.
      jour: '2099-01-01',
      debut: '2099-01-01T09:00:00.000Z',
      fin: '2099-01-01T10:00:00.000Z',
      jeSuisOrganisateur: false,
      annulable: false,
      modifiable: false,
      maReponse: 'oui' as const,
    };
    const { unmount } = render(
      <FicheElement
        e={invite}
        onClose={vi.fn()}
        onModifier={vi.fn()}
        onAnnuler={vi.fn()}
        onDecider={vi.fn()}
        onRepondre={onRepondre}
      />,
    );
    expect(screen.getByRole('button', { name: 'Oui' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Non' }));
    expect(onRepondre).toHaveBeenCalledWith(invite, 'non');
    unmount();
    render(
      <FicheElement
        e={{ ...invite, calque: { id: 'U3', nom: 'Fatou Ba', couleur: 'azur' } }}
        onClose={vi.fn()}
        onModifier={vi.fn()}
        onAnnuler={vi.fn()}
        onDecider={vi.fn()}
        onRepondre={onRepondre}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Votre réponse' })).not.toBeInTheDocument();
  });

  it('réunion terminée : plus de boutons de réponse ; lien visio non https ou trompeur : pas de bouton', () => {
    const passe = { ...RDV, jeSuisOrganisateur: false, annulable: false, modifiable: false };
    const { unmount } = render(
      <FicheElement
        e={passe}
        onClose={vi.fn()}
        onModifier={vi.fn()}
        onAnnuler={vi.fn()}
        onDecider={vi.fn()}
        onRepondre={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Votre réponse' })).not.toBeInTheDocument();
    unmount();
    for (const lien of ['javascript:alert(1)', 'http://meet.example.com', 'https://meet.google.com@piege.example/x']) {
      const { unmount: u } = render(
        <FicheElement
          e={{ ...RDV, lienVisio: lien }}
          onClose={vi.fn()}
          onModifier={vi.fn()}
          onAnnuler={vi.fn()}
          onDecider={vi.fn()}
        />,
      );
      expect(screen.queryByRole('link', { name: 'Rejoindre la visio' })).not.toBeInTheDocument();
      u();
    }
  });

  it('visio : son site s’affiche à côté du bouton', () => {
    monter({ ...RDV, lienVisio: 'https://meet.google.com/abc-defg-hij' });
    expect(screen.getByText('meet.google.com')).toBeInTheDocument();
  });

  // Récurrence (16/11/2026) : la règle en clair, la date modifiée signalée.
  describe('série', () => {
    const OCC: ElementAgenda = {
      ...RDV,
      id: 'S1:2026-11-12T09:00:00.000Z',
      serieId: 'S1',
      occurrence: '2026-11-12T09:00:00.000Z',
      regle: 'FREQ=WEEKLY;BYDAY=TH',
      regleTexte: 'Chaque semaine le jeudi',
    };

    it('une occurrence ordinaire : la règle seule, sans mention de modification', () => {
      monter(OCC);
      expect(screen.getByText('Chaque semaine le jeudi')).toBeInTheDocument();
      expect(screen.queryByText(/cette date modifiée/)).not.toBeInTheDocument();
    });

    it('une occurrence modifiée : « cette date modifiée » après la règle', () => {
      monter({ ...OCC, occurrenceModifiee: true });
      expect(screen.getByText('Chaque semaine le jeudi · cette date modifiée')).toBeInTheDocument();
    });

    it('un rendez-vous unique n’affiche aucune répétition', () => {
      monter(RDV);
      expect(screen.queryByText(/Chaque|Tous les|Toutes les/)).not.toBeInTheDocument();
    });

    it('annuler une occurrence : pas de confirmation ici, la page demandera la portée', async () => {
      const p = monter(OCC);
      confirmer.mockClear();
      await userEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
      expect(confirmer).not.toHaveBeenCalled();
      expect(p.onAnnuler).toHaveBeenCalledWith(OCC);
    });
  });
});
