import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '@/lib/auth';
import { creerProjet } from '@/lib/crm';
import type { Client, Localite, Personne, Projet, Session } from '@/lib/types';
import { NouveauProjetModal } from './nouveau-projet-modal';

// API et session mockées ; la recherche de localité (LocaliteSelect), la fiche
// apporteur (FicheApporteurChamps) et la nomenclature du code restent les
// vraies : ce sont elles que l'utilisateur manipule.
vi.mock('@/lib/crm', () => ({ creerProjet: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }));

// Parcours complets (nom, localité, fiche apporteur) tapés au clavier : plus
// lents que la moyenne, d'où un délai plus large que les 5 s par défaut.
vi.setConfig({ testTimeout: 20_000 });

const creer = vi.mocked(creerProjet);
const session = vi.mocked(getSession);

// 31/12/2027 à 23 h 30 UTC : encore 2027 à Dakar, déjà 2028 sur l'appareil
// (fuseau UTC+14 de vitest.config) — l'année du code doit être celle de Dakar.
const MAINTENANT = new Date('2027-12-31T23:30:00Z');

// --- Données ---------------------------------------------------------------

const SLUG = 'grey-concrete';

const l = (id: string, nom: string, code: string): Localite => ({
  id,
  nom,
  code,
  zone: 'dakar',
  region: 'Dakar',
  arrondissement: null,
  commune: null,
  codeVerrouille: false,
});
const LOCALITES = [l('loc-alm', 'Almadies', 'ALM'), l('loc-ngo', 'Ngor', 'NGO')];

const CLIENTS = [
  { id: 'cli-tc', nom: 'Teranga Capital', type: 'entreprise', sigle: 'TC' },
  { id: 'cli-md', nom: 'Moussa Diop', type: 'particulier' },
] as Client[];

const DIR_GC: Personne = { id: 'u-dirgc', nom: 'Awa Ndiaye' };
const AUTRE_DIR_GC: Personne = { id: 'u-dirgc-2', nom: 'Ibrahima Sall' };

const sessionDe = (id: string, role: string): Session =>
  ({
    access_token: 'jeton',
    utilisateur: { id, email: `${id}@greyconcrete.hub`, nom: 'Test', prenom: 'Compte' },
    societe: { id: 's1', nom: 'Grey Concrete', slug: SLUG },
    role,
  }) as Session;

const PROJET_CREE = { id: 'p-1', code: 'DFS_ALM.27' } as unknown as Projet;

function rendre(props: Partial<Parameters<typeof NouveauProjetModal>[0]> = {}) {
  const onClose = vi.fn();
  const onCree = vi.fn();
  const utils = render(
    <NouveauProjetModal
      slug={SLUG}
      clients={CLIENTS}
      localites={LOCALITES}
      proprietaires={[DIR_GC]}
      onClose={onClose}
      onCree={onCree}
      {...props}
    />,
  );
  return { ...utils, onClose, onCree };
}

// --- Helpers d'interaction ---------------------------------------------------

const apercu = () => screen.getByText('Code projet généré').nextElementSibling?.textContent;
const etat = () => screen.getByRole('status');
const boutonCreer = () => screen.getByRole('button', { name: /Créer le projet|Création…/ });
const champNom = () => screen.getByRole('textbox', { name: /Prénom\(s\) et nom|Raison sociale/ });

async function choisirLocalite(nom: string) {
  await userEvent.type(screen.getByRole('combobox', { name: 'Localisation' }), nom);
  await userEvent.click(screen.getByRole('option', { name: new RegExp(nom) }));
}

async function saisirApporteur(nom: string, pourcentage = '4') {
  await userEvent.type(screen.getByLabelText('Nom et prénom'), nom);
  await userEvent.selectOptions(screen.getByLabelText('% attribué'), pourcentage);
}

const affaireDirecte = () =>
  userEvent.click(screen.getByRole('checkbox', { name: 'Aucun apporteur (affaire directe)' }));

