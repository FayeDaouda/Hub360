import { addDays, formatLongDate, VALIDITE_OFFRE_JOURS } from '@hub/domain';
import { describe, expect, it } from 'vitest';
import type { DocumentFacturationProps } from '@/components/document-facturation';
import { documentApercuOffre, documentDevis } from './document-devis';
import { statutDevis } from './finances';
import type { Devis, Societe } from './types';

// Document d'un devis : une seule construction pour le panneau Finances et
// l'aperçu du CFO dans la fiche CRM (09/11/2026).

const SOCIETE: Societe = {
  id: 's-gc',
  nom: 'Grey Concrete',
  slug: 'grey-concrete',
  logoUrl: null,
  logoUrlSombre: null,
  couleurMarque: '#4f46e5',
  icone: null,
  secteur: 'Architecture',
  mentionsLegales: 'SARL au capital de 1 000 000 FCFA',
  coordonnees: 'Almadies, Dakar',
  penaliteRetardMensuelle: 1.5,
};

const devis = (champs: Partial<Devis> = {}): Devis => ({
  id: 'd-1',
  numero: 12,
  reference: 'GC-OF12',
  statut: 'envoye',
  statutEffectif: 'envoye',
  objet: 'Conception villa R+1',
  client: { id: 'cli-1', nom: 'Daouda Faye Sow', type: 'particulier' },
  projetId: null,
  dossierCrm: { id: 'p-1', code: 'DFS_ALM.26', statut: 'offre_envoyee' },
  dateValidite: '2026-11-16',
  dateEnvoi: '2026-11-09T10:30:00Z',
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
  ...champs,
});

// Brouillon d'une offre soumise au CFO (lead « En validation ») : pas encore
// numérotée, ni envoyée, ni datée.
const brouillonSoumis = () =>
  devis({
    numero: null,
    reference: null,
    statut: 'brouillon',
    statutEffectif: 'brouillon',
    dossierCrm: { id: 'p-1', code: 'DFS_ALM.26', statut: 'en_validation' },
    dateValidite: null,
    dateEnvoi: null,
  });

// Copie conforme de l'ancienne fonction documentDepuisDevis de la page
// Finances (avant le 09/11/2026), branche « société chargée » : sert de
// référence pour vérifier que l'extraction n'a rien changé.
function ancienDocumentDepuisDevis(d: Devis, societe: Societe): DocumentFacturationProps {
  const s = statutDevis(d);
  return {
    typeDocument: 'Devis',
    societe,
    reference: d.reference,
    statutLabel: s.libelle,
    statutClasse: `pill--${s.ton}`,
    dateEmission: formatLongDate(d.dateEnvoi ?? d.creeLe),
    dateValidite: d.dateValidite ? formatLongDate(d.dateValidite) : null,
    clientNom: d.client.nom,
    objet: d.objet,
    lignes: d.lignes,
    montantHt: d.montantHt,
    montantTva: d.montantTva,
    montantTtc: d.montantTtc,
  };
}

describe('documentDevis (panneau Finances)', () => {
  it.each([
    ['une offre envoyée', devis()],
    ['un brouillon soumis au CFO', brouillonSoumis()],
    ['un brouillon hors CRM', devis({ statut: 'brouillon', statutEffectif: 'brouillon', dossierCrm: null })],
    ['une offre acceptée', devis({ statut: 'accepte', statutEffectif: 'accepte' })],
    ['une offre expirée', devis({ statutEffectif: 'expire' })],
    ['un devis sans date de validité', devis({ dateValidite: null })],
  ])('produit exactement le même document que l’ancienne page Finances pour %s', (_cas, d) => {
    expect(documentDevis(d, SOCIETE)).toEqual(ancienDocumentDepuisDevis(d, SOCIETE));
  });

  it('date une offre envoyée du jour de son envoi et reprend sa validité', () => {
    const doc = documentDevis(devis(), SOCIETE);
    expect(doc.dateEmission).toBe(formatLongDate('2026-11-09T10:30:00Z'));
    expect(doc.dateValidite).toBe(formatLongDate('2026-11-16'));
    expect(doc.reference).toBe('GC-OF12');
  });

  it('date un devis jamais envoyé du jour de sa création, sans validité', () => {
    const doc = documentDevis(brouillonSoumis(), SOCIETE);
    expect(doc.dateEmission).toBe(formatLongDate('2026-11-02T08:00:00Z'));
    expect(doc.dateValidite).toBeNull();
  });

  it('affiche « En validation CFO » sur un brouillon soumis', () => {
    const doc = documentDevis(brouillonSoumis(), SOCIETE);
    expect(doc.statutLabel).toBe('En validation CFO');
    expect(doc.statutClasse).toBe('pill--attention');
  });
});

