import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ContratsService } from './contrats.service';

// Contrat (étape G) — ContratsService contre un Prisma simulé. Depuis le
// 29/10/2026, le contrat se prépare sur un dossier déjà en Onboard.
const dec = (n: number) => ({ toNumber: () => n });
const ligne = (ht: number) => ({ quantite: dec(1), prixUnitaire: dec(ht), tauxTva: dec(18) });

const SOCIETE = {
  nom: 'Grey Concrete',
  contratModele:
    'Entre {{societe}} et {{client}} pour {{montant_offre_ht}}. Signé : {{signataire_nom}}, {{signataire_fonction}}.',
  contratSignataireNom: 'Gérant Test',
  contratSignataireFonction: 'Gérant',
  contratSignataireCeoNom: 'CEO Test',
  contratSignataireCeoFonction: 'Directeur général',
  contratSeuilSurMesureHt: dec(50_000_000),
};

function monter(o: { societe?: object; offreHt?: number; contrat?: object | null; statut?: string } = {}) {
  const dossier = {
    id: 'D1',
    statut: o.statut ?? 'onboard',
    code: 'AS_ALM.26',
    programme: 'Villa',
    localisation: 'Almadies',
    client: { nom: 'Awa Sow', email: 'awa@exemple.sn' },
    societe: { ...SOCIETE, ...o.societe },
    contrat: o.contrat ?? null,
    offres: [{ id: 'O1', numero: 1, dateEnvoi: new Date('2026-09-20'), lignes: [ligne(o.offreHt ?? 3_500_000)] }],
  };
  const prisma = {
    dossierCrm: { findFirst: jest.fn().mockResolvedValue(dossier) },
    annexeContratGabarit: {
      findMany: jest.fn().mockResolvedValue([
        { libelle: 'Offre acceptée', automatique: 'offre', ordre: 0 },
        { libelle: 'Planning', automatique: null, ordre: 1 },
      ]),
    },
    contrat: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    societe: { update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue(SOCIETE) },
  };
  const notifications = { notifierDossierCrm: jest.fn().mockResolvedValue(undefined) };
  const svc = new ContratsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    { envoyerContrat: jest.fn().mockResolvedValue({ envoye: false }) } as unknown as EmailService,
    { regle: jest.fn().mockResolvedValue(50_000_000) } as unknown as ReglagesService, // seuil CEO (TTC)
  );
  return { svc, prisma, notifications };
}

describe('ContratsService.preparer', () => {
  it('sous le seuil : texte généré depuis le modèle, offre jointe d’office', async () => {
    const { svc, prisma } = monter();
    await svc.preparer('S1', 'D1');
    const data = prisma.contrat.create.mock.calls[0][0].data;
    expect(data.mode).toBe('modele');
    // Intl sépare les milliers par une espace fine insécable (voulue à
    // l'impression) — comparaison indépendante du type d'espace.
    expect(data.contenu.replace(/\s/g, ' ')).toBe(
      'Entre Grey Concrete et Awa Sow pour 3 500 000 FCFA. Signé : Gérant Test, Gérant.',
    );
    expect(data.annexes.create).toEqual([
      { libelle: 'Offre acceptée', automatique: 'offre', statut: 'jointe', ordre: 0 },
      { libelle: 'Planning', automatique: null, statut: 'a_joindre', ordre: 1 },
    ]);
  });

  it('au-dessus du seuil : sur mesure, aucun texte généré (document à déposer)', async () => {
    const { svc, prisma } = monter({ offreHt: 60_000_000 });
    await svc.preparer('S1', 'D1');
    expect(prisma.contrat.create.mock.calls[0][0].data).toMatchObject({ mode: 'sur_mesure', contenu: null });
  });

  it('modèle ou signataire non renseignés → 422 qui dit quoi remplir, rien créé', async () => {
    const { svc, prisma } = monter({ societe: { contratModele: null, contratSignataireNom: null } });
    await expect(svc.preparer('S1', 'D1')).rejects.toThrow('nom du signataire (Architecte DPLG), modèle de contrat');
    expect(prisma.contrat.create).not.toHaveBeenCalled();
  });

  it('sur mesure : le modèle vide n’est PAS exigé (seul le signataire l’est)', async () => {
    const { svc, prisma } = monter({ offreHt: 60_000_000, societe: { contratModele: null } });
    await svc.preparer('S1', 'D1');
    expect(prisma.contrat.create).toHaveBeenCalled();
  });

  it('dossier pas encore en Onboard → 409, rien créé', async () => {
    const { svc, prisma } = monter({ statut: 'offre_envoyee' });
    await expect(svc.preparer('S1', 'D1')).rejects.toThrow('Onboard');
    expect(prisma.contrat.create).not.toHaveBeenCalled();
  });

  it('contrat déjà préparé → 409', async () => {
    const { svc } = monter({ contrat: { id: 'C1' } });
    await expect(svc.preparer('S1', 'D1')).rejects.toThrow(ConflictException);
  });
});

