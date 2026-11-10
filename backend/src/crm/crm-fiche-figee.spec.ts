import { BadRequestException, ConflictException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { DevisService } from '../devis/devis.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmService } from './crm.service';
import { normaliserFiche } from './fiche-programme';
import { PREFIXE_TRACE } from './fiche-figee';

// modifierFiche après la soumission au CFO (09/11/2026) : réservé à
// l'Écriture de « Modifier une fiche figée » (crm.fiche_figee), sans les
// champs du prix ; chaque changement réel est tracé (ligne regroupée par
// auteur dans les 30 min), répercuté sur le projet d'exécution et notifié
// APRÈS la transaction.

const MAINTENANT = new Date('2026-11-09T10:00:00Z');

// Villa R+1 avec 1 sous-sol : 3 planches calculées.
const VILLA = {
  typeProjet: 'residentiel',
  usage: 'maisons_individuelles',
  forme: 'villa',
  gabarit: 1,
  sousSols: 1,
  typologieVilla: 'F5',
};

type Dossier = {
  statut: string;
  archiveLe: Date | null;
  nbPlanches: number;
  categorie: string | null;
  surfaceTerrain: number;
  standing: string | null;
  gamme: string | null;
  ficheProgramme: unknown;
  projet: { id: string } | null;
};

const EN_VALIDATION: Dossier = {
  statut: 'en_validation',
  archiveLe: null,
  nbPlanches: 3,
  categorie: 'conception',
  surfaceTerrain: 400,
  standing: 'moyen',
  gamme: 'economique',
  ficheProgramme: normaliserFiche(VILLA),
  projet: null,
};

// Ligne relue après l'écriture (INCLUDE_DOSSIER), assez complète pour versDossierCrm.
const relu = (d: Dossier) => ({
  id: 'D1',
  code: 'TCP_ALM.26',
  nature: null,
  localisation: '',
  type: null,
  programme: 'Villa R+1 · 1 sous-sol · F5',
  client: { id: 'C1', numero: 1, nom: 'Teranga Capital', type: 'entreprise', adresse: '' },
  localite: null,
  creePar: null,
  apporteurUtilisateur: null,
  proprietaire: null,
  archivePar: null,
  offres: [],
  transitions: [],
  createdAt: MAINTENANT,
  categorieConception: null,
  ...d,
});

type Derniere = { id: string; parId: string | null; commentaire: string | null; creeLe: Date } | null;

function svc(opts: { dossier?: Dossier; derniere?: Derniere; brouillons?: number; echecTx?: boolean } = {}) {
  const dossier = opts.dossier ?? EN_VALIDATION;
  // Écritures : uniquement sur le client de transaction (tx), jamais en direct.
  const tx = {
    dossierCrm: { update: jest.fn(({ data }) => Promise.resolve({ ...relu(dossier), ...stripUndefined(data) })) },
    dossierCrmTransition: {
      findFirst: jest.fn().mockResolvedValue(opts.derniere ?? null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    projet: { update: jest.fn().mockResolvedValue({}) },
  };
  const $transaction = jest.fn(async (f: (t: typeof tx) => unknown) => {
    const r = await f(tx);
    if (opts.echecTx) throw new Error('validation de la transaction impossible');
    return r;
  });
  const prisma = {
    dossierCrm: { findFirst: jest.fn().mockResolvedValue(dossier) },
    devis: { count: jest.fn().mockResolvedValue(opts.brouillons ?? 0) },
    $transaction,
  };
  const notifierDossierCrm = jest.fn().mockResolvedValue(undefined);
  const s = new CrmService(
    prisma as unknown as PrismaService,
    {} as DevisService,
    {} as FacturationService,
    { notifierDossierCrm } as unknown as NotificationsService,
    {} as SeuilCeoService,
    {} as OnboardingService,
  );
  return { s, tx, $transaction, notifierDossierCrm };
}

function stripUndefined(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const AVEC_DROIT = { userId: 'U1', role: 'Dir. GC', permissions: { 'crm.dossiers': 'LE', 'crm.fiche_figee': 'LE' } };
const SANS_DROIT = { userId: 'U1', role: 'Dir. GC', permissions: { 'crm.dossiers': 'LE' } };

beforeEach(() => {
  // Horloge figée : la fenêtre de regroupement de la trace se calcule sur new Date().
  jest.useFakeTimers({ now: MAINTENANT, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
});
afterEach(() => jest.useRealTimers());

describe('CrmService.modifierFiche · droit « Modifier une fiche figée »', () => {
  it('fiche figée sans le droit → 409 « Fiche verrouillée », rien écrit ni notifié', async () => {
    const { s, $transaction, notifierDossierCrm } = svc();
    const appel = s.modifierFiche('S1', SANS_DROIT, 'D1', { standing: 'grand' });
    await expect(appel).rejects.toThrow(ConflictException);
    await expect(appel).rejects.toThrow('Fiche verrouillée depuis la soumission de l’offre.');
    expect($transaction).not.toHaveBeenCalled();
    expect(notifierDossierCrm).not.toHaveBeenCalled();
  });

  it('Lecture seule de l’étape → refusé (l’Écriture est exigée)', async () => {
    const { s } = svc();
    const lecture = { ...SANS_DROIT, permissions: { 'crm.fiche_figee': 'L' } };
    await expect(s.modifierFiche('S1', lecture, 'D1', { standing: 'grand' })).rejects.toThrow('Fiche verrouillée');
  });

  it('Validation sans Écriture → refusé (droits indépendants)', async () => {
    const { s } = svc();
    const validation = { ...SANS_DROIT, permissions: { 'crm.fiche_figee': 'LV' } };
    await expect(s.modifierFiche('S1', validation, 'D1', { standing: 'grand' })).rejects.toThrow('Fiche verrouillée');
  });

  it.each(['offre_envoyee', 'onboard', 'perdu'])('statut %s sans le droit → verrouillée aussi', async (statut) => {
    const { s } = svc({ dossier: { ...EN_VALIDATION, statut } });
    await expect(s.modifierFiche('S1', SANS_DROIT, 'D1', { gamme: 'moyen' })).rejects.toThrow('Fiche verrouillée');
  });

  it('dossier archivé → refusé avant tout contrôle de droit', async () => {
    const { s, $transaction } = svc({ dossier: { ...EN_VALIDATION, archiveLe: new Date('2026-11-01') } });
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { standing: 'grand' })).rejects.toThrow();
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe('CrmService.modifierFiche · champs du prix figés', () => {
  it('standing, gamme et fiche Programme (typologie) acceptés avec le droit', async () => {
    const { s, tx } = svc();
    const res = await s.modifierFiche('S1', AVEC_DROIT, 'D1', {
      standing: 'grand',
      gamme: 'moyen',
      ficheProgramme: { ...VILLA, typologieVilla: 'F4' },
    });
    const data = tx.dossierCrm.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ standing: 'grand', gamme: 'moyen' });
    // Fiche figée : les planches (prix de l'offre) ne se réécrivent jamais.
    expect(data.nbPlanches).toBeUndefined();
    expect(data.programme).toBe('Villa R+1 · 1 sous-sol · F4');
    expect(res).toMatchObject({ id: 'D1', standing: 'grand', statut: 'en_validation', verrouillee: true });
  });

  it('fiche Programme rendue incomplète → 400, le programme de l’offre ne se vide pas', async () => {
    const { s, tx } = svc();
    const sansTypologie = { ...VILLA, typologieVilla: undefined };
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: sansTypologie })).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.dossierCrm.update).not.toHaveBeenCalled();
  });

  it('ancien dossier SANS fiche Programme : en remplir une donnerait une forme bâtie → refusé', async () => {
    // La forme désigne l'ouvrage sur les factures émises : figée, même absente.
    const { s, tx } = svc({ dossier: { ...EN_VALIDATION, ficheProgramme: null } });
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: VILLA })).rejects.toThrow('Forme bâtie');
    expect(tx.dossierCrm.update).not.toHaveBeenCalled();
  });

  it('forme bâtie changée (villa → immeuble) → 409 qui nomme « Forme bâtie »', async () => {
    const { s } = svc();
    const immeuble = {
      typeProjet: 'residentiel',
      usage: 'maisons_individuelles',
      forme: 'immeuble',
      gabarit: 1,
      sousSols: 1,
    };
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: immeuble })).rejects.toThrow('Forme bâtie');
  });

  it('ancien dossier aux planches saisies à la main (≠ calcul) : la fiche reste modifiable', async () => {
    // Calcul de la fiche = 3 planches, stockées 5 (saisie d'avant la fiche) :
    // seul un CHANGEMENT du calcul est refusé, pas l'écart d'origine.
    const { s, tx } = svc({ dossier: { ...EN_VALIDATION, nbPlanches: 5 } });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...VILLA, typologieVilla: 'F4' } });
    const data = tx.dossierCrm.update.mock.calls[0][0].data;
    expect(data.nbPlanches).toBeUndefined();
    expect(data.programme).toBe('Villa R+1 · 1 sous-sol · F4');
  });

  it('catégorie changée → 409 qui nomme « Catégorie », rien écrit', async () => {
    const { s, $transaction } = svc();
    const appel = s.modifierFiche('S1', AVEC_DROIT, 'D1', { categorie: 'amenagement' });
    await expect(appel).rejects.toThrow(ConflictException);
    await expect(appel).rejects.toThrow(/^Catégorie : .*Refaire une offre/);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('surface changée → 409 qui nomme « Surface du terrain »', async () => {
    const { s } = svc();
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { surfaceTerrain: 500 })).rejects.toThrow(
      /^Surface du terrain : /,
    );
  });

  it('planches saisies différentes → 409 qui nomme « Nombre de planches »', async () => {
    const { s } = svc({ dossier: { ...EN_VALIDATION, ficheProgramme: null } });
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { nbPlanches: 5 })).rejects.toThrow(/^Nombre de planches : /);
  });

  it('planches recalculées depuis la fiche Programme (R+1 → R+2) → 409, même sans planches saisies', async () => {
    const { s, $transaction, notifierDossierCrm } = svc();
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...VILLA, gabarit: 2 } })).rejects.toThrow(
      /^Nombre de planches : /,
    );
    expect($transaction).not.toHaveBeenCalled();
    expect(notifierDossierCrm).not.toHaveBeenCalled();
  });

  it('plusieurs champs du prix → tous nommés dans le message', async () => {
    const { s } = svc();
    await expect(
      s.modifierFiche('S1', AVEC_DROIT, 'D1', { categorie: 'developpement', surfaceTerrain: 1, nbPlanches: 9 }),
    ).rejects.toThrow(/^Catégorie, Surface du terrain, Nombre de planches : /);
  });

  it('mêmes catégorie, surface et planches renvoyées par l’écran → acceptées', async () => {
    const { s, tx } = svc({ dossier: { ...EN_VALIDATION, ficheProgramme: null } });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', {
      categorie: 'conception',
      surfaceTerrain: 400,
      nbPlanches: 3,
      standing: 'grand',
    });
    expect(tx.dossierCrm.update).toHaveBeenCalledTimes(1);
  });
});

