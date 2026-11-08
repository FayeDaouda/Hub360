import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_RIGHTS, NO_RIGHTS } from '@hub/domain';
import { confirmLeave } from '@/components/unsaved-changes-guard';
import { ApiError } from '@/lib/client-api';
import { enregistrerDroits, getMatriceRoles } from '@/lib/roles';
import type { MatriceRoles } from '@/lib/types';
import { RolesPanel } from './roles-panel';

vi.mock('@/lib/roles', () => ({ getMatriceRoles: vi.fn(), enregistrerDroits: vi.fn() }));
// La garde des modifications (montée par le panneau) utilise le routeur.
const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

const charger = vi.mocked(getMatriceRoles);
const enregistrer = vi.mocked(enregistrerDroits);

// Deux modules ; l'étape « Offres » n'a pas de Validation (sans objet).
// CIO = carte blanche (non compté, aucune case) ; CEO = transverse.
const MATRICE: MatriceRoles = {
  modules: [
    {
      cle: 'crm',
      nom: 'CRM',
      etapes: [
        {
          cle: 'crm.registre',
          nom: 'Registre',
          libelles: {
            lecture: 'voir le registre',
            ecriture: 'créer un dossier',
            validation: 'valider un dossier',
            suppression: 'archiver un dossier',
          },
        },
        {
          cle: 'crm.offres',
          nom: 'Offres',
          libelles: { lecture: 'voir les offres', ecriture: 'rédiger une offre', suppression: 'retirer une offre' },
        },
      ],
    },
    {
      cle: 'finances',
      nom: 'Finances',
      etapes: [
        {
          cle: 'finances.factures',
          nom: 'Factures',
          libelles: {
            lecture: 'voir les factures',
            ecriture: 'émettre une facture',
            validation: 'valider un paiement',
            suppression: 'annuler une facture',
          },
        },
        {
          cle: 'finances.paiements',
          nom: 'Paiements',
          libelles: { lecture: 'voir les paiements', ecriture: 'saisir un paiement' },
        },
      ],
    },
  ],
  roles: [
    { id: 'R-CIO', nom: 'CIO', transverse: true, carteBlanche: true, droits: {} },
    {
      id: 'R-CEO',
      nom: 'CEO',
      transverse: true,
      carteBlanche: false,
      droits: { 'crm.registre': { ...NO_RIGHTS, lecture: true, ecriture: true } },
    },
    { id: 'R-CFO', nom: 'CFO', transverse: false, carteBlanche: false, droits: { 'finances.factures': ALL_RIGHTS } },
    { id: 'R-COM', nom: 'Commercial', transverse: false, carteBlanche: false, droits: {} },
  ],
};

const entete = (etape: string) => screen.getByRole('button', { name: new RegExp(`^${etape}`) });
// Modules : boutons à bascule (aria-pressed).
const onglet = (module: string) => screen.getByRole('button', { name: new RegExp(`^${module}`), pressed: undefined });
const ligne = (role: string) => screen.getByRole('rowheader', { name: new RegExp(`^${role}`) }).closest('tr')!;
// Nom de la case, suivi de « , modifiée, pas encore enregistrée » une fois changée.
const caseDroit = (role: string, droit: string, module: string, etape: string) =>
  screen.getByRole('checkbox', {
    name: (nom) =>
      nom === `${role} · ${droit} · ${module} › ${etape}` ||
      nom.startsWith(`${role} · ${droit} · ${module} › ${etape},`),
  });
const casesRegistre = (role: string) => ({
  lecture: caseDroit(role, 'Lecture', 'CRM', 'Registre'),
  ecriture: caseDroit(role, 'Écriture', 'CRM', 'Registre'),
  validation: caseDroit(role, 'Validation', 'CRM', 'Registre'),
  suppression: caseDroit(role, 'Suppression', 'CRM', 'Registre'),
});
const barre = () => screen.queryByText(/pas encore enregistrées?\./);

async function afficher() {
  const user = userEvent.setup();
  render(<RolesPanel slug="grey-concrete" />);
  await screen.findByRole('region', { name: 'Droits des rôles' });
  return user;
}

