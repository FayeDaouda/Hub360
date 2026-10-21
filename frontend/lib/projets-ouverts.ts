import { apiSociete } from './client-api';
import type { Temps } from './reglages';
import type { StatutDevisEffectif } from './types';

// -----------------------------------------------------------------------------
// Projets ouverts selon le gabarit (maquette « Projets » du boss). Branché sur :
//   GET /api/societes/:slug/projets-ouverts       (liste + tuiles)
//   GET /api/societes/:slug/projets-ouverts/:id   (dossier : étapes, cartes, tâches)
//   GET /api/societes/:slug/projets-ouverts/assignables
//   PATCH …/projets-ouverts/:id/taches/:tacheId/assignation  { collaborateurId, carte }
//   GET …/projets-ouverts/:id/taches/:tacheId/historique
//   GET …/projets-ouverts/mentionnables · GET/POST …/projets-ouverts/:id/fil
//   POST …/projets-ouverts/:id/fil/:commentaireId/resolution
// Les états (en cours, en retard, avance…) sont dérivés côté serveur au jour
// de la lecture, depuis les délais figés à l'ouverture (émission de F1).
// -----------------------------------------------------------------------------

export type ProjetOuvertResume = {
  id: string;
  code: string;
  client: string;
  cellule: string | null;
  jour: number; // J actuel
  horizon: number; // J de livraison
  faites: number;
  total: number;
  enRetard: number;
  livraisonDepassee: boolean; // J > horizon et projet non livré
};

export type TableauProjets = {
  gabarit: string;
  budgetHeures: number; // en service (Réglages) ; horizon = budget / 8 h
  projets: ProjetOuvertResume[];
  kpi: {
    remisesAValider: number;
    // Remises que la personne connectée peut trancher (jamais les siennes).
    aValiderParVous: { projetId: string; tacheId: string }[];
    tachesEnRetard: number;
    prolongations: number;
    tsNonAcceptes: number;
    mentions: number;
  };
};

export type EtatTache =
  | { code: 'desactivee' }
  | { code: 'non_necessaire' }
  | { code: 'verrouillee' }
  | { code: 'validee'; ecart: number | null }
  | { code: 'a_viser' } // validée par le chef de team, visa DPLG à apposer
  | { code: 'a_valider'; version: number }
  | { code: 'reprise'; version: number }
  | { code: 'en_retard'; jours: number }
  | { code: 'prolongee'; jusquau: string; jours: number } // retard qualifié par une prolongation accordée
  | { code: 'en_cours' }
  | { code: 'a_venir' };

export type EtatCarte =
  | { code: 'desactivee'; motif: string }
  | { code: 'rubriques' }
  | { code: 'verrouillee'; attend: string[] }
  | { code: 'close'; le: string | null }
  | { code: 'ouverte' };

export type EtatEtape = 'en_retard' | 'en_cours' | 'a_venir' | 'terminee';

// Fichier joint à une remise (v01, v02…) — sans son contenu.
export type PieceRemise = { id: string; nom: string; version: number };
// Remise : fichiers (data URI) et commentaire, tous deux facultatifs.
export type CorpsRemise = { pieces?: { nom: string; url: string }[]; commentaire?: string };

export type TacheOuverte = {
  id: string;
  cle: string;
  libelle: string;
  descriptif: string | null;
  sourceNative: boolean;
  debutJ: number | null;
  finJ: number | null;
  debutLe: string | null;
  finLe: string | null;
  temps: Temps;
  heures: number | null;
  statut: 'a_faire' | 'a_valider' | 'reprise' | 'validee' | 'non_necessaire';
  motif: string | null;
  version: number;
  pieces: PieceRemise[];
  // Élément TS : devis d'avenant qui le facture.
  avenant: { devisId: string; reference: string | null; statut: StatutDevisEffectif } | null;
  valideeLe: string | null;
  valideePar: string | null;
  // Visa DPLG exigé (gabarit) : apposé le… par… ; null si la tâche n'en exige pas.
  visa: { le: string | null; par: string | null } | null;
  peutViser: boolean; // l'architecte DPLG connecté peut apposer le visa
  assigne: { id: string; nom: string; cellule: string | null } | null;
  aMoi: boolean; // assignée à la personne connectée
  validation: { mode: 'depot' } | { mode: 'personne'; nom: string | null; role: string };
  peutDecider: boolean; // remise à trancher par la personne connectée
  peutRemettre: boolean; // la personne connectée est l'assignée, tâche ouverte
  // Prolongation : l'échéance de référence reste figée ; accordée, elle
  // qualifie le retard jusqu'à `accordeeJusquau`.
  prolongation: { enAttente: { jusquau: string; motif: string; le: string | null } | null; accordeeJusquau: string | null };
  peutDemanderProlongation: boolean;
  peutDeciderProlongation: boolean;
  fil: number; // messages du fil de la tâche
  etat: EtatTache;
};