describe('CrmService.modifierFiche · trace dans l’historique', () => {
  it('changement réel → nouvelle ligne même statut avant/après, champs nommés', async () => {
    const { s, tx } = svc();
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { standing: 'grand', gamme: 'moyen' });
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledWith({
      data: {
        dossierId: 'D1',
        de: 'en_validation',
        vers: 'en_validation',
        parId: 'U1',
        commentaire: 'Fiche modifiée après soumission : standing, gamme',
      },
    });
    expect(tx.dossierCrmTransition.update).not.toHaveBeenCalled();
  });

  it('dernière ligne du même auteur il y a 10 min → complétée (update), pas de nouvelle ligne', async () => {
    const { s, tx } = svc({
      derniere: {
        id: 'T9',
        parId: 'U1',
        commentaire: `${PREFIXE_TRACE}standing`,
        creeLe: new Date(MAINTENANT.getTime() - 10 * 60 * 1000),
      },
    });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { standing: 'grand', gamme: 'moyen' });
    expect(tx.dossierCrmTransition.update).toHaveBeenCalledWith({
      where: { id: 'T9' },
      data: { commentaire: 'Fiche modifiée après soumission : standing, gamme' },
    });
    expect(tx.dossierCrmTransition.create).not.toHaveBeenCalled();
  });

  it('dernière ligne d’un autre auteur → nouvelle ligne', async () => {
    const { s, tx } = svc({
      derniere: { id: 'T9', parId: 'U2', commentaire: `${PREFIXE_TRACE}standing`, creeLe: MAINTENANT },
    });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { gamme: 'moyen' });
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledTimes(1);
    expect(tx.dossierCrmTransition.update).not.toHaveBeenCalled();
  });

  it('dernière ligne du même auteur il y a 31 min → nouvelle ligne', async () => {
    const { s, tx } = svc({
      derniere: {
        id: 'T9',
        parId: 'U1',
        commentaire: `${PREFIXE_TRACE}standing`,
        creeLe: new Date(MAINTENANT.getTime() - 31 * 60 * 1000),
      },
    });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { gamme: 'moyen' });
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledTimes(1);
    expect(tx.dossierCrmTransition.update).not.toHaveBeenCalled();
  });

  it('dernière ligne = la soumission au CFO (même auteur) → nouvelle ligne, la soumission reste intacte', async () => {
    const { s, tx } = svc({
      derniere: { id: 'T1', parId: 'U1', commentaire: null, creeLe: MAINTENANT },
    });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { gamme: 'moyen' });
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledTimes(1);
    expect(tx.dossierCrmTransition.update).not.toHaveBeenCalled();
  });

  it('dernière ligne cherchée sur ce dossier, la plus récente', async () => {
    const { s, tx } = svc();
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { gamme: 'moyen' });
    expect(tx.dossierCrmTransition.findFirst.mock.calls[0][0]).toMatchObject({
      where: { dossierId: 'D1' },
      orderBy: { creeLe: 'desc' },
    });
  });
});

