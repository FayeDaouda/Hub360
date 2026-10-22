import { aTraiterCommercial, manquesApporteur, performanceCommerciale, totauxPipeline, type DossierCommercial } from './commercial';

// Vue commerciale du COO (revue COO, 22/10/2026).
const JOUR = '2026-10-22';
const MAINTENANT = Date.parse('2026-10-22T09:00:00Z');
const complet = { categorie: 'conception', localiteId: 'L1', type: 'villa', surfaceTerrain: 300, nbPlanches: 2, clientId: 'C1', standing: 'standing', gamme: 'g1', programme: 'Villa R+1' };
const dossier = (o: Partial<DossierCommercial> = {}): DossierCommercial => ({
  id: 'D1',
  code: 'AB_YOF.26',
  client: 'Awa Ba',
  statut: 'nouveau_projet',
  creeLe: new Date('2026-10-21T09:00:00Z'),
  archive: false,
  proprietaireId: 'DG',
  apporteur: null,
  commission: null,
  offre: null,
  signeLe: null,
  montantHt: null,
  commissions: { versees: 0, aPayer: 0 },
  ...complet,
  ...o,
});

describe('aTraiterCommercial', () => {
  it('fiche incomplète : heures restantes, puis retard au-delà de 72 h', () => {
    const [jeune] = aTraiterCommercial([dossier({ gamme: null })], JOUR, MAINTENANT);
    expect(jeune).toMatchObject({ type: 'fiche_incomplete', ton: 'attention', detail: '48 h restantes · 1 champ manquant (gamme)' });
    const [vieux] = aTraiterCommercial([dossier({ gamme: null, creeLe: new Date('2026-10-15T09:00:00Z') })], JOUR, MAINTENANT);
    expect(vieux).toMatchObject({ ton: 'risque', detail: expect.stringMatching(/^72 h dépassées depuis 4 j · /) });
  });

  it('lead sans propriétaire, offre chez le client (expirée = risque), archivés et signés ignorés', () => {
    const r = aTraiterCommercial(
      [
        dossier({ id: 'A', proprietaireId: null }),
        dossier({ id: 'B', statut: 'offre_envoyee', offre: { statut: 'envoye', envoyeeLe: '2026-10-10', valideJusquau: '2026-10-17' } }),
        dossier({ id: 'C', statut: 'offre_envoyee', offre: { statut: 'envoye', envoyeeLe: '2026-10-20', valideJusquau: '2026-10-27' } }),
        dossier({ id: 'D', archive: true, proprietaireId: null }),
        dossier({ id: 'E', statut: 'onboard', proprietaireId: null }),
      ],
      JOUR,
      MAINTENANT,
    );
    expect(r.map((e) => [e.dossierId, e.type, e.ton])).toEqual([
      ['A', 'lead_sans_proprietaire', 'risque'],
      ['B', 'offre_chez_client', 'risque'],
      ['C', 'offre_chez_client', 'info'],
    ]);
    expect(r[1].detail).toBe('envoyée il y a 12 j, expirée le 17/10 sans réponse');
  });

  it('fiche apporteur : % manquant, externe injoignable', () => {
    expect(manquesApporteur({ apporteur: { type: 'externe', nom: 'Me Ndiaye', structure: null, telephone: null, email: null }, commission: null })).toEqual([
      '% attribué',
      'téléphone ou e-mail',
    ]);
    expect(manquesApporteur({ apporteur: { type: 'interne', id: 'U', nom: 'Mariama Seck' }, commission: 4 })).toEqual([]);
    expect(manquesApporteur({ apporteur: null, commission: null })).toEqual([]);
  });
});

describe('performanceCommerciale', () => {
  it('par apporteur, taux de transformation et délai moyen lead → signature', () => {
    const notaire = { type: 'externe' as const, nom: 'Me Aliou Ndiaye', structure: 'Notaire', telephone: '77', email: null };
    const p = performanceCommerciale([
      dossier({ id: '1', statut: 'onboard', apporteur: notaire, creeLe: new Date('2026-03-01T10:00:00Z'), signeLe: '2026-03-31', montantHt: 9_000_000, commissions: { versees: 120_000, aPayer: 240_000 } }),
      dossier({ id: '2', statut: 'perdu', apporteur: { ...notaire, nom: ' me aliou ndiaye ' } }),
      dossier({ id: '3', statut: 'onboard', creeLe: new Date('2026-04-01T10:00:00Z'), signeLe: '2026-04-11' }),
      dossier({ id: '4', statut: 'offre_envoyee' }),
    ]);
    expect(p).toMatchObject({ leads: 4, signes: 2, signeHt: 9_000_000, commissionsVersees: 120_000, commissionsAPayer: 240_000, enCours: 1, tauxTransformation: 50, delaiMoyenJours: 20 });
    expect(p.apporteurs[1]).toMatchObject({ commissionsVersees: 120_000, commissionsAPayer: 240_000 });
    expect(p.apporteurs.map((a) => [a.libelle, a.leads, a.signes, a.enCours, a.signeHt])).toEqual([
      ['Affaire directe', 2, 1, 1, 0],
      ['Me Aliou Ndiaye · Notaire', 2, 1, 0, 9_000_000],
    ]);
    expect(performanceCommerciale([]).tauxTransformation).toBeNull();
  });
});

describe('totauxPipeline', () => {
  it('par étape, offre expirée à part, archivés exclus, dossiers sans offre comptés sans montant', () => {
    const t = totauxPipeline(
      [
        dossier({ id: '1' }),
        dossier({ id: '2', statut: 'en_validation', montantHt: 5_000_000 }),
        dossier({ id: '3', statut: 'offre_envoyee', montantHt: 2_000_000, offre: { statut: 'envoye', envoyeeLe: '2026-10-01', valideJusquau: '2026-10-08' } }),
        dossier({ id: '4', statut: 'offre_envoyee', montantHt: 3_000_000, offre: { statut: 'envoye', envoyeeLe: '2026-10-20', valideJusquau: '2026-10-27' } }),
        dossier({ id: '5', statut: 'onboard', montantHt: 7_000_000 }),
        dossier({ id: '6', statut: 'perdu', archive: true, montantHt: 1_000_000 }),
      ],
      JOUR,
    );
    expect(t.map((x) => [x.etape, x.dossiers, x.avecOffre, x.totalHt])).toEqual([
      ['preparation', 1, 0, 0],
      ['en_validation', 1, 1, 5_000_000],
      ['chez_client', 1, 1, 3_000_000],
      ['expiree', 1, 1, 2_000_000],
      ['signe', 1, 1, 7_000_000],
      ['perdu', 0, 0, 0],
    ]);
  });
});
