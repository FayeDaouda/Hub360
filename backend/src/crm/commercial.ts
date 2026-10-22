// Vue commerciale du COO (revue COO, 22/10/2026) — règles pures : ce qui
// attend une action dans le CRM (« À traiter aujourd'hui ») et la
// performance commerciale de l'année (apporteurs, transformation, délai).
// Dates AAAA-MM-JJ ; « maintenant » en millisecondes pour le délai de 72 h.

import { champsManquants, type ChampsFiche } from './fiche';
import { DELAI_RELANCE_FICHE_MS } from './notifications-crm';

export type DossierCommercial = ChampsFiche & {
  id: string;
  client: string;
  statut: 'nouveau_projet' | 'en_validation' | 'offre_envoyee' | 'onboard' | 'perdu';
  creeLe: Date;
  archive: boolean;
  proprietaireId: string | null;
  apporteur:
    | { type: 'interne'; id: string | null; nom: string }
    | { type: 'externe'; nom: string; structure: string | null; telephone: string | null; email: string | null }
    | null;
  commission: number | null;
  // Offre en cours (la plus récente) : dates seulement, jamais de montant.
  offre: { statut: string; envoyeeLe: string | null; valideJusquau: string | null } | null;
  signeLe: string | null; // passage en Onboard (contrat signé)
  // HT de l'offre en cours (de l'offre acceptée une fois signé) ; null sans
  // offre ou sans le droit de voir les montants (lot D).
  montantHt: number | null;
};

export type TypeATraiter = 'fiche_incomplete' | 'lead_sans_proprietaire' | 'offre_chez_client' | 'apporteur_incomplet';

export type ElementATraiter = {
  type: TypeATraiter;
  dossierId: string;
  code: string;
  client: string;
  ton: 'risque' | 'attention' | 'info';
  detail: string;
  tri: string; // le plus ancien / le plus proche d'abord
};

const JOUR_MS = 86_400_000;
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const joursEntre = (de: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / JOUR_MS);
const EN_COURS = new Set(['nouveau_projet', 'en_validation', 'offre_envoyee']);

// Fiche apporteur à compléter : sans % attribué (la commission ne pourrait
// pas être calculée), ou apporteur externe sans moyen de le joindre.
export function manquesApporteur(d: Pick<DossierCommercial, 'apporteur' | 'commission'>): string[] {
  if (!d.apporteur) return [];
  const manques: string[] = [];
  if (d.commission === null) manques.push('% attribué');
  if (d.apporteur.type === 'externe' && !d.apporteur.telephone && !d.apporteur.email) manques.push('téléphone ou e-mail');
  return manques;
}

export function aTraiterCommercial(dossiers: DossierCommercial[], jour: string, maintenant: number): ElementATraiter[] {
  const elements: ElementATraiter[] = [];
  for (const d of dossiers) {
    if (d.archive || !EN_COURS.has(d.statut)) continue;
    const base = { dossierId: d.id, code: d.code, client: d.client };
    // 1. Fiche incomplète : 72 h pour la compléter, puis relance.
    const manques = d.statut === 'nouveau_projet' ? champsManquants(d) : [];
    if (manques.length) {
      const reste = d.creeLe.getTime() + DELAI_RELANCE_FICHE_MS - maintenant;
      elements.push({
        ...base,
        type: 'fiche_incomplete',
        ton: reste <= 0 ? 'risque' : 'attention',
        // Le délai d'abord : la liste des champs peut être tronquée à l'écran.
        detail: `${reste <= 0 ? `72 h dépassées depuis ${Math.max(1, Math.floor(-reste / JOUR_MS))} j` : `${Math.ceil(reste / 3_600_000)} h restantes`} · ${
          manques.length
        } champ${manques.length > 1 ? 's' : ''} manquant${manques.length > 1 ? 's' : ''} (${manques.join(', ')})`,
        tri: d.creeLe.toISOString(),
      });
    }
    // 2. Lead sans propriétaire : personne ne le porte.
    if (!d.proprietaireId) {
      elements.push({ ...base, type: 'lead_sans_proprietaire', ton: 'risque', detail: 'aucun Dir. GC ne porte ce lead', tri: d.creeLe.toISOString() });
    }
    // 3. Offre chez le client : validité, réponse attendue.
    if (d.statut === 'offre_envoyee' && d.offre?.statut === 'envoye' && d.offre.valideJusquau) {
      const reste = joursEntre(jour, d.offre.valideJusquau);
      const depuis = d.offre.envoyeeLe ? joursEntre(d.offre.envoyeeLe, jour) : null;
      elements.push({
        ...base,
        type: 'offre_chez_client',
        ton: reste < 0 ? 'risque' : reste <= 2 ? 'attention' : 'info',
        detail: `${depuis !== null ? `envoyée il y a ${depuis} j, ` : ''}${
          reste < 0 ? `expirée le ${jjmm(d.offre.valideJusquau)} sans réponse` : reste === 0 ? 'expire aujourd’hui' : `valable jusqu’au ${jjmm(d.offre.valideJusquau)}`
        }`,
        tri: d.offre.valideJusquau,
      });
    }
    // 4. Fiche apporteur : le COO seul la modifie.
    const apporteur = manquesApporteur(d);
    if (apporteur.length) {
      elements.push({
        ...base,
        type: 'apporteur_incomplet',
        ton: 'attention',
        detail: `apporteur ${d.apporteur!.nom} · à renseigner : ${apporteur.join(', ')}`,
        tri: d.creeLe.toISOString(),
      });
    }
  }
  return elements;
}

