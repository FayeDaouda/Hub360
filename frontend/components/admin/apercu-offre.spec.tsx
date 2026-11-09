import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatLongDate } from '@hub/domain';
import { getDevis } from '@/lib/devis';
import { useSocieteCourante } from '@/lib/layout-contexte';
import type { Devis, Societe } from '@/lib/types';
import { ApercuOffre } from './apercu-offre';

// --- Doublures ---------------------------------------------------------------
// Réseau (lecture du devis) et contexte du layout (société) remplacés ; la
// fenêtre, le document et sa construction (documentApercuOffre) restent les vrais.

vi.mock('@/lib/devis', () => ({ getDevis: vi.fn() }));
vi.mock('@/lib/layout-contexte', () => ({ useSocieteCourante: vi.fn() }));

const getDevisMock = vi.mocked(getDevis);
const societeMock = vi.mocked(useSocieteCourante);

// --- Données -------------------------------------------------------------------

const SLUG = 'grey-concrete';
// 09/11/2026 à midi (UTC = heure de Dakar). Fuseau de l'appareil : UTC+14.
const MAINTENANT = new Date('2026-11-09T12:00:00Z');

const SOCIETE: Societe = {
  id: 's-gc',
  nom: 'Grey Concrete',
  slug: SLUG,
  logoUrl: null,
  logoUrlSombre: null,
  couleurMarque: '#4f46e5',
  icone: null,
  secteur: 'Architecture',
  mentionsLegales: null,
  coordonnees: null,
  penaliteRetardMensuelle: null,
};

// Brouillon soumis au CFO : ni numéro, ni date d'envoi, ni validité.
const DEVIS: Devis = {
  id: 'of-1',
  numero: null,
  reference: null,
  statut: 'brouillon',
  statutEffectif: 'brouillon',
  objet: 'Conception villa R+1',
  client: { id: 'cli-1', nom: 'Daouda Faye Sow', type: 'particulier' },
  projetId: null,
  dossierCrm: { id: 'p-1', code: 'DFS_ALM.26', statut: 'en_validation' },
  dateValidite: null,
  dateEnvoi: null,
  dateReponse: null,
  relancesEnvoyees: 0,
  derniereRelanceLe: null,
  relanceAFaire: false,
  alerteAvenant: null,
  lignes: [
    {
      id: 'l-1',
      produitServiceId: 'ps-co1',
      designation: 'Conception CO1',
      surfaceM2: 250,
      planches: 2,
      quantite: 500,
      prixUnitaire: 2_000,
      tauxTva: 18,
      montantHt: 1_000_000,
      montantTva: 180_000,
      montantTtc: 1_180_000,
      ordre: 0,
    },
  ],
  montantHt: 1_000_000,
  montantTva: 180_000,
  montantTtc: 1_180_000,
  messageIntroduction: '',
  messageIntroductionPersonnalise: false,
  delaisEcheancier: {},
  creeLe: '2026-11-02T08:00:00Z',
};

// Promesse résolue à la main : pour observer l'état « en cours ».
function differe<T>() {
  let resoudre!: (v: T) => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<T>((res, rej) => {
    resoudre = res;
    rejeter = rej;
  });
  return { promesse, resoudre, rejeter };
}

type Decision = Parameters<typeof ApercuOffre>[0]['decision'];

function ouvrir(decision: Decision, onClose = vi.fn()) {
  render(<ApercuOffre slug={SLUG} offreId="of-1" dossierCode="DFS_ALM.26" decision={decision} onClose={onClose} />);
  return { onClose, fenetre: screen.getByRole('dialog', { name: 'Offre DFS_ALM.26 · aperçu avant envoi' }) };
}

const boutonValider = () => screen.getByRole('button', { name: /Valider et envoyer l’offre/ });

