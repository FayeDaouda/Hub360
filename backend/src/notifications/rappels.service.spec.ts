import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { RappelsService } from './rappels.service';

const dec = (n: number) => new Prisma.Decimal(n);

function svc(o: { devis?: unknown[]; factures?: unknown[]; taches?: unknown[]; absences?: unknown[]; dejaEnvoyes?: string[]; clotures?: unknown[]; societes?: unknown[]; reportings?: unknown[] } = {}) {
  const deja = new Set(o.dejaEnvoyes ?? []);
  const prisma = {
    devis: { findMany: jest.fn().mockResolvedValue(o.devis ?? []) },
    facture: { findMany: jest.fn().mockResolvedValue(o.factures ?? []) },
    tacheProjet: { findMany: jest.fn().mockResolvedValue(o.taches ?? []) },
    collaborateur: { findMany: jest.fn().mockResolvedValue([{ id: 'C1', utilisateurId: 'U1' }]) },
    demandeAbsence: { findMany: jest.fn().mockResolvedValue(o.absences ?? []) },
    demandeRemboursement: { findMany: jest.fn().mockResolvedValue([]) },
    demandeAttestation: { findMany: jest.fn().mockResolvedValue([]) },
    dossierPersonnel: { findMany: jest.fn().mockResolvedValue([]) },
    journalCloture: { findMany: jest.fn().mockResolvedValue(o.clotures ?? []) },
    societe: { findMany: jest.fn().mockResolvedValue(o.societes ?? []) },
    reportingMensuel: { findMany: jest.fn().mockResolvedValue(o.reportings ?? []) },
    rappelEnvoye: {
      createMany: jest.fn(({ data }: { data: { cle: string }[] }) => {
        const neuf = !deja.has(data[0].cle);
        deja.add(data[0].cle);
        return Promise.resolve({ count: neuf ? 1 : 0 });
      }),
    },
  } as unknown as PrismaService;
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['CFO1']), comptesDe: jest.fn().mockResolvedValue(['CHEF']) };
  return { s: new RappelsService(prisma, notifications as unknown as NotificationsService, { regle: jest.fn((_s: string, cle: string) => Promise.resolve(cle === 'signalement_rh_apres_relances' ? 2 : 3)) } as never), notifications };
}

const tache = (finLe: string) => ({
  id: 'T1', libelle: 'Plan masse', finLe, assigneId: 'C1', carte: { libelle: 'Esquisse' }, projet: { id: 'P1', code: 'GC-01', societeId: 'S1' },
});