export type LignePerformance = {
  cle: string;
  libelle: string;
  type: 'interne' | 'externe' | 'direct';
  leads: number;
  signes: number;
  enCours: number;
  signeHt: number; // somme HT des offres acceptées (0 sans le droit)
};

// Apporteur d'un dossier : compte HUB (interne), nom + structure (externe),
// ou « Affaire directe ».
function apporteurDe(d: DossierCommercial): Pick<LignePerformance, 'cle' | 'libelle' | 'type'> {
  const a = d.apporteur;
  if (!a) return { cle: 'direct', libelle: 'Affaire directe', type: 'direct' };
  if (a.type === 'interne') return { cle: `interne:${a.id ?? a.nom}`, libelle: a.nom, type: 'interne' };
  const nom = a.nom.trim();
  return { cle: `externe:${nom.toLowerCase()}`, libelle: a.structure ? `${nom} · ${a.structure}` : nom, type: 'externe' };
}

// Performance de l'année (leads créés dans l'année, archivés compris : un
// lead abandonné est un lead non transformé).
export function performanceCommerciale(dossiers: DossierCommercial[]) {
  const signes = dossiers.filter((d) => d.statut === 'onboard');
  const delais = signes.filter((d) => d.signeLe).map((d) => joursEntre(d.creeLe.toISOString().slice(0, 10), d.signeLe!));
  const lignes = new Map<string, LignePerformance>();
  for (const d of dossiers) {
    const a = apporteurDe(d);
    const l = lignes.get(a.cle) ?? { ...a, leads: 0, signes: 0, enCours: 0, signeHt: 0 };
    l.leads++;
    if (d.statut === 'onboard') {
      l.signes++;
      l.signeHt += d.montantHt ?? 0;
    }
    else if (!d.archive && EN_COURS.has(d.statut)) l.enCours++;
    lignes.set(a.cle, l);
  }
  return {
    leads: dossiers.length,
    signes: signes.length,
    signeHt: signes.reduce((s, d) => s + (d.montantHt ?? 0), 0),
    enCours: dossiers.filter((d) => !d.archive && EN_COURS.has(d.statut)).length,
    tauxTransformation: dossiers.length ? Math.round((signes.length / dossiers.length) * 100) : null,
    delaiMoyenJours: delais.length ? Math.round(delais.reduce((s, x) => s + x, 0) / delais.length) : null,
    apporteurs: [...lignes.values()].sort((a, b) => b.signes - a.signes || b.leads - a.leads || a.libelle.localeCompare(b.libelle)),
  };
}

// Totaux HT du pipeline par étape (revue COO, lot D) : nombre de dossiers et
// somme HT de leur offre, sans le détail des offres. Archivés exclus ; une
// offre envoyée dont la validité est passée compte en « expirée ».
export type EtapePipeline = 'preparation' | 'en_validation' | 'chez_client' | 'expiree' | 'signe' | 'perdu';
export const ETAPES_PIPELINE: EtapePipeline[] = ['preparation', 'en_validation', 'chez_client', 'expiree', 'signe', 'perdu'];

export function etapePipeline(d: Pick<DossierCommercial, 'statut' | 'offre'>, jour: string): EtapePipeline {
  switch (d.statut) {
    case 'nouveau_projet':
      return 'preparation';
    case 'en_validation':
      return 'en_validation';
    case 'offre_envoyee':
      return d.offre?.statut === 'envoye' && d.offre.valideJusquau && d.offre.valideJusquau < jour ? 'expiree' : 'chez_client';
    case 'onboard':
      return 'signe';
    default:
      return 'perdu';
  }
}

export function totauxPipeline(dossiers: DossierCommercial[], jour: string) {
  const totaux = new Map(ETAPES_PIPELINE.map((e) => [e, { etape: e, dossiers: 0, avecOffre: 0, totalHt: 0 }]));
  for (const d of dossiers) {
    if (d.archive) continue;
    const t = totaux.get(etapePipeline(d, jour))!;
    t.dossiers++;
    if (d.montantHt !== null) {
      t.avecOffre++;
      t.totalHt += d.montantHt;
    }
  }
  return [...totaux.values()];
}
