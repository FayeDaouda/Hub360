import { Suspense } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annuaire, CollegueAnnuaire } from '@/lib/annuaire';
import AnnuairePage from './page';

const api = vi.hoisted(() => ({ getAnnuaire: vi.fn() }));
vi.mock('@/lib/annuaire', async (original) => ({ ...(await original<typeof import('@/lib/annuaire')>()), ...api }));
const chat = vi.hoisted(() => ({ ouvrirDirect: vi.fn(), ouvrirConversation: vi.fn() }));
vi.mock('@/lib/chat', async (original) => ({ ...(await original<typeof import('@/lib/chat')>()), ...chat }));
const session = vi.hoisted(() => ({
  courante: { utilisateur: { id: 'U1' }, permissions: { communication: 'E' } as Record<string, string> },
}));
vi.mock('@/lib/layout-contexte', () => ({
  useTitrePage: () => undefined,
  useSessionCourante: () => session.courante,
}));
const nav = vi.hoisted(() => ({ parametres: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.parametres,
  useRouter: () => ({ replace: nav.replace }),
}));

const c = (
  x: Partial<CollegueAnnuaire> & Pick<CollegueAnnuaire, 'utilisateurId' | 'prenom' | 'nom'>,
): CollegueAnnuaire => ({
  nomAffiche: null,
  photoUrl: null,
  poste: 'Architecte',
  cellule: 'Conception',
  chef: null,
  estChef: false,
  telephone: '+221 77 000 00 00',
  email: `${x.prenom.toLowerCase()}@gc.sn`,
  societe: { slug: 'grey-concrete', nom: 'Grey Concrete' },
  memeSociete: true,
  absentJusquau: null,
  ...x,
});
const MOI = c({ utilisateurId: 'U1', prenom: 'Awa', nom: 'Diop' });
const LEA = c({ utilisateurId: 'U2', prenom: 'Léa', nom: 'Ndiaye', estChef: true });
const MOUSSA = c({ utilisateurId: 'U3', prenom: 'Moussa', nom: 'Sow', cellule: null, absentJusquau: '2026-11-25' });
const KOFFI = c({
  utilisateurId: 'U4',
  prenom: 'Koffi',
  nom: 'Mensah',
  poste: 'CFO',
  cellule: null,
  societe: { slug: 'coded', nom: "CODE'D" },
  memeSociete: false,
});
const annuaire = (x: Partial<Annuaire> = {}): Annuaire => ({
  perimetre: 'societe',
  societes: [{ slug: 'grey-concrete', nom: 'Grey Concrete' }],
  membres: [MOI, LEA, MOUSSA],
  peutVoirAgendas: false,
  ...x,
});
const monter = () =>
  act(async () => {
    render(
      <Suspense fallback={null}>
        <AnnuairePage params={Promise.resolve({ slug: 'gc' })} />
      </Suspense>,
    );
  });
const noms = () => screen.getAllByTitle(/^Fiche de /).map((b) => b.getAttribute('title'));