export type CarteOuverte = {
  id: string;
  etapeNumero: number;
  etapeLibelle: string;
  cle: string;
  libelle: string;
  note: string | null;
  descriptif: string | null;
  etiquette: string | null;
  debutJ: number | null;
  finJ: number | null;
  debutLe: string | null;
  finLe: string | null;
  temps: Temps | null;
  client: boolean;
  fichiers: boolean;
  fil: number; // messages du « Fil de la carte »
  etat: EtatCarte;
  taches: TacheOuverte[];
};

export type EtapeOuverte = {
  numero: number;
  cle: string;
  libelle: string;
  faites: number;
  total: number;
  enRetard: number;
  etat: EtatEtape;
};

export type EtatFacture = 'emise' | 'brouillon' | 'absente';

export type DossierProjetOuvert = {
  id: string;
  code: string;
  client: { nom: string; type: string };
  cellule: { nom: string; chef: string | null } | null;
  jeSuisChef: boolean; // la personne connectée pilote la cellule du projet
  pilote: string;
  version: { code: string; libelle: string } | null;
  offre: string | null;
  ouvertLe: string;
  livraisonLe: string;
  jour: number;
  horizon: number;
  budgetHeures: number | null;
  dateVisiteSite: string | null; // AAAA-MM-JJ : relevés dus 24 h après
  statutChantier: StatutChantier;
  factures: Record<'F1' | 'F2' | 'F3', EtatFacture>;
  // « Ajouter en TS » (Architecte DPLG) ; vide = pas le droit.
  optionsTs: { carteId: string; libelle: string; heures: number }[];
  attentes: { F2: string[]; F3: string[] };
  etapes: EtapeOuverte[];
  cartes: CarteOuverte[];
};

export function getTableauProjets(slug: string): Promise<TableauProjets> {
  return apiSociete(slug, '/projets-ouverts');
}

export function getDossierProjet(slug: string, id: string): Promise<DossierProjetOuvert> {
  return apiSociete(slug, `/projets-ouverts/${id}`);
}

export type Assignable = { id: string; nom: string; cellule: string | null };
export type EvenementTache = { id: string; type: 'assignation' | 'remise' | 'validation' | 'reprise'; detail: string; par: string | null; le: string };

export function getAssignables(slug: string): Promise<Assignable[]> {
  return apiSociete(slug, '/projets-ouverts/assignables');
}

// À la tâche, ou (carte = true) à toutes les tâches encore ouvertes de sa carte.
export function assignerTache(
  slug: string,
  projetId: string,
  tacheId: string,
  collaborateurId: string | null,
  carte: boolean,
): Promise<{ modifiees: number }> {
  return apiSociete(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/assignation`, {
    method: 'PATCH',
    body: { collaborateurId, carte },
  });
}

// Remise par la personne assignée (sans temps atelier : le dépôt vaut validation).
export function remettreTache(slug: string, projetId: string, tacheId: string, corps: CorpsRemise = {}) {
  return apiSociete<{ statut: string; version: number }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/remise`, { method: 'POST', body: corps });
}

export async function telechargerPieceRemise(slug: string, projetId: string, tacheId: string, pieceId: string) {
  const f = await apiSociete<{ nom: string; url: string }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/pieces/${pieceId}`);
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  a.click();
}

// Prolongation : demande de l'assigné, décision du chef de team ou du DPLG.
export function demanderProlongation(slug: string, projetId: string, tacheId: string, jusquau: string, motif: string) {
  return apiSociete<{ ok: true }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/prolongation`, { method: 'POST', body: { jusquau, motif } });
}