beforeEach(() => {
  charger.mockReset();
  enregistrer.mockReset();
  routeur.push.mockReset();
  routeur.replace.mockReset();
  window.history.replaceState(null, '', window.location.href);
  charger.mockResolvedValue(structuredClone(MATRICE));
});

describe('RolesPanel · chargement', () => {
  it('charge la matrice de la société affichée', async () => {
    await afficher();
    expect(charger).toHaveBeenCalledWith('grey-concrete');
  });

  it('en cas d’échec, affiche l’erreur du serveur et « Réessayer » relance le chargement', async () => {
    const user = userEvent.setup();
    charger.mockReset();
    charger.mockRejectedValueOnce(new ApiError('Accès réservé au CIO.', 403)).mockResolvedValueOnce(MATRICE);
    render(<RolesPanel slug="grey-concrete" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès réservé au CIO.');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('region', { name: 'Droits des rôles' })).toBeInTheDocument();
    expect(charger).toHaveBeenCalledTimes(2);
  });

  it('erreur réseau (hors ApiError) : message de repli « le serveur ne répond pas »', async () => {
    charger.mockReset();
    charger.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<RolesPanel slug="grey-concrete" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('le serveur ne répond pas');
  });
});

describe('RolesPanel · navigation entre modules et étapes', () => {
  it('ouvre la première étape du premier module, les autres restent fermées', async () => {
    await afficher();
    expect(onglet('CRM')).toHaveAttribute('aria-pressed', 'true');
    expect(onglet('Finances')).toHaveAttribute('aria-pressed', 'false');
    expect(entete('Registre')).toHaveAttribute('aria-expanded', 'true');
    expect(entete('Offres')).toHaveAttribute('aria-expanded', 'false');
    expect(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /CRM › Offres$/ })).not.toBeInTheDocument();
  });

  it('un clic sur une autre étape l’ouvre et ferme la précédente', async () => {
    const user = await afficher();
    await user.click(entete('Offres'));
    expect(entete('Offres')).toHaveAttribute('aria-expanded', 'true');
    expect(entete('Registre')).toHaveAttribute('aria-expanded', 'false');
    expect(caseDroit('Commercial', 'Lecture', 'CRM', 'Offres')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /CRM › Registre$/ })).not.toBeInTheDocument();
  });

  it('un clic sur l’étape ouverte la referme', async () => {
    const user = await afficher();
    await user.click(entete('Registre'));
    expect(entete('Registre')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('changer de module le sélectionne et ouvre sa première étape', async () => {
    const user = await afficher();
    await user.click(entete('Offres'));
    await user.click(onglet('Finances'));
    expect(onglet('Finances')).toHaveAttribute('aria-pressed', 'true');
    expect(onglet('CRM')).toHaveAttribute('aria-pressed', 'false');
    expect(entete('Factures')).toHaveAttribute('aria-expanded', 'true');
    expect(entete('Paiements')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Registre/ })).not.toBeInTheDocument();
    expect(caseDroit('CFO', 'Suppression', 'Finances', 'Factures')).toBeChecked();
  });
});