// Promesse résolue à la main : l'envoi reste « en cours » tant qu'on veut.
function differe<T>() {
  let resoudre!: (v: T) => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<T>((res, rej) => {
    resoudre = res;
    rejeter = rej;
  });
  return { promesse, resoudre, rejeter };
}

async function remplirToutNouveauClient() {
  await userEvent.type(champNom(), 'Daouda Faye Sow');
  await choisirLocalite('Almadies');
  await affaireDirecte();
}

// --- Tests -------------------------------------------------------------------

describe('NouveauProjetModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    session.mockReturnValue(sessionDe('u-coo', 'COO'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('ouverture', () => {
    it('place le focus sur le nom du client à l’ouverture', () => {
      rendre();
      expect(champNom()).toHaveFocus();
    });

    it('garde le focus là où l’utilisateur l’a mis quand la page parente se rafraîchit', async () => {
      const { rerender, onCree } = rendre();
      const apporteur = screen.getByLabelText('Nom et prénom');
      await userEvent.click(apporteur);
      expect(apporteur).toHaveFocus();

      rerender(
        <NouveauProjetModal
          slug={SLUG}
          clients={CLIENTS}
          localites={LOCALITES}
          proprietaires={[DIR_GC]}
          onClose={vi.fn()}
          onCree={onCree}
        />,
      );
      expect(apporteur).toHaveFocus();
    });

    it('propose « + Nouveau client » par défaut, puis les clients existants', () => {
      rendre();
      const select = screen.getByRole('combobox', { name: 'Client' });
      expect(select).toHaveValue('__nouveau__');
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['+ Nouveau client', 'Teranga Capital', 'Moussa Diop']);
    });

    it('« Annuler » ferme la fenêtre sans rien créer', async () => {
      const { onClose } = rendre();
      await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(creer).not.toHaveBeenCalled();
    });
  });

  describe('aperçu du code projet', () => {
    it('affiche « ??? » pour le client et la localité tant qu’ils manquent, avec l’année de Dakar sur 2 chiffres', () => {
      rendre();
      expect(apercu()).toBe('???_???.27');
    });

    it('compose le segment client au fil de la saisie du nom', async () => {
      rendre();
      await userEvent.type(champNom(), 'Daouda Faye Sow');
      expect(apercu()).toBe('DFS_???.27');
    });

    it('ajoute le code de la localité choisie et le rappelle dans l’aide', async () => {
      rendre();
      await userEvent.type(champNom(), 'Daouda Faye Sow');
      await choisirLocalite('Almadies');
      expect(apercu()).toBe('DFS_ALM.27');
      expect(screen.getByText(/\(ici ALM\)/)).toBeInTheDocument();
    });

    it('revient à « ??? » pour la localité quand on l’efface', async () => {
      rendre();
      await choisirLocalite('Ngor');
      expect(apercu()).toBe('???_NGO.27');
      await userEvent.click(screen.getByRole('button', { name: 'Effacer la localité' }));
      expect(apercu()).toBe('???_???.27');
    });

    it('ignore la forme juridique d’une personne morale dans le segment client', async () => {
      rendre();
      await userEvent.click(screen.getByRole('radio', { name: 'Personne morale' }));
      await userEvent.type(champNom(), 'SCI Les Filaos');
      expect(apercu()).toBe('FIL_???.27');
    });

    it('reprend le sigle d’un client existant comme segment', async () => {
      rendre();
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Client' }), 'cli-tc');
      expect(apercu()).toBe('TC_???.27');
    });
  });

  describe('nature du client', () => {
    it('coche « Personne physique » par défaut, avec le libellé et l’aide d’un particulier', () => {
      rendre();
      expect(screen.getByRole('radiogroup', { name: 'Nature du client' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Personne physique' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Personne morale' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByLabelText('Prénom(s) et nom')).toHaveAttribute('placeholder', 'ex. Dior Fall Sourang');
      expect(screen.getByText('Dans l’ordre de l’état civil : une lettre par prénom et par nom.')).toBeInTheDocument();
    });

    it('passe en « Raison sociale » avec l’aide des formes juridiques pour une personne morale', async () => {
      rendre();
      await userEvent.click(screen.getByRole('radio', { name: 'Personne morale' }));
      expect(screen.getByRole('radio', { name: 'Personne morale' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Personne physique' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByLabelText('Raison sociale')).toHaveAttribute('placeholder', 'ex. SCI Les Filaos');
      expect(screen.queryByLabelText('Prénom(s) et nom')).not.toBeInTheDocument();
      expect(
        screen.getByText('Les initiales ignorent les mots de liaison et la forme juridique (SA, SARL…).'),
      ).toBeInTheDocument();
    });
  });

  describe('client existant', () => {
    it('masque la nature et le nom quand un client existant est choisi, et les rend pour un nouveau client', async () => {
      rendre();
      const select = screen.getByRole('combobox', { name: 'Client' });
      await userEvent.selectOptions(select, 'cli-md');
      expect(screen.queryByRole('radiogroup', { name: 'Nature du client' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Prénom(s) et nom')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Raison sociale')).not.toBeInTheDocument();

      await userEvent.selectOptions(select, '__nouveau__');
      expect(screen.getByRole('radiogroup', { name: 'Nature du client' })).toBeInTheDocument();
      expect(champNom()).toBeInTheDocument();
    });
  });

  describe('ce qui manque avant la création', () => {
    it('demande le client d’abord et désactive « Créer le projet »', () => {
      rendre();
      expect(etat()).toHaveTextContent('Saisir le client pour continuer');
      expect(boutonCreer()).toBeDisabled();
    });

    it('ne compte pas un nom fait uniquement d’espaces comme un client saisi', async () => {
      rendre();
      await userEvent.type(champNom(), '   ');
      expect(etat()).toHaveTextContent('Saisir le client pour continuer');
      expect(boutonCreer()).toBeDisabled();
    });

    it('demande ensuite la localisation', async () => {
      rendre();
      await userEvent.type(champNom(), 'Daouda Faye Sow');
      expect(etat()).toHaveTextContent('Choisir la localisation pour continuer');
      expect(boutonCreer()).toBeDisabled();
    });

    it('demande enfin la fiche apporteur', async () => {
      rendre();
      await userEvent.type(champNom(), 'Daouda Faye Sow');
      await choisirLocalite('Almadies');
      expect(etat()).toHaveTextContent('Compléter la fiche apporteur pour continuer');
      expect(boutonCreer()).toBeDisabled();
    });

    it('garde la fiche apporteur incomplète tant que le % attribué n’est pas choisi', async () => {
      rendre();
      await userEvent.type(champNom(), 'Daouda Faye Sow');
      await choisirLocalite('Almadies');
      await userEvent.type(screen.getByLabelText('Nom et prénom'), 'Aïssatou Ba');
      expect(etat()).toHaveTextContent('Compléter la fiche apporteur pour continuer');
      expect(boutonCreer()).toBeDisabled();
    });

    it('annonce « Tout est prêt » et active le bouton quand tout est rempli', async () => {
      rendre();
      await remplirToutNouveauClient();
      expect(etat()).toHaveTextContent('Tout est prêt : le code sera réservé à la création.');
      expect(boutonCreer()).toBeEnabled();
    });

    it('n’exige pas de nom quand le client est existant', async () => {
      rendre();
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Client' }), 'cli-md');
      expect(etat()).toHaveTextContent('Choisir la localisation pour continuer');
    });
  });

  describe('envoi', () => {
    it('envoie un nouveau particulier avec le nom trimé, la localité et l’affaire directe', async () => {
      creer.mockResolvedValue(PROJET_CREE);
      rendre();
      await userEvent.type(champNom(), '  Daouda Faye Sow  ');
      await choisirLocalite('Almadies');
      await affaireDirecte();
      await userEvent.click(boutonCreer());

      expect(creer).toHaveBeenCalledTimes(1);
      expect(creer).toHaveBeenCalledWith(SLUG, {
        nature: 'mandat_client',
        localiteId: 'loc-alm',
        client: { nouveau: { nom: 'Daouda Faye Sow', type: 'particulier' } },
        apporteur: { type: 'aucun' },
      });
    });

    it('envoie une personne morale comme « entreprise » avec un apporteur externe et son %', async () => {
      creer.mockResolvedValue(PROJET_CREE);
      rendre();
      await userEvent.click(screen.getByRole('radio', { name: 'Personne morale' }));
      await userEvent.type(champNom(), 'SCI Les Filaos');
      await choisirLocalite('Ngor');
      await saisirApporteur('Aïssatou Ba', '3.5');
      await userEvent.click(boutonCreer());

      expect(creer).toHaveBeenCalledWith(SLUG, {
        nature: 'mandat_client',
        localiteId: 'loc-ngo',
        client: { nouveau: { nom: 'SCI Les Filaos', type: 'entreprise' } },
        apporteur: {
          type: 'externe',
          nom: 'Aïssatou Ba',
          structure: undefined,
          telephone: undefined,
          email: undefined,
          commission: 3.5,
        },
      });
    });

    it('envoie seulement l’identifiant d’un client existant', async () => {
      creer.mockResolvedValue(PROJET_CREE);
      rendre();
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Client' }), 'cli-tc');
      await choisirLocalite('Almadies');
      await affaireDirecte();
      await userEvent.click(boutonCreer());

      expect(creer).toHaveBeenCalledWith(SLUG, {
        nature: 'mandat_client',
        localiteId: 'loc-alm',
        client: { id: 'cli-tc' },
        apporteur: { type: 'aucun' },
      });
    });

    it('n’envoie rien si l’on valide le formulaire au clavier alors qu’il manque une information', async () => {
      rendre();
      await userEvent.type(champNom(), 'Daouda Faye Sow{Enter}');
      expect(creer).not.toHaveBeenCalled();
    });

    it('affiche « Création… » et désactive Annuler, Créer et Fermer pendant l’envoi', async () => {
      const envoi = differe<Projet>();
      creer.mockReturnValue(envoi.promesse);
      rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());

      expect(screen.getByRole('button', { name: 'Création…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();

      envoi.resoudre(PROJET_CREE);
      await waitFor(() => expect(creer).toHaveBeenCalledTimes(1));
    });

    it('ne ferme pas la fenêtre avec Échap pendant l’envoi', async () => {
      const envoi = differe<Projet>();
      creer.mockReturnValue(envoi.promesse);
      const { onClose } = rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());
      await userEvent.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();

      envoi.resoudre(PROJET_CREE);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('n’envoie pas une seconde fois si l’on valide au clavier pendant l’envoi', async () => {
      const envoi = differe<Projet>();
      creer.mockReturnValue(envoi.promesse);
      const { onClose } = rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());
      await userEvent.type(champNom(), '{Enter}');
      expect(creer).toHaveBeenCalledTimes(1);

      envoi.resoudre(PROJET_CREE);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('transmet le projet créé puis ferme la fenêtre après succès', async () => {
      creer.mockResolvedValue(PROJET_CREE);
      const { onCree, onClose } = rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onCree).toHaveBeenCalledWith(PROJET_CREE);
      expect(onCree.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    });

    it('affiche l’erreur du serveur dans le pied, réactive les boutons et laisse la fenêtre ouverte', async () => {
      creer.mockRejectedValue(new Error('Ce code est déjà réservé.'));
      const { onCree, onClose } = rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());

      await waitFor(() => expect(etat()).toHaveTextContent('Ce code est déjà réservé.'));
      expect(screen.getByRole('button', { name: 'Créer le projet' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Fermer' })).toBeEnabled();
      expect(onCree).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('affiche un message générique si l’erreur n’a pas de message', async () => {
      creer.mockRejectedValue(new Error(''));
      rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());
      await waitFor(() => expect(etat()).toHaveTextContent('La création a échoué. Réessaie.'));
    });

    it('affiche un message générique si l’échec n’est pas une Error', async () => {
      creer.mockRejectedValue('réseau coupé');
      rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());
      await waitFor(() => expect(etat()).toHaveTextContent('La création a échoué. Réessaie.'));
    });

    it('efface l’erreur précédente et réussit au second essai', async () => {
      creer.mockRejectedValueOnce(new Error('Serveur indisponible')).mockResolvedValueOnce(PROJET_CREE);
      const { onCree } = rendre();
      await remplirToutNouveauClient();
      await userEvent.click(boutonCreer());
      await waitFor(() => expect(etat()).toHaveTextContent('Serveur indisponible'));

      await userEvent.click(boutonCreer());
      await waitFor(() => expect(onCree).toHaveBeenCalledWith(PROJET_CREE));
      expect(creer).toHaveBeenCalledTimes(2);
    });
  });

  describe('passation', () => {
    it('affiche le rôle du créateur', () => {
      rendre();
      expect(screen.getByText('Créée par (automatique)').nextElementSibling).toHaveTextContent('COO');
    });

    it('affiche « — » comme créateur sans session', () => {
      session.mockReturnValue(null);
      rendre();
      expect(screen.getByText('Créée par (automatique)').nextElementSibling).toHaveTextContent('—');
    });

    it('dit « Vous créez et pilotez la fiche » quand le créateur est le seul Dir. GC', () => {
      session.mockReturnValue(sessionDe(DIR_GC.id, 'Dir. GC'));
      rendre({ proprietaires: [DIR_GC] });
      expect(screen.getByText('Vous créez et pilotez la fiche.')).toBeInTheDocument();
    });

    it('nomme le Dir. GC quand il est seul et que ce n’est pas le créateur', () => {
      rendre({ proprietaires: [DIR_GC] });
      expect(
        screen.getByText('Awa Ndiaye (Direction GC) pilote ensuite la fiche jusqu’au contrat.'),
      ).toBeInTheDocument();
    });

    it('laisse le propriétaire « à assigner » quand il y a plusieurs Dir. GC', () => {
      rendre({ proprietaires: [DIR_GC, AUTRE_DIR_GC] });
      expect(screen.getByText('Propriétaire à assigner ensuite sur la fiche (Direction GC).')).toBeInTheDocument();
      expect(screen.queryByText(/Awa Ndiaye/)).not.toBeInTheDocument();
    });

    it('laisse le propriétaire « à assigner » quand il n’y a aucun Dir. GC', () => {
      rendre({ proprietaires: [] });
      expect(screen.getByText('Propriétaire à assigner ensuite sur la fiche (Direction GC).')).toBeInTheDocument();
    });

    it('affiche « … » tant que les propriétaires se chargent', () => {
      rendre({ proprietaires: null });
      expect(screen.getByText('…')).toBeInTheDocument();
      expect(screen.queryByText(/pilote|à assigner/)).not.toBeInTheDocument();
    });

    it('ne dit pas « Vous pilotez » sans session, même avec un seul Dir. GC', () => {
      session.mockReturnValue(null);
      rendre({ proprietaires: [DIR_GC] });
      expect(screen.queryByText('Vous créez et pilotez la fiche.')).not.toBeInTheDocument();
      expect(screen.getByText(/Awa Ndiaye \(Direction GC\)/)).toBeInTheDocument();
    });
  });

  describe('localités en chargement', () => {
    it('désactive la recherche de localité tant que le référentiel se charge', () => {
      rendre({ localites: null });
      expect(screen.getByRole('combobox', { name: 'Localisation' })).toBeDisabled();
      expect(apercu()).toBe('???_???.27');
    });
  });
});
