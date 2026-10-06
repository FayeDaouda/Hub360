import { apiSociete } from './client-api';
import type { Temps } from './reglages';

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
  | { code: 'a_valider'; version: number }
  | { code: 'reprise'; version: number }
  | { code: 'en_retard'; jours: number }
  | { code: 'en_cours' }
  | { code: 'a_venir' };

export type EtatCarte =
  | { code: 'desactivee'; motif: string }
  | { code: 'rubriques' }
  | { code: 'verrouillee'; attend: string[] }
  | { code: 'close'; le: string | null }
  | { code: 'ouverte' };

export type EtatEtape = 'en_retard' | 'en_cours' | 'a_venir' | 'terminee';

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
  valideeLe: string | null;
  valideePar: string | null;
  assigne: { id: string; nom: string; cellule: string | null } | null;
  validation: { mode: 'depot' } | { mode: 'personne'; nom: string | null; role: string };
  peutDecider: boolean; // remise à trancher par la personne connectée
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
  pilote: string;
  version: { code: string; libelle: string } | null;
  offre: string | null;
  ouvertLe: string;
  livraisonLe: string;
  jour: number;
  horizon: number;
  budgetHeures: number | null;
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

// Remise : valider, ou renvoyer en reprise avec un motif.
export function deciderTache(slug: string, projetId: string, tacheId: string, decision: 'valider' | 'renvoyer', motif?: string) {
  return apiSociete<{ statut: string }>(slug, `/projets-ouverts/${projetId}/taches/${tacheId}/decision`, {
    method: 'POST',
    body: { decision, ...(motif ? { motif } : {}) },
  });
}

// Élément demandé par le client, ajouté en TS à une carte « par unité ».
export function ajouterTs(slug: string, projetId: string, carteId: string, element: string) {
  return apiSociete<{ id: string; libelle: string }>(slug, `/projets-ouverts/${projetId}/ts`, { method: 'POST', body: { carteId, element } });
}

// Fil de discussion d'une carte ou d'une tâche (un niveau de réponse).
export type Personne = { id: string; nom: string | null };
export type MessageFil = { id: string; texte: string; le: string; resoluLe: string | null; auteur: Personne | null; mentionne: Personne | null };
export type CommentaireFil = MessageFil & { ouvert: boolean; reponses: MessageFil[] };
export type CibleFil = { carteId: string } | { tacheId: string };

export function getMentionnables(slug: string): Promise<{ id: string; nom: string }[]> {
  return apiSociete(slug, '/projets-ouverts/mentionnables');
}

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
    case 'a_valider':
      return { libelle: `À valider · ${v(e.version)}`, ton: 'validation' };
    case 'reprise':
      return { libelle: `Reprise · ${v(e.version)}`, ton: 'attention' };
    case 'en_retard':
      return { libelle: `En attente · retard ${e.jours} j`, ton: 'risque' };
    case 'en_cours':
      return { libelle: 'En cours', ton: 'info' };
    case 'verrouillee':
      return { libelle: 'Verrouillée', ton: 'neutre' };
    case 'non_necessaire':
      return { libelle: 'Non nécessaire', ton: 'eteint' };
    case 'desactivee':
      return { libelle: 'Désactivée', ton: 'eteint' };
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

export type Ton = 'succes' | 'attention' | 'risque' | 'info' | 'validation' | 'neutre' | 'eteint';

// Temps standard d'une tâche, tel qu'affiché dans la ligne (maquette : « 8 h »,
// « 3,4 h », « — » sans temps atelier).
export function heuresTache(t: TacheOuverte): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h`;
  if (t.temps.type === 'partage' && t.temps.heures) return `${t.temps.heures} h`;
  return '—';
}
