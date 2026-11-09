import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ETAPE } from '@hub/domain';
import { niveauSuffisant } from '@/lib/auth';
import { getHistorique } from '@/lib/crm';
import { getDevis } from '@/lib/devis';
import { contresigneAffaire } from '@/lib/seuil-ceo';
import type { Devis, OffreDossier, Personne, Projet, Societe } from '@/lib/types';
import { CycleDossier } from './cycle-dossier';

// --- Doublures ---------------------------------------------------------------
// Réseau (historique, lecture de l'offre), droits de la matrice et seuil de
// contresignature remplacés ; la liste des actions (lib/cycle-crm), la
// confirmation en ligne et l'aperçu de l'offre restent les vrais.

vi.mock('@/lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crm')>()),
  getHistorique: vi.fn(),
}));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  niveauSuffisant: vi.fn(() => false),
}));
vi.mock('@/lib/devis', () => ({ getDevis: vi.fn() }));
vi.mock('@/lib/seuil-ceo', () => ({
  useContresignature: vi.fn(() => ({ seuil: null, delegue: false })),
  contresigneAffaire: vi.fn(() => true),
}));
vi.mock('@/lib/layout-contexte', () => ({
  useSessionCourante: vi.fn(() => ({})),
  useSocieteCourante: vi.fn(() => SOCIETE),
}));

const historiqueMock = vi.mocked(getHistorique);
const niveauMock = vi.mocked(niveauSuffisant);
const getDevisMock = vi.mocked(getDevis);
const contresigneMock = vi.mocked(contresigneAffaire);

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
  couleurMarque: null,
  icone: null,
  secteur: null,
  mentionsLegales: null,
  coordonnees: null,
  penaliteRetardMensuelle: null,
};

const DIR_GC: Personne = { id: 'u-dirgc', nom: 'Awa Ndiaye' };
const COO: Personne = { id: 'u-coo', nom: 'Fatou Sarr' };

// Droits de la matrice par profil : « étape:niveau ».
const DROITS = {
  // CFO : valide (et renvoie) les offres.
  cfo: ['finances_devis:validation'],
  // Dir. GC : gère les dossiers (déclarer perdu), pas de décision sur l'offre.
  dirGc: [`${ETAPE.crmDossiers}:ecriture`],
  // Lecteur : aucun droit d'action.
  lecteur: [],
} as const;

function droits(profil: keyof typeof DROITS) {
  const accordes: readonly string[] = DROITS[profil];
  niveauMock.mockImplementation((_session, module, niveau) => accordes.includes(`${module}:${niveau}`));
}

const OFFRE: OffreDossier = {
  id: 'of-1',
  reference: null,
  statutEffectif: 'brouillon',
  objet: 'Conception villa R+1',
  nbLignes: 1,
  lignesAZero: 0,
  montantTtc: 1_180_000,
  dateEnvoi: null,
  dateValidite: null,
  dateReponse: null,
  relancesEnvoyees: 0,
  relanceAFaire: false,
};

// Dossier soumis au CFO (fiche complète, figée), avec son offre lisible.
const dossierSoumis = (champs: Partial<Projet> = {}): Projet => ({
  id: 'p-1',
  code: 'DFS_ALM.26',
  nature: 'mandat_client',
  categorie: 'conception',
  localisation: 'Almadies',
  localite: { id: 'loc-alm', code: 'ALM', nom: 'Almadies' },
  type: 'villa',
  nbPlanches: 2,
  surfaceTerrain: 450,
  client: { id: 'cli-1', nom: 'Daouda Faye Sow', type: 'particulier' },
  standing: 'moyen',
  gamme: 'local',
  programme: 'Villa R+1, 4 chambres',
  ficheProgramme: null,
  statut: 'en_validation',
  projetId: null,
  verrouillee: true,
  creeLe: '2026-11-08T12:00:00Z',
  creePar: COO,
  proprietaire: DIR_GC,
  categorieConception: null,
  offreExpiree: false,
  soumisLe: '2026-11-09T09:00:00Z',
  renvoi: null,
  archive: null,
  offre: OFFRE,
  ...champs,
});

// Sans la Lecture de l'offre, le serveur n'envoie pas la clé `offre`.
function sansCleOffre(p: Projet): Projet {
  const copie = { ...p };
  delete copie.offre;
  return copie;
}

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
  lignes: [],
  montantHt: 1_000_000,
  montantTva: 180_000,
  montantTtc: 1_180_000,
  messageIntroduction: '',
  messageIntroductionPersonnalise: false,
  delaisEcheancier: {},
  creeLe: '2026-11-02T08:00:00Z',
};

const NOM_APERCU = 'Offre DFS_ALM.26 · aperçu avant envoi';

function afficher(projet: Projet, onAgir = vi.fn().mockResolvedValue(undefined)) {
  const rendu = render(<CycleDossier slug={SLUG} projet={projet} onAgir={onAgir} />);
  return { ...rendu, onAgir };
}