beforeEach(() => {
  // Horloge figée (Date seulement : les attentes de Testing Library restent réelles).
  vi.useFakeTimers({ toFake: ['Date'], now: MAINTENANT });
  getDevisMock.mockReset().mockResolvedValue(DEVIS);
  societeMock.mockReset().mockReturnValue(SOCIETE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Aperçu de l’offre · chargement du document', () => {
  it('lit l’offre demandée dans la société courante', async () => {
    ouvrir(null);
    await screen.findByText('Aperçu avant envoi');
    expect(getDevisMock).toHaveBeenCalledWith(SLUG, 'of-1');
  });

  it('affiche l’offre datée du jour, valable 7 jours, sans numéro', async () => {
    const { fenetre } = ouvrir(null);
    await within(fenetre).findByText('Aperçu avant envoi');
    expect(within(fenetre).getByText(formatLongDate('2026-11-09'))).toBeInTheDocument();
    expect(within(fenetre).getByText(formatLongDate('2026-11-16'))).toBeInTheDocument();
    expect(within(fenetre).getByRole('heading', { name: '# —' })).toBeInTheDocument();
    expect(within(fenetre).getByText('Conception villa R+1')).toBeInTheDocument();
  });

  it('annonce que l’offre est valable 7 jours à partir de l’envoi', () => {
    ouvrir(null);
    expect(screen.getByText(/valable 7 jours à partir de l’envoi/)).toBeInTheDocument();
  });

  it('affiche une erreur si l’offre ne peut pas être lue', async () => {
    getDevisMock.mockRejectedValue(new Error('500'));
    ouvrir(null);
    expect(await screen.findByText('Impossible d’afficher l’offre. Ferme puis réessaie.')).toBeInTheDocument();
    expect(screen.queryByText('Aperçu avant envoi')).not.toBeInTheDocument();
  });
});

describe('Aperçu de l’offre · consultation sans droit de décision', () => {
  it('n’affiche aucun bouton de validation ni de renvoi', async () => {
    ouvrir(null);
    await screen.findByText('Aperçu avant envoi');
    expect(screen.queryByRole('button', { name: /Valider et envoyer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renvoyer…' })).not.toBeInTheDocument();
  });

  it('se ferme par la croix', async () => {
    const user = userEvent.setup();
    const { onClose } = ouvrir(null);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Échap intercepté à la capture : il ferme l'aperçu seul, sans atteindre
  // la fiche en dessous (qui écoute Échap sur window).
  it('Échap ferme l’aperçu seul, sans atteindre la fiche en dessous', async () => {
    const user = userEvent.setup();
    const fiche = vi.fn();
    window.addEventListener('keydown', fiche);
    try {
      const { onClose } = ouvrir(null);
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(fiche).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', fiche);
    }
  });

  it('le focus entre dans l’aperçu à l’ouverture', async () => {
    ouvrir(null);
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
  });
});

describe('Aperçu de l’offre · validation par le CFO', () => {
  it('désactive « Valider et envoyer l’offre » tant que le document n’est pas chargé', async () => {
    const lecture = differe<Devis>();
    getDevisMock.mockReturnValue(lecture.promesse);
    ouvrir({ onValider: vi.fn() });
    expect(boutonValider()).toBeDisabled();

    lecture.resoudre(DEVIS);
    await waitFor(() => expect(boutonValider()).toBeEnabled());
  });

  it('garde « Valider et envoyer l’offre » désactivé si l’offre ne peut pas être lue', async () => {
    getDevisMock.mockRejectedValue(new Error('réseau'));
    const onValider = vi.fn();
    const user = userEvent.setup();
    ouvrir({ onValider });
    await screen.findByText('Impossible d’afficher l’offre. Ferme puis réessaie.');
    expect(boutonValider()).toBeDisabled();
    await user.click(boutonValider());
    expect(onValider).not.toHaveBeenCalled();
  });

  it('garde « Valider et envoyer l’offre » désactivé tant que la société n’est pas chargée', async () => {
    societeMock.mockReturnValue(null);
    ouvrir({ onValider: vi.fn() });
    await waitFor(() => expect(getDevisMock).toHaveBeenCalled());
    expect(boutonValider()).toBeDisabled();
  });

  it('valide une seule fois au clic, une fois le document affiché', async () => {
    const onValider = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    ouvrir({ onValider });
    await waitFor(() => expect(boutonValider()).toBeEnabled());
    await user.click(boutonValider());
    expect(onValider).toHaveBeenCalledTimes(1);
  });

  it('bloque un double clic pendant l’envoi', async () => {
    const envoi = differe<void>();
    const onValider = vi.fn().mockReturnValue(envoi.promesse);
    const user = userEvent.setup();
    const { onClose } = ouvrir({ onValider, onRenvoyer: vi.fn() });
    await waitFor(() => expect(boutonValider()).toBeEnabled());

    await user.click(boutonValider());
    const enCours = screen.getByRole('button', { name: /Envoi…/ });
    expect(enCours).toBeDisabled();
    await user.click(enCours);
    expect(onValider).toHaveBeenCalledTimes(1);
    // Ni fermeture ni renvoi pendant l'envoi.
    for (const fermer of screen.getAllByRole('button', { name: 'Fermer' })) expect(fermer).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Renvoyer…' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    envoi.resoudre();
  });

  it('affiche l’erreur du serveur, reste ouvert et réactive le bouton si l’envoi échoue', async () => {
    const onValider = vi.fn().mockRejectedValue(new Error('Seuil de contresignature dépassé : le CEO valide.'));
    const user = userEvent.setup();
    const { onClose, fenetre } = ouvrir({ onValider });
    await waitFor(() => expect(boutonValider()).toBeEnabled());

    await user.click(boutonValider());
    expect(await within(fenetre).findByText('Seuil de contresignature dépassé : le CEO valide.')).toBeInTheDocument();
    expect(fenetre).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(boutonValider()).toBeEnabled();

    // Nouvel essai possible ; l'erreur précédente s'efface.
    onValider.mockResolvedValueOnce(undefined);
    await user.click(boutonValider());
    expect(onValider).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(within(fenetre).queryByText('Seuil de contresignature dépassé : le CEO valide.')).not.toBeInTheDocument(),
    );
  });

  it('affiche un message générique si l’échec n’a pas de message', async () => {
    const onValider = vi.fn().mockRejectedValue(new Error(''));
    const user = userEvent.setup();
    ouvrir({ onValider });
    await waitFor(() => expect(boutonValider()).toBeEnabled());
    await user.click(boutonValider());
    expect(await screen.findByText('L’envoi a échoué.')).toBeInTheDocument();
  });

  it('propose « Renvoyer… » seulement quand le renvoi est permis', async () => {
    const onRenvoyer = vi.fn();
    const user = userEvent.setup();
    ouvrir({ onValider: vi.fn(), onRenvoyer });
    await user.click(screen.getByRole('button', { name: 'Renvoyer…' }));
    expect(onRenvoyer).toHaveBeenCalledTimes(1);
  });

  it('n’affiche pas « Renvoyer… » sans droit de renvoi', () => {
    ouvrir({ onValider: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Renvoyer…' })).not.toBeInTheDocument();
  });

  it('se ferme sans valider par le bouton « Fermer » du bas', async () => {
    const onValider = vi.fn();
    const user = userEvent.setup();
    const { onClose } = ouvrir({ onValider });
    const [, fermerBas] = screen.getAllByRole('button', { name: 'Fermer' });
    await user.click(fermerBas);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onValider).not.toHaveBeenCalled();
  });
});