// Annuaire (22/11/2026).
describe('Page Annuaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAnnuaire.mockResolvedValue(annuaire());
    nav.parametres = new URLSearchParams();
    session.courante = { utilisateur: { id: 'U1' }, permissions: { communication: 'E' } };
  });

  it('les collègues, « Vous » pour soi (sans actions), l’absence du jour', async () => {
    await monter();
    expect(await screen.findByText('3 collègues')).toBeInTheDocument();
    expect(noms()).toEqual(['Fiche de Awa Diop', 'Fiche de Léa Ndiaye', 'Fiche de Moussa Sow']);
    const moi = screen.getByTitle('Fiche de Awa Diop').closest('li')!;
    expect(within(moi).getByText('Vous')).toBeInTheDocument();
    expect(within(moi).queryByRole('group', { name: /Contacter/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Absent · 25 novembre/)).toBeInTheDocument();
    // Pas de filtre société avec une seule société.
    expect(screen.queryByRole('combobox', { name: 'Société' })).not.toBeInTheDocument();
  });

  it('recherche instantanée et filtres ; « Effacer » quand rien ne correspond', async () => {
    await monter();
    await screen.findByText('3 collègues');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un collègue' }), 'lea');
    expect(noms()).toEqual(['Fiche de Léa Ndiaye']);
    expect(screen.getByText('1 collègue sur 3')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), ' zzz');
    expect(screen.getByText('Aucun collègue ne correspond à cette recherche.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche et les filtres' }));
    expect(noms()).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /Absents aujourd’hui/ }));
    expect(noms()).toEqual(['Fiche de Moussa Sow']);
  });

  it('par cellule : un groupe par cellule, le chef en tête, « Sans cellule » en dernier', async () => {
    await monter();
    await screen.findByText('3 collègues');
    await userEvent.click(screen.getByRole('radio', { name: 'Par cellule' }));
    const groupes = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(groupes).toEqual(['Conception', '—']);
    expect(within(screen.getByRole('region', { name: 'Conception' })).getAllByTitle(/^Fiche/)[0]).toHaveAttribute(
      'title',
      'Fiche de Léa Ndiaye',
    );
  });

  it('fiche : ouverte au clic, avec sa cellule ; « Écrire » ouvre la conversation dans la messagerie', async () => {
    chat.ouvrirDirect.mockResolvedValue({ id: 'C9' });
    await monter();
    await userEvent.click(await screen.findByTitle('Fiche de Léa Ndiaye'));
    const fiche = await screen.findByRole('dialog', { name: 'Léa Ndiaye' });
    expect(within(fiche).getByText('Chef d’équipe')).toBeInTheDocument();
    // Les autres membres de sa cellule (soi compris).
    expect(within(fiche).getByRole('button', { name: /Awa Diop/ })).toBeInTheDocument();
    await userEvent.click(within(fiche).getByRole('button', { name: /Écrire/ }));
    expect(chat.ouvrirDirect).toHaveBeenCalledWith('gc', 'U2');
    expect(chat.ouvrirConversation).toHaveBeenCalledWith('C9');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('« ?personne=… » ouvre la fiche d’emblée, puis le paramètre quitte l’adresse', async () => {
    nav.parametres = new URLSearchParams('personne=U3');
    await monter();
    expect(await screen.findByRole('dialog', { name: 'Moussa Sow' })).toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith('/admin/gc/annuaire', { scroll: false });
  });

  it('sans le droit d’écrire dans la messagerie : pas de « Écrire »', async () => {
    session.courante = { utilisateur: { id: 'U1' }, permissions: { communication: 'L' } };
    await monter();
    await screen.findByText('3 collègues');
    expect(screen.queryByTitle(/Écrire à/)).not.toBeInTheDocument();
  });

  it('tout le groupe : filtre société ; autre société : ni « Écrire » ni agenda ; agenda avec le droit seulement', async () => {
    api.getAnnuaire.mockResolvedValue(
      annuaire({
        perimetre: 'groupe',
        societes: [
          { slug: 'grey-concrete', nom: 'Grey Concrete' },
          { slug: 'coded', nom: "CODE'D" },
        ],
        membres: [MOI, LEA, KOFFI],
        peutVoirAgendas: true,
      }),
    );
    await monter();
    await screen.findByText(/3 collègues · 2 sociétés/);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Société' }), 'coded');
    expect(noms()).toEqual(['Fiche de Koffi Mensah']);
    const koffi = screen.getByTitle('Fiche de Koffi Mensah').closest('li')!;
    expect(within(koffi).queryByTitle(/Écrire à/)).not.toBeInTheDocument();
    expect(within(koffi).queryByTitle(/agenda/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Société' }), '');
    const lea = screen.getByTitle('Fiche de Léa Ndiaye').closest('li')!;
    expect(within(lea).getByTitle('Voir l’agenda de Léa Ndiaye')).toHaveAttribute(
      'href',
      '/admin/gc/agenda?collegue=U2',
    );
  });
});