describe('RolesPanel · résumé et affichage des rôles', () => {
  it('résume « N rôles sur M avec au moins un droit » sans compter le rôle carte blanche', async () => {
    const user = await afficher();
    expect(entete('Registre')).toHaveTextContent('1 rôle sur 3 avec au moins un droit');
    expect(entete('Offres')).toHaveTextContent('Aucun rôle n’a de droit sur cette étape');
    await user.click(onglet('Finances'));
    expect(entete('Factures')).toHaveTextContent('1 rôle sur 3 avec au moins un droit');
  });

  it('met le résumé au pluriel et le tient à jour avec les cases cochées non enregistrées', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    expect(entete('Registre')).toHaveTextContent('2 rôles sur 3 avec au moins un droit');
  });

  it('coche les droits enregistrés de chaque rôle', async () => {
    await afficher();
    const ceo = casesRegistre('CEO');
    expect(ceo.lecture).toBeChecked();
    expect(ceo.ecriture).toBeChecked();
    expect(ceo.validation).not.toBeChecked();
    expect(ceo.suppression).not.toBeChecked();
    for (const c of Object.values(casesRegistre('Commercial'))) expect(c).not.toBeChecked();
  });

  it('le rôle carte blanche n’a aucune case et l’annonce', async () => {
    await afficher();
    const cio = ligne('CIO');
    expect(within(cio).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(cio).getByText('Carte blanche : les quatre droits, partout')).toBeInTheDocument();
  });

  it('signale les rôles transverses', async () => {
    await afficher();
    expect(within(ligne('CEO')).getByText('Transverse')).toBeInTheDocument();
    expect(within(ligne('CFO')).queryByText('Transverse')).not.toBeInTheDocument();
  });

  it('un droit sans objet pour l’étape n’a pas de case', async () => {
    const user = await afficher();
    await user.click(entete('Offres'));
    expect(screen.queryByRole('checkbox', { name: /· Validation · CRM › Offres$/ })).not.toBeInTheDocument();
    expect(caseDroit('Commercial', 'Suppression', 'CRM', 'Offres')).toBeInTheDocument();
    // Une mention « sans objet » par rôle réglable (CEO, CFO, Commercial).
    expect(screen.getAllByText('Validation sans objet')).toHaveLength(3);
    expect(screen.getByText('Sans objet pour cette étape')).toBeInTheDocument();
  });
});

describe('RolesPanel · règle de cohérence des cases', () => {
  it('cocher Écriture coche aussi Lecture', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    const c = casesRegistre('Commercial');
    expect(c.ecriture).toBeChecked();
    expect(c.lecture).toBeChecked();
    expect(c.validation).not.toBeChecked();
    expect(c.suppression).not.toBeChecked();
  });

  it.each([['Validation'], ['Suppression']])('cocher %s coche aussi Lecture', async (droit) => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', droit, 'CRM', 'Registre'));
    expect(caseDroit('Commercial', droit, 'CRM', 'Registre')).toBeChecked();
    expect(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre')).toBeChecked();
  });

  it('décocher Lecture retire tous les droits du rôle sur l’étape', async () => {
    const user = await afficher();
    await user.click(caseDroit('CEO', 'Lecture', 'CRM', 'Registre'));
    for (const c of Object.values(casesRegistre('CEO'))) expect(c).not.toBeChecked();
  });

  it('décocher Écriture garde Lecture', async () => {
    const user = await afficher();
    await user.click(caseDroit('CEO', 'Écriture', 'CRM', 'Registre'));
    expect(caseDroit('CEO', 'Écriture', 'CRM', 'Registre')).not.toBeChecked();
    expect(caseDroit('CEO', 'Lecture', 'CRM', 'Registre')).toBeChecked();
  });
});