export function deciderProlongation(slug: string, projetId: string, tacheId: string, accorder: boolean) {
  return apiSociete<{ decision: string }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/prolongation/decision`, {
    method: 'POST',
    body: { accorder },
  });
}

// Remise : valider, ou renvoyer en reprise avec un motif.
// Visa DPLG (revue Dir. GC, 21/10/2026) : apposer, ou refuser avec un motif.
export function viserTache(slug: string, projetId: string, tacheId: string, apposer: boolean, motif?: string) {
  return apiSociete<{ visa: 'appose' | 'refuse' }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/visa`, {
    method: 'POST',
    body: { apposer, ...(motif ? { motif } : {}) },
  });
}

export function deciderTache(slug: string, projetId: string, tacheId: string, decision: 'valider' | 'renvoyer', motif?: string) {
  return apiSociete<{ statut: string }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/decision`, {
    method: 'POST',
    body: { decision, ...(motif ? { motif } : {}) },
  });
}

// Statut simple du projet (14/10/2026) : la facturation mensuelle SU/EX
// (suivi et extras de chantier) s'y fie.
export type StatutChantier = 'conception' | 'chantier' | 'livre';
export const STATUTS_CHANTIER: Record<StatutChantier, string> = {
  conception: 'En conception',
  chantier: 'En chantier',
  livre: 'Livré',
};
export function definirStatutChantier(slug: string, projetId: string, statut: StatutChantier) {
  return apiSociete<{ statutChantier: StatutChantier }>(slug, `/projets-ouverts/${projetId}/chantier`, { method: 'PATCH', body: { statut } });
}

// Date de visite sur site : les relevés de l'existant reçoivent leur
// échéance (lendemain de la visite) ; null = effacer.
export function definirDateVisite(slug: string, projetId: string, date: string | null) {
  return apiSociete<{ dateVisiteSite: string | null }>(slug, `/projets-ouverts/${projetId}/visite`, { method: 'PATCH', body: { date } });
}

// Élément demandé par le client, ajouté en TS à une carte « par unité ».
// Reprise mineure (TS-MIN, forfait) ou majeure (TS-MAJ : tarif CO × surface ×
// planches) : la ligne du devis d'avenant est chiffrée par le catalogue.
export type RepriseTs = { reprise: 'mineure' } | { reprise: 'majeure'; surfaceM2: number; planches: number };
// Au-delà du seuil des Réglages (500 000 FCFA HT par défaut), le Dir. GC ne
// l'ajoute pas : la demande part au CTO (revue Dir. GC, 21/10/2026).
export type ResultatTs = { id: string; libelle: string; devisId: string } | { enAttente: true; demandeId: string; montantHt: number; seuil: number };
export function ajouterTs(slug: string, projetId: string, carteId: string, element: string, reprise: RepriseTs) {
  return apiSociete<ResultatTs>(slug, `/projets-ouverts/${projetId}/ts`, {
    method: 'POST',
    body: { carteId, element, ...reprise },
  });
}

// Fil de discussion d'une carte ou d'une tâche (un niveau de réponse).
export type Personne = { id: string; nom: string | null };
export type MessageFil = { id: string; texte: string; le: string; resoluLe: string | null; auteur: Personne | null; mentionne: Personne | null };
export type CommentaireFil = MessageFil & { ouvert: boolean; reponses: MessageFil[] };
export type CibleFil = { carteId: string } | { tacheId: string };

export function getMentionnables(slug: string): Promise<{ id: string; nom: string }[]> {
  return apiSociete(slug, '/projets-ouverts/mentionnables');
}

// « Mes tâches » : les @mentions qui me visent (non traitées, ou des 7 derniers jours).
export type MentionRecue = {
  id: string;
  texte: string;
  creeLe: string;
  lue: boolean;
  auteur: string | null;
  auteurId: string | null;
  projetId: string;
  projetCode: string;
  carteId: string;
  tacheId: string | null;
  cible: string; // libellé de la tâche, sinon de la carte
  racineId: string; // commentaire auquel répondre (racine du fil)
};
export const getMesMentions = (slug: string) => apiSociete<MentionRecue[]>(slug, '/projets-ouverts/mes-mentions');
export const marquerMentionLue = (slug: string, commentaireId: string) =>
  apiSociete<{ id: string }>(slug, `/projets-ouverts/mes-mentions/${commentaireId}/lue`, { method: 'POST', body: {} });

export function getFil(slug: string, projetId: string, cible: CibleFil): Promise<CommentaireFil[]> {
  const q = 'carteId' in cible ? `carte=${cible.carteId}` : `tache=${cible.tacheId}`;
  return apiSociete(slug, `/projets-ouverts/${projetId}/fil?${q}`);
}

export function publierCommentaire(
  slug: string,
  projetId: string,
  corps: CibleFil & { texte: string; mentionneId?: string | null; parentId?: string },
): Promise<{ id: string }> {
  return apiSociete(slug, `/projets-ouverts/${projetId}/fil`, { method: 'POST', body: corps });
}

export function resoudreCommentaire(slug: string, projetId: string, commentaireId: string): Promise<{ ok: true }> {
  return apiSociete(slug, `/projets-ouverts/${projetId}/fil/${commentaireId}/resolution`, { method: 'POST' });
}

// Charge prévisionnelle de chacun sur la fenêtre d'une tâche (avant
// d'assigner) — mêmes règles que les feuilles de temps ; zone = Réglages.
export type ChargePersonne = {
  collaborateurId: string;
  disponibles: number;
  assignees: number;
  joursAbsence: number;
  pourcentage: number | null; // avec cette tâche ; null = absent toute la fenêtre
};
export type ChargesTache = { periode: { debut: string; fin: string } | null; zone: { de: number; a: number } | null; charges: ChargePersonne[] };

export function getChargesTache(slug: string, projetId: string, tacheId: string): Promise<ChargesTache> {
  return apiSociete(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/charges`);
}