describe('RappelsService', () => {
  const JOUR = '2026-10-14';

  it('tâche due demain puis en retard : un rappel chacun, au titulaire', async () => {
    const veille = await svc({ taches: [tache('2026-10-15')] }).s.taches(JOUR);
    expect(veille).toEqual([expect.objectContaining({ cle: 'tache:T1:veille:2026-10-15', destinataireIds: ['U1'], titre: expect.stringContaining('À rendre demain') })]);
    const retard = await svc({ taches: [tache('2026-10-10')] }).s.taches(JOUR);
    expect(retard[0].cle).toBe('tache:T1:retard:2026-10-10');
  });

  it('tâche due aujourd’hui : pas encore de rappel', async () => {
    expect(await svc({ taches: [tache(JOUR)] }).s.taches(JOUR)).toEqual([]);
  });

  it('offre sans réponse : un rappel par palier J+3 / J+6, au propriétaire', async () => {
    const devis = (envoi: string, relances: number) => ({
      id: 'D1', societeId: 'S1', projetId: null, dossierCrmId: 'L1', statut: 'envoye', dateEnvoi: new Date(`${envoi}T09:00:00Z`),
      dateValidite: '2026-12-31', relancesEnvoyees: relances, numero: null, codeDossier: 'DIOP_DKR.26', rangDossier: 1,
      client: { nom: 'Diop' }, dossierCrm: { proprietaireId: 'P9' }, projet: null,
    });
    expect(await svc({ devis: [devis('2026-10-12', 0)] }).s.offres(JOUR)).toEqual([]);
    const j3 = await svc({ devis: [devis('2026-10-11', 0)] }).s.offres(JOUR);
    expect(j3).toEqual([expect.objectContaining({ cle: 'offre:D1:1', destinataireIds: ['P9'], dossierCrmId: 'L1' })]);
    // Relance J+3 faite : plus rien avant J+6.
    expect(await svc({ devis: [devis('2026-10-10', 1)] }).s.offres(JOUR)).toEqual([]);
    expect((await svc({ devis: [devis('2026-10-08', 1)] }).s.offres(JOUR))[0].cle).toBe('offre:D1:2');
  });

  it('facture échue non soldée : propriétaire + CFO, puis chaque semaine', async () => {
    const facture = (echeanceLe: string, paye: number) => ({
      id: 'F1', societeId: 'S1', projetId: 'P1', echeanceLe, montantHt: dec(100_000), tauxTva: dec(18), numero: 3,
      emiseLe: new Date('2026-09-01'), estAvoir: false, codeDossier: null, rangDossier: null,
      paiements: [{ montant: dec(paye) }], dossierCrm: null, projet: { dossierCrm: { proprietaireId: 'P9' } },
    });
    const [r] = await svc({ factures: [facture('2026-10-13', 18_000)] }).s.factures(JOUR);
    expect(r).toEqual(expect.objectContaining({ cle: 'facture:F1:0', destinataireIds: ['P9', 'CFO1'], factureId: 'F1' }));
    expect(r.titre).toContain('reste 100');
    expect((await svc({ factures: [facture('2026-10-06', 0)] }).s.factures(JOUR))[0].cle).toBe('facture:F1:1');
    expect(await svc({ factures: [facture('2026-10-13', 118_000)] }).s.factures(JOUR)).toEqual([]);
  });

  it('tournée rejouée : aucun doublon', async () => {
    const { s, notifications } = svc({ taches: [tache('2026-10-15')], dejaEnvoyes: [] });
    expect(await s.tournee(JOUR)).toBe(1);
    expect(await s.tournee(JOUR)).toBe(0);
    expect(notifications.envoyer).toHaveBeenCalledTimes(1);
    expect(notifications.envoyer.mock.calls[0][0]).not.toHaveProperty('cle');
  });

  // Revue RH 20/10/2026 : relance des demandes en attente après 3 jours ouvrés, puis par palier.
  it('demande en attente : relance après 3 jours ouvrés, puis à chaque palier', async () => {
    const absence = (createdAt: string) => ({
      id: 'A1', statut: 'attente_n1', createdAt: new Date(`${createdAt}T09:00:00Z`), decisionN1Le: null,
      dateDebut: '2026-11-03', dateFin: '2026-11-05', n1CollaborateurId: 'C9', n1Role: null,
      dossier: { id: 'D1', societeId: 'S1', prenom: 'Khadija', nom: 'Sow' },
    });
    // JOUR = mercredi 14/10 : déposée vendredi 9 → 3 jours ouvrés (12, 13, 14), week-end non compté.
    const [r] = await svc({ absences: [absence('2026-10-09')] }).s.demandes(JOUR);
    expect(r).toEqual(expect.objectContaining({ cle: 'demande:absence:A1:n1:1', type: 'rappel_demande', destinataireIds: ['CHEF'] }));
    // Déposée lundi 12 → 2 jours ouvrés : rien encore.
    expect(await svc({ absences: [absence('2026-10-12')] }).s.demandes(JOUR)).toEqual([]);
    // Déposée lundi 5 → 7 jours ouvrés : deuxième palier, nouvelle relance.
    expect((await svc({ absences: [absence('2026-10-05')] }).s.demandes(JOUR))[0].cle).toBe('demande:absence:A1:n1:2');
  });

  it('N+1 sans réponse après 2 relances : la demande est signalée aussi à la RH, une fois', async () => {
    const absence = (createdAt: string) => ({
      id: 'A1', statut: 'attente_n1', createdAt: new Date(`${createdAt}T09:00:00Z`), decisionN1Le: null,
      dateDebut: '2026-11-03', dateFin: '2026-11-05', n1CollaborateurId: 'C9', n1Role: null,
      dossier: { id: 'D1', societeId: 'S1', prenom: 'Khadija', nom: 'Sow' },
    });
    // Lundi 5 → 7 jours ouvrés : 2e relance, pas encore de signalement.
    expect((await svc({ absences: [absence('2026-10-05')] }).s.demandes(JOUR)).map((r) => r.cle)).toEqual(['demande:absence:A1:n1:2']);
    // Jeudi 1er → 9 jours ouvrés : 3e relance, et signalement à la RH.
    const r = await svc({ absences: [absence('2026-10-01')] }).s.demandes(JOUR);
    expect(r.map((x) => x.cle)).toEqual(['demande:absence:A1:n1:3', 'demande:absence:A1:n1:signalee']);
    expect(r[1]).toEqual(expect.objectContaining({ destinataireIds: ['CFO1'], titre: expect.stringContaining('N+1 sans réponse') }));
  });

  it('clôture : relance du CFO à partir du 5, chaque semaine, tant que le mois précédent est ouvert', async () => {
    const factures = [{ societeId: 'S1' }];
    // regle() rend 3 pour toute clé dans ce mock (rappel_cloture_jour = 3) : le 14, 2e semaine.
    expect(await svc({ factures }).s.clotures(JOUR)).toEqual([expect.objectContaining({ cle: 'cloture:S1:2026-09:1', type: 'cloture_a_faire', destinataireIds: ['CFO1'] })]);
    expect(await svc({ factures }).s.clotures('2026-10-02')).toEqual([]);
    expect(await svc({ factures, clotures: [{ mois: '2026-09', action: 'cloture' }] }).s.clotures(JOUR)).toEqual([]);
  });

  // Revue Dir. GC (21/10/2026, lot 3) : rappel avant le 5, relances en retard.
  it('reportings : émetteur relancé, destinataire prévenu du retard ; rien pour un reporting déposé', async () => {
    const { s, notifications } = svc({ societes: [{ id: 'S1' }], reportings: [{ societeId: 'S1', type: 'rh', mois: '2026-09' }] });
    notifications.titulairesRole.mockImplementation((_s: string, role: string) => Promise.resolve({ 'Dir. GC': ['DG'], 'CTO (transverse)': ['CTO'], RH: ['RH1'], CFO: ['CFO1'] }[role] ?? []));
    const r = await s.reportings('2026-10-13');
    // Septembre : direction non déposée (en retard), RH déposée.
    expect(r.map((x) => [x.cle, x.type, x.destinataireIds])).toEqual([
      ['reporting:S1:direction:2026-09:retard:1', 'reporting_a_deposer', ['DG']],
      ['reporting:S1:direction:2026-09:retard-destinataire', 'reporting_en_retard', ['CTO']],
    ]);
    expect(r[0].titre).toBe('Reporting de la direction de septembre 2026 en retard (dû le 05/10) · à déposer au CTO');
  });
});