describe('CrmService.modifierFiche · rien de changé', () => {
  it('mêmes standing et gamme → ni trace ni notification', async () => {
    const { s, tx, notifierDossierCrm } = svc();
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { standing: 'moyen', gamme: 'economique' });
    expect(tx.dossierCrmTransition.findFirst).not.toHaveBeenCalled();
    expect(tx.dossierCrmTransition.create).not.toHaveBeenCalled();
    expect(notifierDossierCrm).not.toHaveBeenCalled();
  });

  it('même fiche Programme renvoyée (clés dans un autre ordre) → ni trace, ni projet, ni notification', async () => {
    const { s, tx, notifierDossierCrm } = svc({
      dossier: { ...EN_VALIDATION, statut: 'onboard', projet: { id: 'P1' } },
    });
    const reordonnee = {
      typologieVilla: 'F5',
      sousSols: 1,
      gabarit: 1,
      forme: 'villa',
      typeProjet: 'residentiel',
      usage: 'maisons_individuelles',
    };
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: reordonnee });
    expect(tx.dossierCrmTransition.create).not.toHaveBeenCalled();
    expect(tx.projet.update).not.toHaveBeenCalled();
    expect(notifierDossierCrm).not.toHaveBeenCalled();
  });
});

describe('CrmService.modifierFiche · projet d’exécution (Onboard)', () => {
  const ONBOARD: Dossier = { ...EN_VALIDATION, statut: 'onboard', projet: { id: 'P1' } };

  it('fiche Programme changée → programme du projet mis à jour dans la transaction', async () => {
    const { s, tx } = svc({ dossier: ONBOARD });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...VILLA, typologieVilla: 'F6' } });
    expect(tx.projet.update).toHaveBeenCalledWith({
      where: { id: 'P1' },
      data: { programme: 'Villa R+1 · 1 sous-sol · F6' },
    });
  });

  it('standing seul changé → projet inchangé (il ne porte que le programme)', async () => {
    const { s, tx } = svc({ dossier: ONBOARD });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { standing: 'grand' });
    expect(tx.projet.update).not.toHaveBeenCalled();
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledTimes(1);
  });

  it('dossier en validation (pas encore de projet) → aucune écriture de projet', async () => {
    const { s, tx } = svc();
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...VILLA, typologieVilla: 'F6' } });
    expect(tx.projet.update).not.toHaveBeenCalled();
  });
});

