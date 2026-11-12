import { Suspense } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementAgenda, SemaineAgenda } from '@/lib/agenda';
import AgendaPage from './page';

const api = vi.hoisted(() => ({
  getAgenda: vi.fn(),
  getPersonnesAgenda: vi.fn(),
  creerRendezVous: vi.fn(),
  modifierRendezVous: vi.fn(),
  annulerRendezVous: vi.fn(),
}));
vi.mock('@/lib/agenda', async (original) => ({ ...(await original<typeof import('@/lib/agenda')>()), ...api }));
vi.mock('@/lib/layout-contexte', () => ({ useTitrePage: () => undefined }));
const confirmer = vi.hoisted(() => vi.fn());
vi.mock('@/components/confirmation', () => ({ useConfirmer: () => confirmer }));

// Jeudi 12 novembre 2026, 10 h à Dakar : la semaine va du lundi 9 au dimanche 15.
const MAINTENANT = new Date('2026-11-12T10:00:00.000Z');
const J = '2026-11-12';
const RDV: ElementAgenda = {
  id: 'R1',
  type: 'rendez_vous',
  titre: 'Point chantier',
  jour: J,
  debut: `${J}T09:00:00.000Z`,
  fin: `${J}T10:00:00.000Z`,
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
const PERSONNES = [
  { id: 'U2', nom: 'Moussa Sow' },
  { id: 'U3', nom: 'Fatou Ba' },
];
const reponse = (du: string, au: string, x: Partial<SemaineAgenda> = {}): SemaineAgenda => ({
  du,
  au,
  personne: { id: 'U1', nom: 'Awa Diop' },
  elements: [RDV],
  peutVoirAutres: false,
  peutCreer: true,
  peutInviter: true,
  ...x,
});

// `use(params)` suspend le premier rendu : la page vit dans un Suspense, et
// le rendu s'attend (act asynchrone) le temps que les paramètres arrivent.
const monter = () =>
  act(async () => {
    render(
      <Suspense fallback={null}>
        <AgendaPage params={Promise.resolve({ slug: 'gc' })} />
      </Suspense>,
    );
  });

// Page Agenda (12/11/2026) : vues Jour / Semaine / Planning, fiche et modification.
describe('Page Agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Horloge figée (Date seule : les attentes de Testing Library restent réelles).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    api.getAgenda.mockImplementation((_slug: string, du: string, au: string) => Promise.resolve(reponse(du, au)));
    api.getPersonnesAgenda.mockResolvedValue(PERSONNES);
    api.modifierRendezVous.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    // jsdom n'a pas de matchMedia : le retirer après le test « téléphone ».
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('passage de vue', () => {
    it('ouvre la semaine en cours par défaut, en grille horaire', async () => {
      await monter();
      expect(await screen.findByRole('button', { name: /Point chantier/ })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Semaine' })).toBeChecked();
      expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-09', '2026-11-15', undefined);
    });

    it('Jour charge la seule journée ; Planning les 30 jours qui viennent, en liste', async () => {
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });

      await userEvent.click(screen.getByRole('radio', { name: 'Jour' }));
      expect(screen.getByRole('radio', { name: 'Jour' })).toBeChecked();
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', J, J, undefined));

      await userEvent.click(screen.getByRole('radio', { name: 'Planning' }));
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', J, '2026-12-11', undefined));
      // En liste : le rendez-vous et ses actions, sans passer par la fiche.
      const ligne = (await screen.findByText('Point chantier')).closest('li')!;
      expect(within(ligne).getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
      expect(within(ligne).getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    });

    it('« Semaine suivante » charge la semaine d’après', async () => {
      await monter();
      await screen.findByRole('button', { name: /Point chantier/ });
      await userEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }));
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', '2026-11-16', '2026-11-22', undefined));
    });

    it('sur téléphone, le planning s’ouvre par défaut', async () => {
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: q === '(max-width: 640px)' }));
      await monter();
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Planning' })).toBeChecked());
      await waitFor(() => expect(api.getAgenda).toHaveBeenLastCalledWith('gc', J, '2026-12-11', undefined));
    });
  });

  describe('modifier depuis la fiche', () => {
    it('« Modifier » ouvre le formulaire pré-rempli, et l’enregistrement recharge l’agenda', async () => {
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      const fiche = await screen.findByRole('dialog');
      await userEvent.click(within(fiche).getByRole('button', { name: 'Modifier' }));

      expect(await screen.findByRole('heading', { name: /Modifier le rendez-vous/ })).toBeInTheDocument();
      // La fiche se ferme : un seul dialogue ouvert, le formulaire.
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByLabelText('Objet')).toHaveValue('Point chantier');
      expect(screen.getByLabelText('Date')).toHaveValue(J);
      expect(screen.getByLabelText('Début')).toHaveValue('09:00');
      expect(screen.getByLabelText('Fin')).toHaveValue('10:00');
      expect(screen.getByLabelText('Lieu (facultatif)')).toHaveValue('Plateau');
      expect(screen.getByLabelText('Note (facultatif)')).toHaveValue('Apporter les plans');
      expect(screen.getByLabelText('Moussa Sow')).toBeChecked();
      expect(screen.getByLabelText('Fatou Ba')).not.toBeChecked();

      const appels = api.getAgenda.mock.calls.length;
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      expect(api.modifierRendezVous).toHaveBeenCalledWith('gc', 'R1', {
        titre: 'Point chantier',
        debut: `${J}T09:00:00.000Z`,
        fin: `${J}T10:00:00.000Z`,
        lieu: 'Plateau',
        description: 'Apporter les plans',
        inviteIds: ['U2'],
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.getAgenda.mock.calls.length).toBeGreaterThan(appels);
    });

    it('sans le droit « Réunions », seuls les invités déjà là sont proposés (on peut les retirer)', async () => {
      api.getAgenda.mockImplementation((_slug: string, du: string, au: string) =>
        Promise.resolve(reponse(du, au, { peutInviter: false })),
      );
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Modifier' }));
      expect(await screen.findByLabelText('Moussa Sow')).toBeChecked();
      expect(screen.queryByLabelText('Fatou Ba')).not.toBeInTheDocument();
    });

    it('un rendez-vous non modifiable (entretien) n’offre pas « Modifier » dans sa fiche', async () => {
      api.getAgenda.mockImplementation((_slug: string, du: string, au: string) =>
        Promise.resolve(
          reponse(du, au, { elements: [{ ...RDV, modifiable: false, annulable: false, entretien: true }] }),
        ),
      );
      await monter();
      await userEvent.click(await screen.findByRole('button', { name: /Point chantier/ }));
      const fiche = await screen.findByRole('dialog');
      expect(within(fiche).queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
      expect(within(fiche).getByText(/se replanifie ou s’annule depuis le recrutement/)).toBeInTheDocument();
    });
  });
});