describe('RolesPanel · barre des modifications', () => {
  it('sans modification, la barre n’affiche ni compte ni boutons', async () => {
    await afficher();
    expect(barre()).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler les modifications' })).not.toBeInTheDocument();
  });

  it('compte chaque droit modifié (Écriture + Lecture induite = 2 cases)', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    expect(barre()).toHaveTextContent('2 cases modifiées, pas encore enregistrées.');
  });

  it('accorde le message au singulier pour une seule case', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    expect(barre()).toHaveTextContent('1 case modifiée, pas encore enregistrée.');
  });

  it('affiche la pastille du nombre de cases modifiées sur le module et sur l’étape', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    expect(within(onglet('CRM')).getByText('2')).toBeInTheDocument();
    expect(within(entete('Registre')).getByText('2')).toBeInTheDocument();
    expect(within(onglet('Finances')).queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(within(entete('Offres')).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('additionne les modifications de plusieurs étapes dans la pastille du module et garde le brouillon en changeant de module', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    await user.click(entete('Offres'));
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Offres'));
    expect(within(onglet('CRM')).getByText('3')).toBeInTheDocument();
    await user.click(onglet('Finances'));
    await user.click(caseDroit('CFO', 'Suppression', 'Finances', 'Factures'));
    expect(within(onglet('Finances')).getByText('1')).toBeInTheDocument();
    expect(within(onglet('CRM')).getByText('3')).toBeInTheDocument();
    expect(barre()).toHaveTextContent('4 cases modifiées');
  });

  it('revenir à l’état enregistré retire la case du compte', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    expect(barre()).toBeInTheDocument();
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    expect(barre()).not.toBeInTheDocument();
    expect(within(onglet('CRM')).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('« Annuler » remet toutes les cases comme enregistrées', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    await user.click(caseDroit('CEO', 'Lecture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: 'Annuler les modifications' }));
    for (const c of Object.values(casesRegistre('Commercial'))) expect(c).not.toBeChecked();
    expect(caseDroit('CEO', 'Lecture', 'CRM', 'Registre')).toBeChecked();
    expect(caseDroit('CEO', 'Écriture', 'CRM', 'Registre')).toBeChecked();
    expect(barre()).not.toBeInTheDocument();
    expect(enregistrer).not.toHaveBeenCalled();
  });
});

describe('RolesPanel · enregistrement', () => {
  it('« Enregistrer » envoie un changement par case (rôle × étape) avec les droits complets', async () => {
    const user = await afficher();
    enregistrer.mockResolvedValue(structuredClone(MATRICE));
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    await user.click(caseDroit('CEO', 'Lecture', 'CRM', 'Registre'));
    await user.click(onglet('Finances'));
    await user.click(caseDroit('CFO', 'Validation', 'Finances', 'Factures'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));

    expect(enregistrer).toHaveBeenCalledTimes(1);
    const [slug, changements] = enregistrer.mock.calls[0];
    expect(slug).toBe('grey-concrete');
    expect(changements).toHaveLength(3);
    expect(changements).toEqual(
      expect.arrayContaining([
        { roleId: 'R-COM', etapeCle: 'crm.registre', droits: { ...NO_RIGHTS, lecture: true, ecriture: true } },
        { roleId: 'R-CEO', etapeCle: 'crm.registre', droits: NO_RIGHTS },
        { roleId: 'R-CFO', etapeCle: 'finances.factures', droits: { ...ALL_RIGHTS, validation: false } },
      ]),
    );
  });

  it('n’envoie pas une case revenue à son état enregistré', async () => {
    const user = await afficher();
    enregistrer.mockResolvedValue(structuredClone(MATRICE));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    await user.click(caseDroit('CEO', 'Écriture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));
    expect(enregistrer.mock.calls[0][1]).toEqual([
      { roleId: 'R-CEO', etapeCle: 'crm.registre', droits: { ...NO_RIGHTS, lecture: true } },
    ]);
  });

  it('après réussite, affiche la matrice renvoyée par le serveur, vide la barre et confirme', async () => {
    const user = await afficher();
    const renvoyee = structuredClone(MATRICE);
    renvoyee.roles[3].droits['crm.registre'] = { ...NO_RIGHTS, lecture: true, ecriture: true };
    enregistrer.mockResolvedValue(renvoyee);
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Enregistré. Les personnes concernées voient le changement tout de suite',
    );
    expect(barre()).not.toBeInTheDocument();
    expect(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre')).toBeChecked();
    expect(entete('Registre')).toHaveTextContent('2 rôles sur 3');
  });

  it('le message de réussite disparaît dès qu’une case est de nouveau modifiée', async () => {
    const user = await afficher();
    enregistrer.mockResolvedValue(structuredClone(MATRICE));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));
    await screen.findByRole('status');
    await user.click(caseDroit('CFO', 'Lecture', 'CRM', 'Registre'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('en échec, garde les cases cochées, garde la barre et affiche l’erreur du serveur', async () => {
    const user = await afficher();
    enregistrer.mockRejectedValue(new ApiError('Ce rôle ne peut pas recevoir ce droit.', 409));
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce rôle ne peut pas recevoir ce droit.');
    expect(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre')).toBeChecked();
    expect(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre')).toBeChecked();
    expect(barre()).toHaveTextContent('2 cases modifiées');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ })).toBeEnabled();
  });

  it('en échec réseau (hors ApiError), affiche le message de repli « Vos cases cochées sont gardées »', async () => {
    const user = await afficher();
    enregistrer.mockRejectedValue(new TypeError('Failed to fetch'));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vos cases cochées sont gardées.');
    expect(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre')).toBeChecked();
  });

  it('« Annuler » après un échec efface aussi l’erreur', async () => {
    const user = await afficher();
    enregistrer.mockRejectedValue(new ApiError('Refusé.', 403));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Annuler les modifications' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre')).not.toBeChecked();
  });

  it('pendant l’enregistrement, cases et boutons sont désactivés', async () => {
    const user = await afficher();
    let repondre: (m: MatriceRoles) => void = () => {};
    enregistrer.mockImplementation(() => new Promise((r) => (repondre = r)));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    await user.click(screen.getByRole('button', { name: /^Enregistrer (le changement|les \d+ changements)$/ }));

    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler les modifications' })).toBeDisabled();
    expect(caseDroit('CEO', 'Lecture', 'CRM', 'Registre')).toBeDisabled();
    await act(async () => repondre(structuredClone(MATRICE)));
    expect(caseDroit('CEO', 'Lecture', 'CRM', 'Registre')).toBeEnabled();
  });
});

describe('RolesPanel · garde des modifications non enregistrées', () => {
  it('sans case modifiée, quitter l’écran ne demande rien', async () => {
    await afficher();
    await expect(confirmLeave()).resolves.toBe(true);
  });

  it('avec des cases modifiées, quitter ouvre la fenêtre qui décrit les cases en attente', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre'));
    let reponse!: Promise<boolean>;
    act(() => {
      reponse = confirmLeave();
    });
    const fenetre = screen.getByRole('alertdialog', { name: 'Modifications non enregistrées' });
    expect(fenetre).toHaveAccessibleDescription(
      /2 cases modifiées dans les droits des rôles ne sont pas encore enregistrées/,
    );
    await user.click(within(fenetre).getByRole('button', { name: 'Rester sur la page' }));
    await expect(reponse).resolves.toBe(false);
    expect(caseDroit('Commercial', 'Écriture', 'CRM', 'Registre')).toBeChecked();
  });

  it('« Enregistrer et continuer » enregistre les droits du panneau puis laisse partir', async () => {
    const user = await afficher();
    enregistrer.mockResolvedValue(structuredClone(MATRICE));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    let reponse!: Promise<boolean>;
    act(() => {
      reponse = confirmLeave();
    });
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    await expect(reponse).resolves.toBe(true);
    expect(enregistrer).toHaveBeenCalledWith('grey-concrete', [
      { roleId: 'R-COM', etapeCle: 'crm.registre', droits: { ...NO_RIGHTS, lecture: true } },
    ]);
  });

  it('« Enregistrer et continuer » en échec : on reste, les cases sont gardées', async () => {
    const user = await afficher();
    enregistrer.mockRejectedValue(new ApiError('Refusé.', 403));
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    act(() => {
      void confirmLeave();
    });
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    const fenetre = screen.getByRole('alertdialog', { name: 'Modifications non enregistrées' });
    // Le message précis du serveur, repris dans la fenêtre.
    expect(within(fenetre).getByRole('alert')).toHaveTextContent('Refusé. Réessayez ou restez sur la page.');
    expect(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre')).toBeChecked();
  });
});

describe('RolesPanel · lecteur d’écran', () => {
  it('une case modifiée l’annonce dans son nom', async () => {
    const user = await afficher();
    await user.click(caseDroit('Commercial', 'Lecture', 'CRM', 'Registre'));
    expect(
      screen.getByRole('checkbox', { name: 'Commercial · Lecture · CRM › Registre, modifiée, pas encore enregistrée' }),
    ).toBeInTheDocument();
  });
});
