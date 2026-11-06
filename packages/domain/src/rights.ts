// Les quatre droits de la matrice (décision du 31/10/2026) : Lecture,
// Écriture, Validation, Suppression, indépendants les uns des autres, réglés
// par étape d'un module. Une seule écriture pour le serveur et l'écran : qui a
// quel droit reste décidé au serveur (matrice), ceci n'est que le codage.
//
// Codage : une étape vaut une chaîne de lettres parmi « LEVS » (ex. « LE »),
// la chaîne vide = aucun droit. C'est ce que portent la session et le jeton.

export const RIGHTS = ['lecture', 'ecriture', 'validation', 'suppression'] as const;
export type Right = (typeof RIGHTS)[number];

export const RIGHT_LABELS: Record<Right, string> = {
  lecture: 'Lecture',
  ecriture: 'Écriture',
  validation: 'Validation',
  suppression: 'Suppression',
};

const LETTERS: Record<Right, string> = { lecture: 'L', ecriture: 'E', validation: 'V', suppression: 'S' };

export type RightSet = Record<Right, boolean>;

export const NO_RIGHTS: RightSet = { lecture: false, ecriture: false, validation: false, suppression: false };
export const ALL_RIGHTS: RightSet = { lecture: true, ecriture: true, validation: true, suppression: true };

// Anciennes valeurs (niveaux en échelle, avant le 31/10/2026), encore
// présentes dans une session ouverte avant la mise à jour : lues comme la
// migration les a converties (écriture couvrait aussi la suppression).
const LEGACY_LEVELS: Record<string, string> = {
  aucun: '',
  lecture: 'L',
  ecriture: 'LES',
  validation: 'LEVS',
};

/** Droits d'une étape lus depuis la session ou le jeton. */
export function decodeRights(value: string | undefined | null): RightSet {
  const letters = value ? (LEGACY_LEVELS[value] ?? value) : '';
  return {
    lecture: letters.includes('L'),
    ecriture: letters.includes('E'),
    validation: letters.includes('V'),
    suppression: letters.includes('S'),
  };
}

/** Écriture compacte, toujours dans l'ordre L, E, V, S. */
export function encodeRights(rights: RightSet): string {
  return RIGHTS.filter((r) => rights[r])
    .map((r) => LETTERS[r])
    .join('');
}

/**
 * Règle de cohérence : agir (Écriture, Validation, Suppression) donne la
 * Lecture ; un droit « sans objet » pour l'étape n'est jamais accordé.
 */
export function normalizeRights(rights: RightSet, applicable: RightSet = ALL_RIGHTS): RightSet {
  const kept = {
    lecture: rights.lecture && applicable.lecture,
    ecriture: rights.ecriture && applicable.ecriture,
    validation: rights.validation && applicable.validation,
    suppression: rights.suppression && applicable.suppression,
  };
  if (kept.ecriture || kept.validation || kept.suppression) kept.lecture = applicable.lecture;
  return kept;
}

/**
 * La carte des droits (étape → lettres) donne-t-elle `right` sur `step` ?
 * Une étape absente vaut aucun droit (refus par défaut). « aucun » n'exige rien.
 */
export function hasRight(
  permissions: Record<string, string> | undefined | null,
  step: string,
  right: Right | 'aucun',
): boolean {
  if (right === 'aucun') return true;
  return decodeRights(permissions?.[step])[right];
}

/** « Écriture ajoutée, Suppression retirée » : ce qui change entre deux états. */
export function describeRightsChange(before: RightSet, after: RightSet): string {
  const parts: string[] = [];
  for (const r of RIGHTS) {
    if (before[r] !== after[r]) parts.push(`${RIGHT_LABELS[r]} ${after[r] ? 'ajoutée' : 'retirée'}`);
  }
  return parts.join(', ');
}

// Clés des étapes lues par le code (routes du serveur, boutons de l'écran) :
// des noms, comme ceux des rôles. Leurs phrases et leurs droits de départ
// vivent au serveur (backend/src/rights/catalogue.ts, migrations).
export const ETAPE = {
  crmDossiers: 'crm.dossiers',
  crmSoumission: 'crm.soumission',
  crmProprietaire: 'crm.proprietaire',
  crmApporteur: 'crm.apporteur',
  crmTotaux: 'crm.totaux',
  // Finances (lot 3) : les quatre clés historiques restent les étapes
  // principales (Offres, Factures, Marges et rentabilité, Charges).
  financesOffres: 'finances_devis',
  financesContresignature: 'finances.contresignature',
  financesCatalogue: 'finances.catalogue',
  financesFactures: 'finances_factures',
  financesEncaissements: 'finances.encaissements',
  financesCloture: 'finances.cloture',
  financesParametres: 'finances.parametres',
  financesGroupe: 'finances.groupe',
  financesMarges: 'finances_marges',
  financesRentabiliteDetail: 'finances.rentabilite_detail',
  financesCharges: 'finances_charges',
  financesCommissions: 'finances.commissions',
  // Projets (lot 5) : « projets » reste l'étape principale.
  projets: 'projets',
  projetsAssignation: 'projets.assignation',
  projetsValidation: 'projets.validation',
  projetsVisa: 'projets.visa',
  projetsProlongations: 'projets.prolongations',
  projetsTs: 'projets.ts',
  projetsFils: 'projets.fils',
  projetsProduction: 'projets.production',
  projetsPersonnalisation: 'projets.personnalisation',
  // Équipe (lot 6).
  equipe: 'equipe',
  equipeProjets: 'equipe.projets',
  // RH (lot 7) : « rh » reste l'étape principale (dossiers du personnel).
  rh: 'rh',
  rhSalaires: 'rh.salaires',
  rhBulletins: 'rh.bulletins',
  rhTemps: 'rh.temps',
  rhIntegration: 'rh.integration',
  rhDemandes: 'rh.demandes',
  // Pilotage (lot 8) : « pilotage » reste l'étape principale.
  pilotage: 'pilotage',
  pilotageRegistre: 'pilotage.registre',
  pilotageDecisions: 'pilotage.decisions',
  pilotageSynthese: 'pilotage.synthese',
  pilotageDelegation: 'pilotage.delegation',
  pilotageJournal: 'pilotage.journal',
  // Documents et Communication (lot 9).
  documents: 'documents',
  communication: 'communication',
  // Agenda (lot 11).
  agenda: 'agenda',
  agendaReunions: 'agenda.reunions',
  agendaAutres: 'agenda.autres',
  // Annonces (lot 12).
  annonces: 'annonces',
  // Recrutement (lot 13).
  recrutementPostes: 'recrutement.postes',
  recrutementCandidatures: 'recrutement.candidatures',
  recrutementDecision: 'recrutement.decision',
  // Recrutement côté RH (01/11/2026).
  recrutementDirect: 'recrutement.direct',
  recrutementGroupe: 'recrutement.groupe',
  recrutementAppels: 'recrutement.appels',
} as const;