// Aperçu ouvert et document affiché (bouton de validation actif).
async function apercuCharge() {
  const fenetre = await screen.findByRole('dialog', { name: NOM_APERCU });
  await within(fenetre).findByText('Aperçu avant envoi');
  return fenetre;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: MAINTENANT });
  historiqueMock.mockReset().mockResolvedValue([]);
  getDevisMock.mockReset().mockResolvedValue(DEVIS);
  contresigneMock.mockReset().mockReturnValue(true);
  niveauMock.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Offre soumise · CFO (droit de décision)', () => {
  beforeEach(() => droits('cfo'));

  it('propose « Voir l’offre et valider » à la place de la validation directe', () => {
    afficher(dossierSoumis());
    expect(screen.getByRole('button', { name: 'Voir l’offre et valider' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Valider et envoyer l’offre' })).not.toBeInTheDocument();
    // Pas de doublon « Voir l'offre » pour qui peut valider.
    expect(screen.queryByRole('button', { name: 'Voir l’offre' })).not.toBeInTheDocument();
  });

  it('ouvre l’aperçu au clic, sans confirmation en ligne et sans rien envoyer', async () => {
    const user = userEvent.setup();
    const { onAgir } = afficher(dossierSoumis());
    await user.click(screen.getByRole('button', { name: 'Voir l’offre et valider' }));

    const fenetre = await apercuCharge();
    expect(getDevisMock).toHaveBeenCalledWith(SLUG, 'of-1');
    expect(within(fenetre).getByRole('button', { name: /Valider et envoyer l’offre/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Confirmer' })).not.toBeInTheDocument();
    expect(onAgir).not.toHaveBeenCalled();
  });

  it('valide l’offre depuis l’aperçu (sans commentaire) puis ferme l’aperçu', async () => {
    const user = userEvent.setup();
    const { onAgir } = afficher(dossierSoumis());
    await user.click(screen.getByRole('button', { name: 'Voir l’offre et valider' }));
    const fenetre = await apercuCharge();

    await user.click(within(fenetre).getByRole('button', { name: /Valider et envoyer l’offre/ }));
    expect(onAgir).toHaveBeenCalledTimes(1);
    expect(onAgir).toHaveBeenCalledWith('valider');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM_APERCU })).not.toBeInTheDocument());
  });

  it('garde l’aperçu ouvert avec l’erreur du serveur si la validation échoue', async () => {
    const user = userEvent.setup();
    const onAgir = vi.fn().mockRejectedValue(new Error('L’offre a déjà été envoyée.'));
    afficher(dossierSoumis(), onAgir);
    await user.click(screen.getByRole('button', { name: 'Voir l’offre et valider' }));
    const fenetre = await apercuCharge();

    await user.click(within(fenetre).getByRole('button', { name: /Valider et envoyer l’offre/ }));
    expect(await within(fenetre).findByText('L’offre a déjà été envoyée.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: NOM_APERCU })).toBeInTheDocument();
    expect(within(fenetre).getByRole('button', { name: /Valider et envoyer l’offre/ })).toBeEnabled();
  });

  it('referme l’aperçu sans rien envoyer et rend les boutons du cycle', async () => {
    const user = userEvent.setup();
    const { onAgir } = afficher(dossierSoumis());
    await user.click(screen.getByRole('button', { name: 'Voir l’offre et valider' }));
    const fenetre = await apercuCharge();

    await user.click(within(fenetre).getAllByRole('button', { name: 'Fermer' })[0]);
    expect(screen.queryByRole('dialog', { name: NOM_APERCU })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir l’offre et valider' })).toBeInTheDocument();
    expect(onAgir).not.toHaveBeenCalled();
  });

  it('« Renvoyer… » ferme l’aperçu et ouvre la confirmation du renvoi en ligne', async () => {
    const user = userEvent.setup();
    const { onAgir } = afficher(dossierSoumis());
    await user.click(screen.getByRole('button', { name: 'Voir l’offre et valider' }));
    const fenetre = await apercuCharge();

    await user.click(within(fenetre).getByRole('button', { name: 'Renvoyer…' }));
    expect(screen.queryByRole('dialog', { name: NOM_APERCU })).not.toBeInTheDocument();
    expect(screen.getByText('Le dossier revient en « Nouveau projet » avec ton commentaire.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Commentaire pour l’équipe' })).toBeInTheDocument();
    expect(onAgir).not.toHaveBeenCalled();
  });

  it('exige le commentaire avant de renvoyer le dossier', async () => {
    const user = userEvent.setup();
    const { onAgir } = afficher(dossierSoumis());
    await user.click(screen.getByRole('button', { name: 'Voir l’offre et valider' }));
    await user.click(within(await apercuCharge()).getByRole('button', { name: 'Renvoyer…' }));

    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByText('Commentaire pour l’équipe : obligatoire.')).toBeInTheDocument();
    // Des espaces seuls ne valent pas un commentaire.
    await user.type(screen.getByRole('textbox', { name: 'Commentaire pour l’équipe' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onAgir).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('textbox', { name: 'Commentaire pour l’équipe' }));
    await user.type(screen.getByRole('textbox', { name: 'Commentaire pour l’équipe' }), '  Revoir la surface  ');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onAgir).toHaveBeenCalledTimes(1);
    expect(onAgir).toHaveBeenCalledWith('renvoyer', 'Revoir la surface');
  });

  it('demande l’avis du seuil de contresignature avec le montant TTC de l’offre', () => {
    afficher(dossierSoumis());
    expect(contresigneMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1_180_000);
  });

  it('désactive « Voir l’offre et valider » quand l’offre n’est pas lisible (clé absente)', async () => {
    const user = userEvent.setup();
    afficher(sansCleOffre(dossierSoumis()));
    const bouton = screen.getByRole('button', { name: 'Voir l’offre et valider' });
    expect(bouton).toBeDisabled();
    await user.click(bouton);
    expect(screen.queryByRole('dialog', { name: NOM_APERCU })).not.toBeInTheDocument();
    expect(getDevisMock).not.toHaveBeenCalled();
  });

  it('désactive « Voir l’offre et valider » quand le dossier n’a pas d’offre', () => {
    afficher(dossierSoumis({ offre: null }));
    expect(screen.getByRole('button', { name: 'Voir l’offre et valider' })).toBeDisabled();
  });
});

describe('Offre soumise · contresignataire en deçà du seuil', () => {
  beforeEach(() => {
    droits('cfo');
    contresigneMock.mockReturnValue(false);
  });

  it('ne propose que la consultation : ni validation ni renvoi', async () => {
    const user = userEvent.setup();
    const { onAgir } = afficher(dossierSoumis());
    expect(screen.queryByRole('button', { name: 'Voir l’offre et valider' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renvoyer' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voir l’offre' }));
    const fenetre = await apercuCharge();
    expect(within(fenetre).queryByRole('button', { name: /Valider et envoyer/ })).not.toBeInTheDocument();
    expect(within(fenetre).queryByRole('button', { name: 'Renvoyer…' })).not.toBeInTheDocument();
    expect(onAgir).not.toHaveBeenCalled();
  });
});

describe('Offre soumise · lecteur sans droit de décision', () => {
  it('« Voir l’offre » ouvre l’aperçu sans bouton de validation (lecteur seul)', async () => {
    droits('lecteur');
    const user = userEvent.setup();
    const { onAgir } = afficher(dossierSoumis());
    expect(screen.queryByRole('button', { name: 'Voir l’offre et valider' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voir l’offre' }));
    const fenetre = await apercuCharge();
    expect(within(fenetre).queryByRole('button', { name: /Valider et envoyer/ })).not.toBeInTheDocument();
    expect(within(fenetre).queryByRole('button', { name: 'Renvoyer…' })).not.toBeInTheDocument();
    expect(onAgir).not.toHaveBeenCalled();
  });

  it('Dir. GC : « Voir l’offre » à côté de « Déclarer perdu », aperçu en consultation', async () => {
    droits('dirGc');
    const user = userEvent.setup();
    afficher(dossierSoumis());
    expect(screen.getByRole('button', { name: 'Déclarer perdu' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voir l’offre' }));
    const fenetre = await apercuCharge();
    expect(within(fenetre).queryByRole('button', { name: /Valider et envoyer/ })).not.toBeInTheDocument();
  });

  it('referme l’aperçu en consultation par la croix', async () => {
    droits('lecteur');
    const user = userEvent.setup();
    afficher(dossierSoumis());
    await user.click(screen.getByRole('button', { name: 'Voir l’offre' }));
    const fenetre = await apercuCharge();
    await user.click(within(fenetre).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog', { name: NOM_APERCU })).not.toBeInTheDocument();
  });
});

describe('Offre soumise · sans droit de lecture de l’offre (pas de clé `offre`)', () => {
  it('lecteur : rien à afficher, aucun bouton d’aperçu', async () => {
    droits('lecteur');
    const { container } = afficher(sansCleOffre(dossierSoumis()));
    await waitFor(() => expect(historiqueMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /Voir l’offre/ })).not.toBeInTheDocument();
    expect(getDevisMock).not.toHaveBeenCalled();
  });

  it('Dir. GC : seulement « Déclarer perdu », aucun bouton d’aperçu', () => {
    droits('dirGc');
    afficher(sansCleOffre(dossierSoumis()));
    expect(screen.getByRole('button', { name: 'Déclarer perdu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voir l’offre/ })).not.toBeInTheDocument();
  });
});

describe('Offre hors validation', () => {
  it('n’ouvre pas d’aperçu avant envoi sur une offre déjà envoyée', () => {
    droits('dirGc');
    afficher(
      dossierSoumis({
        statut: 'offre_envoyee',
        offre: { ...OFFRE, reference: 'GC-OF12', statutEffectif: 'envoye', dateValidite: '2026-11-16' },
      }),
    );
    expect(screen.queryByRole('button', { name: /Voir l’offre/ })).not.toBeInTheDocument();
  });
});