// Libellé court d'une charge (liste « Assigner »).
export function libelleCharge(c: ChargePersonne | undefined, zone: ChargesTache['zone']): string {
  if (!c) return '';
  if (c.pourcentage === null) return 'absent sur la période';
  const etat = zone && c.pourcentage > zone.a ? ' · surchargé' : zone && c.pourcentage < zone.de ? ' · disponible' : '';
  return `charge ${c.pourcentage} %${etat}`;
}

export function getHistoriqueTache(slug: string, projetId: string, tacheId: string): Promise<EvenementTache[]> {
  return apiSociete(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/historique`);
}

// --- Libellés (maquette) ------------------------------------------------------------

export const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
export const numeroEtape = (n: number) => String(n).padStart(2, '0');
const v = (n: number) => `v${String(n).padStart(2, '0')}`;

// Pastille d'une tâche : libellé + ton.
export function pastilleTache(e: EtatTache): { libelle: string; ton: Ton } {
  switch (e.code) {
    case 'validee':
      if (e.ecart && e.ecart > 0) return { libelle: `Validé · avance ${e.ecart} h`, ton: 'succes' };
      if (e.ecart && e.ecart < 0) return { libelle: `Validé · +${-e.ecart} h`, ton: 'attention' };
      return { libelle: 'Validé', ton: 'succes' };
    case 'a_viser':
      return { libelle: 'Visa DPLG à apposer', ton: 'attention' };
    case 'a_valider':
      return { libelle: `À valider · ${v(e.version)}`, ton: 'attention' };
    case 'reprise':
      return { libelle: `Reprise · ${v(e.version)}`, ton: 'attention' };
    case 'en_retard':
      return { libelle: `En attente · retard ${e.jours} j`, ton: 'risque' };
    case 'prolongee':
      return { libelle: `Retard qualifié · jusqu’au ${jjmm(e.jusquau)}`, ton: 'attention' };
    case 'en_cours':
      return { libelle: 'En cours', ton: 'info' };
    case 'verrouillee':
      return { libelle: 'Verrouillée', ton: 'neutre' };
    case 'non_necessaire':
      return { libelle: 'Non nécessaire', ton: 'neutre' };
    case 'desactivee':
      return { libelle: 'Désactivée', ton: 'neutre' };
    default:
      return { libelle: 'À venir', ton: 'neutre' };
  }
}

export function pastilleCarte(e: EtatCarte): { libelle: string; ton: Ton } {
  switch (e.code) {
    case 'desactivee':
      return { libelle: `Désactivée · ${e.motif}`, ton: 'neutre' };
    case 'rubriques':
      return { libelle: 'Rubriques', ton: 'neutre' };
    case 'verrouillee':
      return { libelle: 'Verrouillée', ton: 'neutre' };
    case 'close':
      return { libelle: e.le ? `Close le ${jjmm(e.le)}` : 'Close', ton: 'succes' };
    default:
      return { libelle: 'Ouverte', ton: 'info' };
  }
}

export function pastilleEtape(e: EtapeOuverte): { libelle: string; ton: Ton } {
  if (e.etat === 'en_retard') return { libelle: `${e.enRetard} en retard`, ton: 'risque' };
  if (e.etat === 'terminee') return { libelle: 'Terminée', ton: 'succes' };
  if (e.etat === 'en_cours') return { libelle: 'En cours', ton: 'info' };
  return { libelle: 'À venir', ton: 'neutre' };
}

// Mêmes tons que les pastilles .pill--* (couleur = sens) : « à valider »
// attend une décision → attention ; désactivé / non nécessaire → neutre.
export type Ton = 'succes' | 'attention' | 'risque' | 'info' | 'neutre';

// Temps standard d'une tâche, tel qu'affiché dans la ligne (maquette : « 8 h »,
// « 3,4 h », « — » sans temps atelier).
export function heuresTache(t: TacheOuverte): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h`;
  if (t.temps.type === 'partage' && t.temps.heures) return `${t.temps.heures} h`;
  return '—';
}

// « À décider » (revue Dir. GC, 21/10/2026) : remises et prolongations que la
// personne connectée peut trancher, sur tous ses projets.
type LigneADecider = { projetId: string; code: string; client: string; tacheId: string; tache: string; carte: string; assigne: string | null };
export type ADeciderProjets = {
  remises: (LigneADecider & { version: number; remiseLe: string | null })[];
  // repousseLivraison : date de livraison dépassée (escalade au CTO) ; null sinon.
  prolongations: (LigneADecider & { jusquau: string; motif: string; demandeLe: string; finPrevue: string | null; repousseLivraison: string | null })[];
  // Visas DPLG à apposer (Dir. GC).
  visas: (LigneADecider & { valideeLe: string | null })[];
  // TS au-delà du seuil, à trancher par le CTO.
  ts: DemandeTsADecider[];
};
export type DemandeTsADecider = {
  id: string;
  projetId: string;
  code: string;
  client: string;
  element: string;
  reprise: string;
  montantHt: number;
  demandeLe: string;
  demandePar: string | null;
};
export const deciderDemandeTs = (slug: string, projetId: string, demandeId: string, accepter: boolean, motif?: string) =>
  apiSociete<{ statut: 'acceptee' | 'refusee'; tacheId: string | null }>(slug, `/projets-ouverts/${projetId}/ts/demandes/${demandeId}/decision`, {
    method: 'POST',
    body: { accepter, ...(motif ? { motif } : {}) },
  });
export const getADeciderProjets = (slug: string) => apiSociete<ADeciderProjets>(slug, '/projets-ouverts/a-decider');

// Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : Dir. GC (ses
// projets), CTO et CEO (tous).
export type LigneProduction = {
  projet: { id: string; code: string; client: string; cellule: string | null };
  statutChantier: StatutChantier;
  etape: { numero: number; libelle: string } | null;
  faites: number;
  total: number;
  jour: number;
  horizon: number;
  livraisonLe: string;
  livraisonDepassee: boolean;
  enRetard: number;
  prolongees: number;
  attente: { remises: number; visas: number; prolongations: number; ts: number };
  tranche: { code: 'F2' | 'F3'; statut: 'brouillon' | 'absente'; attend: string[] } | null;
  echeances: { carte: string; finLe: string }[];
};
export type ChargeMembre = { id: string; nom: string; heures: number; disponibles: number; pourcentage: number | null; joursAbsence: number };
export type VueProduction = {
  perimetre: 'mes_projets' | 'tous';
  chiffres: { ouverts: number; enRetard: number; livraisons15: number; enAttente: number; chargeMoyenne: number | null };
  lignes: LigneProduction[];
  charge: {
    periode: { debut: string; fin: string };
    zone: { de: number; a: number } | null;
    cellules: { code: string; nom: string; moyenne: number | null; membres: ChargeMembre[] }[];
  };
  livraisons: { projetId: string; code: string; client: string; livraisonLe: string }[];
};
export const getProduction = (slug: string) => apiSociete<VueProduction>(slug, '/projets-ouverts/production');