describe('ContratsService — envoi et signature', () => {
  const contrat = (o: object = {}) => ({
    id: 'C1',
    societeId: 'S1',
    dossierCrmId: 'D1',
    mode: 'modele',
    statut: 'brouillon',
    documentUrl: null,
    annexes: [
      { id: 'A1', libelle: 'Offre acceptée', automatique: 'offre', statut: 'jointe' },
      { id: 'A2', libelle: 'Planning', automatique: null, statut: 'a_joindre' },
    ],
    dossier: { code: 'AS_ALM.26', statut: 'onboard', client: { nom: 'Awa Sow', email: 'a@b.sn' } },
    societe: { nom: 'Grey Concrete' },
    devis: { lignes: [] },
    ...o,
  });

  it('envoi avec une annexe encore « à joindre » → 422 qui la nomme', async () => {
    const { svc, prisma } = monter();
    prisma.contrat.findFirst.mockResolvedValue(contrat());
    await expect(svc.envoyer('S1', 'D1')).rejects.toThrow('Planning');
    expect(prisma.contrat.update).not.toHaveBeenCalled();
  });

  it('l’offre acceptée ne se modifie pas (annexe automatique) → 409', async () => {
    const { svc, prisma } = monter();
    prisma.contrat.findFirst.mockResolvedValue(contrat());
    await expect(svc.majAnnexe('S1', 'D1', 'A1', 'non_necessaire')).rejects.toThrow(ConflictException);
  });

  it('signature en ligne : contrat marqué signé (régularisation), propriétaire prévenu', async () => {
    const { svc, prisma, notifications } = monter();
    prisma.contrat.findFirst.mockResolvedValue(contrat({ statut: 'envoye' }));
    await svc.signerPublic('jeton', { mode: 'bouton', nom: 'Awa Sow' }, '10.0.0.1').catch(() => undefined);
    expect(prisma.contrat.updateMany).toHaveBeenCalledWith({
      where: { id: 'C1', statut: 'envoye' },
      data: expect.objectContaining({ statut: 'signe', modeSignature: 'bouton', signeParNom: 'Awa Sow' }),
    });
    expect(notifications.notifierDossierCrm).toHaveBeenCalledWith({
      societeId: 'S1',
      dossierId: 'D1',
      evenement: 'contrat_signe',
      parId: null,
    });
  });

  it('signature d’un contrat non envoyé → 409, rien signé', async () => {
    const { svc, prisma, notifications } = monter();
    prisma.contrat.findFirst.mockResolvedValue(contrat({ statut: 'brouillon' }));
    await expect(svc.signerPublic('jeton', { mode: 'bouton', nom: 'Awa' }, null)).rejects.toThrow(ConflictException);
    expect(prisma.contrat.updateMany).not.toHaveBeenCalled();
    expect(notifications.notifierDossierCrm).not.toHaveBeenCalled();
  });
});

describe('ContratsService — réglages', () => {
  it('modèle avec champ inconnu → 422 (faute de frappe signalée)', async () => {
    const { svc, prisma } = monter();
    await expect(svc.majParametres('S1', { modele: 'Prix : {{montant_ofre_ht}}' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.societe.update).not.toHaveBeenCalled();
  });
});

describe('ContratsService · seuil de contresignature CEO (Réglages, TTC)', () => {
  it('en deçà du seuil TTC : l’Architecte DPLG signe pour la société', async () => {
    const { svc, prisma } = monter({ offreHt: 40_000_000 }); // 47,2 M TTC
    await svc.preparer('S1', 'D1');
    expect(prisma.contrat.create.mock.calls[0][0].data).toMatchObject({
      signataireNom: 'Gérant Test',
      signataireFonction: 'Gérant',
    });
  });
  it('au-delà du seuil TTC (même si le HT est en deçà) : le CEO', async () => {
    const { svc, prisma } = monter({ offreHt: 45_000_000 }); // 53,1 M TTC
    await svc.preparer('S1', 'D1');
    expect(prisma.contrat.create.mock.calls[0][0].data).toMatchObject({
      signataireNom: 'CEO Test',
      signataireFonction: 'Directeur général',
    });
  });
  it('au-delà du seuil sans CEO renseigné : préparation refusée, réglage nommé', async () => {
    const { svc } = monter({ offreHt: 45_000_000, societe: { contratSignataireCeoNom: null } });
    await expect(svc.preparer('S1', 'D1')).rejects.toThrow('nom du signataire au-delà du seuil (CEO)');
  });
  it('préparation : signataire prévu exposé avec le montant TTC et le seuil', async () => {
    const { svc } = monter({ offreHt: 45_000_000 });
    const r = await svc.get('S1', 'D1');
    expect(r.preparation.signataire).toEqual({
      qui: 'ceo',
      seuilTtc: 50_000_000,
      nom: 'CEO Test',
      fonction: 'Directeur général',
    });
    expect(r.preparation.offreAcceptee?.montantTtc).toBe(53_100_000);
  });
});
