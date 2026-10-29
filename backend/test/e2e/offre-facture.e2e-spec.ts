import { INestApplication } from '@nestjs/common';
import { api, COMPTES, connecter, demarrer, parametrerContratDeTest, signerContrat } from './app';
import { todayIso } from '@hub/domain';

const DOSSIER = 'FS_NGO.26'; // démo : offre soumise au CFO, en attente de validation
const AUJOURDHUI = todayIso();

type Dossier = { id: string; code: string; statut: string };
type Devis = { id: string; statut: string; dossierCrm: { id: string } | null };
type Facture = {
  id: string;
  statut: string;
  statutEffectif: string;
  reference: string | null;
  montantTtc: number;
  dossierCrm: { code: string } | null;
  projet: { code: string } | null;
};

// Parcours 2 — de l'offre à la facture payée : validation CFO, réponse du
// client (Onboard + projet + factures d'échéancier), contrat signé ensuite
// pour régulariser, émission, paiement, et la trace au journal d'audit.
describe('Offre → Onboard → contrat → facture payée', () => {
  let app: INestApplication;
  let cfo: ReturnType<typeof api>;
  let dossier: Dossier;
  let reference: string; // facture émise par ce parcours

  beforeAll(async () => {
    app = await demarrer();
    cfo = api(app, await connecter(app, COMPTES.cfo));
    await parametrerContratDeTest(app);
    const dossiers: Dossier[] = (await cfo.get('/dossiers').expect(200)).body;
    dossier = dossiers.find((d) => d.code === DOSSIER)!;
    expect(dossier.statut).toBe('en_validation');
  });
  afterAll(() => app.close());

  it('le CFO valide : l’offre part chez le client', async () => {
    await cfo.post(`/dossiers/${dossier.id}/actions`, { action: 'valider' }).expect(201);
    const offres: Devis[] = (await cfo.get('/devis').expect(200)).body;
    const offre = offres.find((d) => d.dossierCrm?.id === dossier.id && d.statut === 'envoye');
    expect(offre).toBeDefined();
    // Réponse du client saisie (accord écrit reçu hors lien public).
    await cfo.post(`/devis/${offre!.id}/reponse`, { reponse: 'accepte' }).expect(201);
  });

  it('l’offre acceptée fait passer le dossier en Onboard ; le contrat se signe ensuite', async () => {
    const avant: Dossier[] = (await cfo.get('/dossiers').expect(200)).body;
    expect(avant.find((d) => d.id === dossier.id)!.statut).toBe('onboard');
    await signerContrat(cfo, dossier.id);
    const { contrat } = (await cfo.get(`/dossiers/${dossier.id}/contrat`).expect(200)).body as {
      contrat: { statut: string };
    };
    expect(contrat.statut).toBe('signe');
  });

  it('la facture d’échéancier est émise, numérotée, puis payée', async () => {
    const factures: Facture[] = (await cfo.get('/factures').expect(200)).body;
    const brouillon = factures.find(
      (f) => f.statut === 'brouillon' && (f.dossierCrm?.code === DOSSIER || f.projet?.code === DOSSIER),
    );
    expect(brouillon).toBeDefined();

    const emise: Facture = (await cfo.post(`/factures/${brouillon!.id}/emission`).expect(201)).body;
    expect(emise.statut).toBe('emise');
    // Format de numérotation de la démo (préfixe GC, réglable par le CFO).
    expect(emise.reference).toMatch(/^GC-\d{4}-\d{4}$/);
    reference = emise.reference!;

    const payee: Facture = (
      await cfo
        .post(`/factures/${brouillon!.id}/paiements`, { date: AUJOURDHUI, montant: emise.montantTtc, mode: 'virement' })
        .expect(201)
    ).body;
    expect(payee.statutEffectif).toBe('payee');
  });

  it('le journal d’audit du CEO garde l’émission et le paiement', async () => {
    const ceo = api(app, await connecter(app, COMPTES.ceo));
    const { lignes } = (await ceo.get('/journal-audit').expect(200)).body as {
      lignes: { action: string; detail: string }[];
    };
    const deCetteFacture = lignes.filter((l) => l.detail.includes(reference)).map((l) => l.action);
    expect(deCetteFacture).toEqual(expect.arrayContaining(['Facture émise', 'Paiement enregistré']));
  });
});