describe('CrmService.modifierFiche · notification', () => {
  it('changement réel → « dossier_modifie » par l’auteur, appelée après la transaction', async () => {
    const { s, tx, $transaction, notifierDossierCrm } = svc();
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { gamme: 'moyen' });
    expect(notifierDossierCrm).toHaveBeenCalledWith({
      societeId: 'S1',
      dossierId: 'D1',
      evenement: 'dossier_modifie',
      parId: 'U1',
    });
    expect(notifierDossierCrm.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.dossierCrmTransition.create.mock.invocationCallOrder[0],
    );
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('transaction en échec → aucune notification', async () => {
    const { s, notifierDossierCrm } = svc({ echecTx: true });
    await expect(s.modifierFiche('S1', AVEC_DROIT, 'D1', { gamme: 'moyen' })).rejects.toThrow(
      'validation de la transaction impossible',
    );
    expect(notifierDossierCrm).not.toHaveBeenCalled();
  });
});

describe('CrmService.modifierFiche · « Nouveau projet » inchangé', () => {
  const NOUVEAU: Dossier = { ...EN_VALIDATION, statut: 'nouveau_projet' };

  it('sans le droit fiche figée → modifiable, sans trace ni notification', async () => {
    const { s, tx, notifierDossierCrm } = svc({ dossier: NOUVEAU });
    await s.modifierFiche('S1', SANS_DROIT, 'D1', { standing: 'grand', gamme: 'moyen' });
    expect(tx.dossierCrm.update.mock.calls[0][0].data).toMatchObject({ standing: 'grand', gamme: 'moyen' });
    expect(tx.dossierCrmTransition.findFirst).not.toHaveBeenCalled();
    expect(tx.dossierCrmTransition.create).not.toHaveBeenCalled();
    expect(notifierDossierCrm).not.toHaveBeenCalled();
  });

  it('catégorie, surface et planches modifiables (pas de contrôle du prix figé)', async () => {
    const { s, tx } = svc({ dossier: { ...NOUVEAU, ficheProgramme: null } });
    await s.modifierFiche('S1', SANS_DROIT, 'D1', { categorie: 'amenagement', surfaceTerrain: 900, nbPlanches: 5 });
    expect(tx.dossierCrm.update.mock.calls[0][0].data).toMatchObject({
      categorie: 'amenagement',
      surfaceTerrain: 900,
      nbPlanches: 5,
    });
  });

  it('tarif changé sous une offre en brouillon → 409 du brouillon (règle existante)', async () => {
    const { s, tx } = svc({ dossier: NOUVEAU, brouillons: 1 });
    await expect(s.modifierFiche('S1', SANS_DROIT, 'D1', { categorie: 'amenagement' })).rejects.toThrow(
      'Une offre est en préparation',
    );
    expect(tx.dossierCrm.update).not.toHaveBeenCalled();
  });

  it('projet jamais touché en « Nouveau projet », même fiche Programme changée', async () => {
    const { s, tx } = svc({ dossier: { ...NOUVEAU, projet: { id: 'P1' } } });
    await s.modifierFiche('S1', SANS_DROIT, 'D1', { ficheProgramme: { ...VILLA, typologieVilla: 'F6' } });
    expect(tx.projet.update).not.toHaveBeenCalled();
  });
});

// Type de projet et usage (09/11/2026) : champs libres de la fiche Programme
// (ni prix, ni désignation sur les factures) — modifiables sur une fiche
// figée avec le droit, tracés et notifiés comme le reste de la fiche.
describe('CrmService.modifierFiche · type de projet et usage d’une fiche figée', () => {
  it('type et usage changés ensemble → acceptés, planches et programme inchangés', async () => {
    const { s, tx } = svc();
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', {
      ficheProgramme: { ...VILLA, typeProjet: 'commercial', usage: 'hotels' },
    });
    const data = tx.dossierCrm.update.mock.calls[0][0].data;
    expect(data.nbPlanches).toBeUndefined();
    expect(data.programme).toBe('Villa R+1 · 1 sous-sol · F5');
    expect(data.ficheProgramme).toMatchObject({ typeProjet: 'commercial', usage: 'hotels', forme: 'villa' });
  });

  it('usage seul changé → trace « fiche Programme » et notification', async () => {
    const { s, tx, notifierDossierCrm } = svc();
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...VILLA, usage: 'residences' } });
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledWith({
      data: {
        dossierId: 'D1',
        de: 'en_validation',
        vers: 'en_validation',
        parId: 'U1',
        commentaire: `${PREFIXE_TRACE}fiche Programme`,
      },
    });
    expect(notifierDossierCrm).toHaveBeenCalledWith(expect.objectContaining({ evenement: 'dossier_modifie' }));
  });

  it('Mixte : usage écrit à la main changé → accepté et tracé', async () => {
    const mixte = { ...VILLA, typeProjet: 'mixte', usage: 'Logements et commerces' };
    const { s, tx } = svc({ dossier: { ...EN_VALIDATION, ficheProgramme: normaliserFiche(mixte) } });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...mixte, usage: 'Logements et bureaux' } });
    expect(tx.dossierCrm.update.mock.calls[0][0].data.ficheProgramme).toMatchObject({ usage: 'Logements et bureaux' });
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledTimes(1);
  });

  it('dossier Onboard : type changé → projet d’exécution resynchronisé dans la transaction', async () => {
    const { s, tx } = svc({ dossier: { ...EN_VALIDATION, statut: 'onboard', projet: { id: 'P1' } } });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', {
      ficheProgramme: { ...VILLA, typeProjet: 'mixte', usage: 'Logement et atelier' },
    });
    expect(tx.projet.update).toHaveBeenCalledWith({
      where: { id: 'P1' },
      data: { programme: 'Villa R+1 · 1 sous-sol · F5' },
    });
  });

  it('type changé sans usage (fiche rendue incomplète) → 400, rien écrit ni tracé', async () => {
    const { s, tx, notifierDossierCrm } = svc();
    await expect(
      s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...VILLA, typeProjet: 'commercial', usage: null } }),
    ).rejects.toThrow('Fiche Programme incomplète');
    expect(tx.dossierCrm.update).not.toHaveBeenCalled();
    expect(tx.dossierCrmTransition.create).not.toHaveBeenCalled();
    expect(notifierDossierCrm).not.toHaveBeenCalled();
  });

  it('usage hors de la liste du type → 400 avant tout contrôle du prix', async () => {
    const { s, $transaction } = svc();
    await expect(
      s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...VILLA, usage: 'entrepots' } }),
    ).rejects.toThrow('Usage : valeur inconnue pour ce type de projet.');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('ancien dossier migré (type posé, usage à choisir) : choisir l’usage complète la fiche, accepté et tracé', async () => {
    // Fiche telle que la laisse la migration 20261109200000 : usage « residentiel » → type, usage null.
    const migree = { ...VILLA, typeProjet: 'residentiel', usage: null };
    const { s, tx } = svc({ dossier: { ...EN_VALIDATION, ficheProgramme: migree } });
    await s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...migree, usage: 'residences' } });
    const data = tx.dossierCrm.update.mock.calls[0][0].data;
    expect(data.programme).toBe('Villa R+1 · 1 sous-sol · F5');
    expect(data.nbPlanches).toBeUndefined();
    expect(tx.dossierCrmTransition.create).toHaveBeenCalledTimes(1);
  });

  it('ancien dossier migré : changer la typologie sans choisir d’usage → 400 (fiche incomplète)', async () => {
    const migree = { ...VILLA, typeProjet: 'residentiel', usage: null };
    const { s, tx } = svc({ dossier: { ...EN_VALIDATION, ficheProgramme: migree } });
    await expect(
      s.modifierFiche('S1', AVEC_DROIT, 'D1', { ficheProgramme: { ...migree, typologieVilla: 'F4' } }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.dossierCrm.update).not.toHaveBeenCalled();
  });
});