describe('documentApercuOffre (aperçu du CFO avant envoi)', () => {
  // Jour passé en paramètre : aucune dépendance à l'horloge réelle.
  const AUJOURDHUI = '2026-11-09';

  it('date l’offre du jour et la rend valable VALIDITE_OFFRE_JOURS jours', () => {
    const doc = documentApercuOffre(brouillonSoumis(), SOCIETE, AUJOURDHUI);
    expect(doc.dateEmission).toBe(formatLongDate(AUJOURDHUI));
    expect(doc.dateValidite).toBe(formatLongDate(addDays(AUJOURDHUI, VALIDITE_OFFRE_JOURS)));
  });

  it('fait courir la validité à partir du jour de l’aperçu, sur 7 jours à ce jour', () => {
    // Garde-fou lisible : la règle validée (sept. 2026) est de 7 jours.
    expect(VALIDITE_OFFRE_JOURS).toBe(7);
    const doc = documentApercuOffre(brouillonSoumis(), SOCIETE, AUJOURDHUI);
    expect(doc.dateValidite).toBe(formatLongDate('2026-11-16'));
  });

  it('passe correctement d’un mois à l’autre et d’une année à l’autre', () => {
    const doc = documentApercuOffre(brouillonSoumis(), SOCIETE, '2026-12-28');
    expect(doc.dateEmission).toBe(formatLongDate('2026-12-28'));
    expect(doc.dateValidite).toBe(formatLongDate('2027-01-04'));
  });

  it('ignore les dates enregistrées sur le devis (création, envoi, validité)', () => {
    const doc = documentApercuOffre(devis(), SOCIETE, AUJOURDHUI);
    expect(doc.dateEmission).toBe(formatLongDate(AUJOURDHUI));
    expect(doc.dateValidite).toBe(formatLongDate('2026-11-16'));
    const ancien = documentApercuOffre(
      devis({ creeLe: '2026-01-05T08:00:00Z', dateValidite: '2026-01-12' }),
      SOCIETE,
      AUJOURDHUI,
    );
    expect(ancien.dateEmission).toBe(formatLongDate(AUJOURDHUI));
    expect(ancien.dateValidite).toBe(formatLongDate('2026-11-16'));
  });

  it('porte le libellé « Aperçu avant envoi » en pastille d’attention', () => {
    const doc = documentApercuOffre(brouillonSoumis(), SOCIETE, AUJOURDHUI);
    expect(doc.statutLabel).toBe('Aperçu avant envoi');
    expect(doc.statutClasse).toBe('pill--attention');
  });

  it('laisse la référence vide (null) sur un brouillon : le numéro est attribué à l’envoi', () => {
    expect(documentApercuOffre(brouillonSoumis(), SOCIETE, AUJOURDHUI).reference).toBeNull();
  });

  it('garde la référence existante telle quelle', () => {
    expect(documentApercuOffre(devis(), SOCIETE, AUJOURDHUI).reference).toBe('GC-OF12');
  });

  it('reprend tel quel le reste du document (société, client, objet, lignes, montants)', () => {
    const d = brouillonSoumis();
    const doc = documentApercuOffre(d, SOCIETE, AUJOURDHUI);
    const base = documentDevis(d, SOCIETE);
    expect(doc).toEqual({
      ...base,
      statutLabel: 'Aperçu avant envoi',
      statutClasse: 'pill--attention',
      dateEmission: formatLongDate(AUJOURDHUI),
      dateValidite: formatLongDate('2026-11-16'),
    });
    expect(doc.typeDocument).toBe('Devis');
    expect(doc.societe).toBe(SOCIETE);
    expect(doc.clientNom).toBe('Daouda Faye Sow');
    expect(doc.lignes).toBe(d.lignes);
    expect(doc.montantTtc).toBe(1_180_000);
  });
});
