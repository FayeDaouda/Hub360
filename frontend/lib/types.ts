import type { FicheProgramme } from './fiche-programme';
export type Societe = {
  id: string;
  nom: string;
  slug: string;
  logoUrl: string | null;
  logoUrlSombre: string | null;
  couleurMarque: string | null;
  icone: string | null;
  secteur: string | null;
  // Pied des documents (devis, factures) — tel que fourni par la société.
  mentionsLegales: string | null;
  coordonnees: string | null;
  penaliteRetardMensuelle: number | null; // % par mois (CGV art. 13)
};

export type Session = {
  access_token: string;
  utilisateur: {
    id: string;
    email: string;
    nom: string;
    prenom: string;
  };
  societe: {
    id: string;
    nom: string;
    slug: string;
  };
  role: string;
  // Carte module → niveau (matrice RolePermission), identique au JWT. Absente
  // d'une session ouverte avant son ajout : traitée comme « aucun » partout
  // (cf. lib/auth.ts::aLaPermission) — une reconnexion la récupère.
  permissions?: Partial<Record<string, NiveauPermission>>;
};

// --- Tableau de bord back-office d'une société ---
// Contrat partagé avec le futur endpoint backend
// `GET /api/societes/:slug/tableau-de-bord` — le front ne fait qu'afficher.

export type FormatValeur = 'montant' | 'montant_compact' | 'pourcent' | 'nombre' | 'surface';

export type PointHistogramme = {
  libelle: string;
  valeur: number;
  actif?: boolean;
};

export type Histogramme = {
  titre: string;
  unite: string;
  points: PointHistogramme[];
};

// --- Clients & projets (page /admin/[slug]/projets) ---
// Contrat partagé avec le futur backend `…/societes/:slug/projets` &
// `…/societes/:slug/clients` — le front ne fait qu'afficher / envoyer.

export type TypeClient = 'particulier' | 'sci' | 'entreprise' | 'institution';

export const TYPES_CLIENT: Record<TypeClient, string> = {
  particulier: 'Particulier',
  sci: 'SCI',
  entreprise: 'Entreprise',
  institution: 'Institution',
};

// Entité à part (choix produit : un client peut porter plusieurs projets,
// avec historique et fiche réutilisable).
export type Client = {
  id: string;
  reference?: string | null; // « CL-0009 » — rang du client dans la société
  nom: string;
  type: TypeClient;
  // Sigle choisi par l'entreprise — obligatoire pour une personne morale,
  // segment CLIENT du code dossier (cf. lib/nomenclature.ts).
  sigle?: string;
  contact?: string; // personne référente
  email?: string;
  telephone?: string;
  adresse?: string; // reprise sur les devis et factures ; "" = à renseigner
};

// Type de projet (doc « Création de projet côté CRM » §3.3, oct. 2026).
export type TypeBien =
  | 'villa'
  | 'immeuble_residentiel'
  | 'immeuble_mixte'
  | 'immeuble_bureaux'
  | 'local_commercial'
  | 'hotelier'
  | 'equipement';

export const TYPES_BIEN: Record<TypeBien, string> = {
  villa: 'Villa',
  immeuble_residentiel: 'Immeuble résidentiel',
  immeuble_mixte: 'Immeuble mixte',
  immeuble_bureaux: 'Immeuble de bureaux',
  local_commercial: 'Local commercial',
  hotelier: 'Hôtelier',
  equipement: 'Équipement',
};

// Catégorie = type de mission confiée à Grey Concrete (doc §3.3), choisie
// librement — indépendante de la nature de la mission (mandat / promotion).
// Détermine les sections disponibles : « aménagement » n'a ni permis de
// construire ni étude (voir SECTIONS_PAR_CATEGORIE plus bas). « Développement »
// suit la conception (hypothèse de travail, oct. 2026, à confirmer).
export type Categorie = 'conception' | 'developpement' | 'amenagement';

export const CATEGORIES: Record<Categorie, string> = {
  conception: 'Conception',
  developpement: 'Développement',
  amenagement: 'Aménagement',
};

// Standing (ce que le bâtiment offre) et gamme (avec quoi on le finit) :
// listes du doc « Création de projet côté CRM » §3.4 (oct. 2026).
export type Standing = 'economique' | 'moyen' | 'grand';

export const STANDINGS: Record<Standing, string> = {
  economique: 'Économique · aucune commodité',
  moyen: 'Moyen · quelques commodités',
  grand: 'Grand · tout inclus',
};

export type Gamme = 'local' | 'importe' | 'sur_mesure_importe';

export const GAMMES: Record<Gamme, string> = {
  local: 'Local',
  importe: 'Importé',
  sur_mesure_importe: 'Sur-mesure importé',
};

// Nature du dossier : Grey Concrete travaille en mandat pour un client
// externe, OU développe ses propres opérations (promotion). Champ obligatoire
// dès la création — il conditionne le vocabulaire du pipeline, la fiche
// programme et la checklist avant-projet.
export type NatureDossier = 'mandat_client' | 'promotion_interne';

export const NATURES_DOSSIER: Record<NatureDossier, string> = {
  mandat_client: 'Mandat client',
  promotion_interne: 'Promotion interne',
};

// Statut d'un dossier dans le cycle commercial (étape E, sept. 2026). On ne
// le change jamais directement : on déclenche une ACTION (lib/cycle-crm.ts),
// que le serveur autorise ou non. Passer à « onboard » crée le projet
// d'exécution. onboard et perdu sont définitifs.
export type StatutCrm = 'nouveau_projet' | 'en_validation' | 'offre_envoyee' | 'onboard' | 'perdu';

// Un seul jeu de libellés : le cycle est celui de Grey Concrete, la nature
// « Promotion interne » restant fermée à la création.
export const STATUTS_CRM: Record<StatutCrm, string> = {
  nouveau_projet: 'Nouveau projet',
  en_validation: 'En validation (DAF)',
  offre_envoyee: 'Offre envoyée',
  onboard: 'Onboard',
  perdu: 'Perdu',
};

export const STATUTS_ORDRE: StatutCrm[] = [
  'nouveau_projet',
  'en_validation',
  'offre_envoyee',
  'onboard',
  'perdu',
];

// Une ligne du journal du cycle (de = null : création / reprise de données).
export type TransitionDossier = {
  id: string;
  de: StatutCrm | null;
  vers: StatutCrm;
  par: Personne | null;
  commentaire: string | null;
  le: string; // ISO 8601
};

// Une ligne du CRM = un projet / dossier immobilier.
// --- Référentiel des localités (partagé par toutes les sociétés du HUB) ---
// Code = 3 lettres, unique sur les trois zones ; figé dès qu'un dossier
// l'utilise (`codeVerrouille`) — seul le nom reste corrigeable.
export type ZoneLocalite = 'dakar' | 'senegal' | 'pays';

export const ZONES_LOCALITE: Record<ZoneLocalite, string> = {
  dakar: 'Dakar',
  senegal: 'Villes Sénégal',
  pays: 'Pays',
};

// Libellé du niveau `region` selon la zone (colonnes du fichier source).
export const LIBELLE_REGION_LOCALITE: Record<ZoneLocalite, string> = {
  dakar: 'Département',
  senegal: 'Région',
  pays: 'Zone',
};

export type Localite = {
  id: string;
  code: string;
  nom: string;
  zone: ZoneLocalite;
  region: string;
  arrondissement: string | null;
  commune: string | null;
  codeVerrouille: boolean;
};

export type NouvelleLocalitePayload = {
  code: string;
  nom: string;
  zone: ZoneLocalite;
  region: string;
  arrondissement?: string | null;
  commune?: string | null;
};

export type Projet = {
  id: string;
  code: string; // code dossier — ex : DF_PE.26 (cf. lib/nomenclature.ts)
  nature: NatureDossier;
  // Lead créé incomplet : null / 0 / "" = à renseigner (cf. completudeFiche).
  categorie: Categorie | null; // null = « À choisir »
  localisation: string; // libellé affiché
  // null = dossier antérieur au référentiel, pas encore rattaché.
  localite: Pick<Localite, 'id' | 'code' | 'nom'> | null;
  type: TypeBien | null;
  nbPlanches: number; // nombre de planches (0 = à renseigner)
  surfaceTerrain: number; // m² (0 = à renseigner)
  client: Client;
  standing: Standing | null;
  gamme: Gamme | null;
  programme: string; // résumé automatique de la Fiche Programme ; "" = à remplir
  ficheProgramme: FicheProgramme | null; // null = pas encore commencée
  statut: StatutCrm;
  // Contenu de la fiche figé dès la soumission à la DAF (propriétaire excepté).
  verrouillee: boolean;
  creeLe: string; // ISO 8601
  creePar: Personne | null; // null = dossier antérieur à l'étape C1
  // null = aucun apporteur (affaire directe), ou dossier antérieur à la fiche.
  apporteur: Apporteur | null;
  // % attribué — partie de la fiche apporteur ; null = aucun.
  commissionApporteur: number | null;
  proprietaire: Personne | null; // null = « à assigner »
  // CO1/CO2/CO3 — fixée à l'envoi de l'offre (null avant). SU en découle.
  categorieConception: string | null;
  // Offre en cours (étape F). Clé absente sans finances_devis en lecture ;
  // null = pas encore d'offre préparée.
  offre?: OffreDossier | null;
  // Offre envoyée restée sans réponse au-delà de sa validité (visible sans
  // droit Finances : le statut seul).
  offreExpiree: boolean;
  soumisLe: string | null; // soumis au CFO le… (en validation seulement) — délai 48 h
  // null = lead actif ; sinon figé, consultable dans « Archivés » (code réservé).
  archive: { le: string; par: Personne | null } | null;
};

// Résumé de l'offre en cours d'un dossier (la plus récente).
export type OffreDossier = {
  id: string;
  reference: string | null; // null tant que brouillon
  statutEffectif: StatutDevisEffectif;
  objet: string;
  nbLignes: number;
  lignesAZero: number; // lignes à 0 FCFA — rappel affiché, jamais bloquant
  montantTtc: number;
  dateEnvoi: string | null;
  dateValidite: string | null; // AAAA-MM-JJ — envoi + 7 jours
  dateReponse: string | null;
  relancesEnvoyees: number;
  relanceAFaire: boolean;
};

// Personne référencée sur une fiche (compte HUB).
export type Personne = { id: string; nom: string };

export type TypeApporteur = 'interne' | 'externe';

// Interne = dossiers antérieurs seulement (plus proposé à la création).
export type Apporteur =
  | { type: 'interne'; utilisateur: Personne | null }
  | { type: 'externe'; nom: string; structure?: string; telephone?: string; email?: string };

// Fiche apporteur saisie (création, puis modification par le COO seul) :
// aucun apporteur (affaire directe), ou un tiers avec nom et % attribué.
export type ApporteurSaisi =
  | { type: 'aucun' }
  | {
      type: 'externe';
      nom: string;
      structure?: string;
      telephone?: string;
      email?: string;
      commission: number;
    };

// Pas fixes validés (sept. 2026) — mêmes valeurs que le serveur et la base.
export const PAS_COMMISSION = [3, 3.5, 4, 4.5, 5] as const;

// Charge utile de la modale « Nouveau projet » (maquette, oct. 2026) :
// client (existant, ou nouveau avec sa nature), localité et fiche apporteur.
// Le reste se complète sur la fiche ; le code et le propriétaire (Dir. GC)
// sont résolus côté serveur.
export type NouveauProjetPayload = {
  nature: NatureDossier;
  localiteId: string; // le libellé `localisation` est déduit côté serveur
  client: { id: string } | { nouveau: { nom: string; type: TypeClient } };
  apporteur: ApporteurSaisi;
};

// Complétion de la fiche (« Caractéristiques du projet ») : un champ à la
// fois ; une valeur se corrige, jamais ne s'efface.
// Le programme (résumé) et, quand ils se calculent, les planches sont déduits
// de la Fiche Programme par le serveur.
export type ModifierFichePayload = Partial<{
  categorie: Categorie;
  type: TypeBien;
  surfaceTerrain: number;
  nbPlanches: number;
  standing: Standing;
  gamme: Gamme;
  ficheProgramme: FicheProgramme;
}>;

// --- Équipe : 6 cellules cross-fonctionnelles (Archi 1-4, Intérieur, Études) ---
// Un projet peut être suivi par PLUSIEURS cellules (décision boss, sept.
// 2026 — remplace « 1 projet = 1 cellule »). L'admin y a un CRUD complet
// (page Équipe). Un collaborateur, lui, reste rattaché à une seule cellule
// au plus (celluleId null = sans cellule), ça ne change pas.

// Séniorité (2ᵉ axe, distinct du métier `role`).
export type NiveauCollaborateur = 'stagiaire' | 'junior' | 'confirme' | 'senior' | 'lead';

export const NIVEAUX_COLLABORATEUR: Record<NiveauCollaborateur, string> = {
  stagiaire: 'Stagiaire',
  junior: 'Junior',
  confirme: 'Confirmé',
  senior: 'Senior',
  lead: 'Lead',
};

export const NIVEAUX_ORDRE: NiveauCollaborateur[] = [
  'stagiaire',
  'junior',
  'confirme',
  'senior',
  'lead',
];

// Statut du compte de connexion — dérivé côté serveur (pas un champ stocké) :
// sans_compte → invité → actif → désactivé. À relire à chaque chargement de
// liste (pas de valeur en cache client — elle peut changer depuis un autre
// onglet / un autre admin).
export type StatutCompte = 'sans_compte' | 'invite' | 'actif' | 'desactive';

export const STATUTS_COMPTE: Record<StatutCompte, string> = {
  sans_compte: 'Pas de compte',
  invite: 'Invité',
  actif: 'Actif',
  desactive: 'Désactivé',
};

export type Collaborateur = {
  id: string;
  prenom: string;
  nom: string;
  role: string; // métier
  niveau: NiveauCollaborateur;
  photoUrl: string | null; // data URI en transition ; URL signée S3 plus tard
  celluleId: string | null;
  // Entrée dans le studio (AAAA-MM-JJ), saisie admin. null = non renseignée :
  // aucune ancienneté improvisée. Distincte de la création de la fiche.
  dateArrivee: string | null;
  email: string | null; // du compte lié, s'il existe
  statutCompte: StatutCompte;
};

export type Cellule = {
  id: string;
  nom: string; // nom d'usage
  code: string; // « GC-ARC-01 » (nomenclature ISO 9001, jamais réutilisé)
  processus: ProcessusCellule;
  clientele: ClienteleCellule;
  statut: StatutCellule;
  // Membre habilité à répartir les tâches aux autres (décision boss, sept.
  // 2026) — un seul par cellule, désigné par l'admin, doit être membre ;
  // pilote de la cellule dans la page Équipes.
  dispatcherId: string | null;
  collaborateurs: Collaborateur[];
};

// Équipes (maquette du boss, oct. 2026) — backend : equipe/equipes.service.ts.
export type ProcessusCellule = 'DIR' | 'ARC' | 'INT' | 'ETU';
export type ClienteleCellule = 'externes' | 'holding' | 'tous' | 'sans_objet';
export type StatutCellule = 'active' | 'a_constituer' | 'reportee';
export type EtatPosteCellule = 'occupe' | 'ouvert' | 'reporte' | 'a_recruter' | 'externe';

export type CelluleEquipe = {
  id: string;
  code: string;
  processus: ProcessusCellule;
  nom: string;
  clientele: ClienteleCellule;
  statut: StatutCellule;
  pilote: { id: string; nom: string } | null;
  pctATemps: number | null; // null = pas encore d'étape livrée
  postes: { id: string; libelle: string; etat: EtatPosteCellule; titulaire: { id: string; nom: string } | null }[];
  membres: {
    id: string;
    nom: string;
    role: string;
    niveau: NiveauCollaborateur;
    photoUrl: string | null; // data URI en transition (cf. Collaborateur.photoUrl)
    poste: string | null;
    estPilote: boolean;
    taches: number; // tâches du mois en cours
    heures: number; // heures imputées ce mois, à ce jour
    pctATemps: number | null;
  }[];
};

export type VueEquipes = {
  indicateurs: {
    cellules: { actives: number; total: number };
    salariesAAffecter: number;
    projetsSignes: { total: number; nonAffectes: number };
    etapes: { enCours: number; enRetard: number; pctATemps: number | null };
    absencesEnAttente: number;
  };
  cellules: CelluleEquipe[];
  salariesAAffecter: { id: string; nom: string; role: string; niveau: NiveauCollaborateur; dateArrivee: string | null }[];
  projets: { id: string; code: string; programme: string; client: string; cellules: { code: string; nom: string }[] }[];
  etapesEnCours: { id: string; projet: string; etape: string; libelle: string; assigne: string | null; echeance: string | null; enRetard: boolean }[];
  collaborateurs: { id: string; nom: string; cellule: string | null }[];
  prochainsCodes: Record<ProcessusCellule, string>;
};

// --- Notifications collaborateur ---
// Le back pré-rend `titre` (grammaire française côté serveur, comme le reste du
// contrat). `derivee` = alerte d'échéance calculée à la volée, non stockée,
// donc jamais « lue ».

export type NotificationType =
  | 'projet_assigne'
  | 'phase_changee'
  | 'checklist_assignee'
  | 'prolongation_demandee'
  | 'prolongation_decidee'
  // Cycle CRM (back-office) — ouvrent le dossier dans le CRM.
  | 'dossier_soumis'
  | 'dossier_renvoye'
  | 'offre_envoyee'
  | 'rappel_offre'
  | 'rappel_facture'
  | 'rappel_tache'
  | 'avenant_ts'
  | 'offre_acceptee'
  | 'offre_refusee'
  | 'contrat_signe'
  // Remise / validation des tâches (RH lot 5c) — ouvrent le projet.
  | 'tache_remise'
  | 'tache_validee'
  | 'tache_renvoyee'
  | 'mention_projet' // @mention dans un fil de projet (maquette « Projets »)
  // Phase 3 (14/10/2026) : assignation, demandes RH, registre, factures.
  | 'tache_assignee'
  | 'absence_a_decider'
  | 'absence_decidee'
  | 'remboursement_a_traiter'
  | 'remboursement_traite'
  | 'decision_assignee'
  | 'facture_emise'
  | 'facture_payee'
  // Facture directe d'un lead préparée, à valider par le CFO — ouvre la facture.
  | 'facture_a_valider'
  // Alerte dérivée (jamais stockée) : lead « Nouveau projet » encore
  // incomplet 72 h après sa création — ouvre la fiche dans le CRM.
  | 'fiche_a_completer';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  titre: string;
  projetId: string | null;
  projetCode: string | null;
  dossierCrmId: string | null;
  factureId: string | null; // facture à valider (Finances)
  date: string; // ISO 8601
  lu: boolean;
  derivee: boolean;
};

export type FluxNotifications = {
  nonLues: number; // non lues stockées + alertes dérivées actives
  elements: NotificationItem[];
};

// --- Chat multi-canaux (lot 3) ---
// Contrat renvoyé par l'API NestJS (src/chat). Le back pré-rend `nom` (nom de
// cellule / « Général » / nom de l'autre participant) et le nom d'auteur.

export type TypeCanal = 'cellule' | 'general' | 'direct';

export type CanalChat = {
  id: string;
  type: TypeCanal;
  nom: string;
  nonLus: number;
  dernierMessageLe: string | null; // ISO 8601
};

export type MessageChat = {
  id: string;
  canalId: string;
  texte: string;
  envoyeLe: string; // ISO 8601
  auteur: { id: string; nom: string };
};

export type PageMessagesChat = {
  messages: MessageChat[]; // du plus ancien au plus récent
  curseurSuivant: string | null; // à repasser pour la page précédente (plus vieille)
};

// Événements poussés par le flux SSE (réception seule ; l'envoi passe par REST).
export type EvenementChat =
  | { type: 'message'; canalId: string; message: MessageChat }
  | { type: 'non_lus'; canalId: string; nonLus: number };

export type EtatFluxChat = 'connexion' | 'ouvert' | 'reconnexion';

// Annuaire chat : personnes avec qui ouvrir un DM (membres société + admin,
// hors soi et holding_admin).
export type MembreAnnuaire = {
  utilisateurId: string;
  prenom: string;
  nom: string;
  role: string;
  cellule: string | null;
};

// --- Projets (exécution) ---
// Un projet est créé automatiquement quand un dossier CRM passe en « validé ».
// L'admin l'assigne ensuite à un ou plusieurs sous-groupes.

export type StatutProjetExec = 'a_assigner' | 'assigne' | 'en_cours' | 'livre';

// Phase macro du projet — le fil de vie, distinct du statut d'assignation.
// La séquence dépend de la catégorie (aménagement saute Permis et Études).
export type Phase = 'avant_projet' | 'permis' | 'etudes' | 'chantier' | 'livre';

export const PHASES: Record<Phase, string> = {
  avant_projet: 'Avant-projet',
  permis: 'Autorisation',
  etudes: 'Bureau d’études technique',
  chantier: 'Chantier',
  livre: 'Livré',
};

export type ProjetExecution = {
  id: string;
  code: string; // repris du dossier CRM
  nature: NatureDossier;
  categorie: Categorie;
  programme: string;
  localisation: string;
  type: TypeBien;
  client: Client;
  origineCrmId: string;
  // Plusieurs équipes possibles par projet (décision boss, sept. 2026 —
  // remplace l'ancien champ singulier celluleAssignee).
  cellules: string[];
  latitude: number | null; // pin géo posé à la main
  longitude: number | null;
  statut: StatutProjetExec;
  phase: Phase;
  creeLe: string; // ISO 8601
};

// --- Section « Images » ---
// Un seul flux d'upload, un tag `usage` par image. Lié au projet (pas à la
// phase ni au pré-bilan). `phase` = vocabulaire contrôlé, purement indicatif
// (filtre d'affichage, ne verrouille rien).
//
// Droits (à appliquer quand les comptes collaborateurs existeront) : la
// visibilité d'un projet — Images inclus — se gère au niveau du Projet
// (admin, ou collaborateur dans le sous-groupe assigné), pas section par
// section. Upload ouvert à l'équipe ; bascule `travail → portfolio` réservée
// à l'infographiste / motion designer ou l'admin. En attendant, admin only.
//
// Traçabilité : `ajoutePar` (upload) et un soft-delete horodaté
// (`supprimee` / `supprimeLe` / `supprimePar`) — l'image quitte la vue
// normale mais reste dans la Corbeille admin. Pas de table journal séparée
// tant que le besoin se limite à upload + suppression.

// --- Section « Foncier » (Unbord côté backend) ---
// Checklist à fichiers, items configurables par société (gabarit —
// UnbordGabaritService, societe_admin ou CIO). Assignation par BLOC (pas par
// item, 2026-09-25) : bloc libre (`responsable` null) → toute l'équipe du
// projet peut uploader/cocher (règle de septembre, préservée en repli) ;
// bloc assigné → seul le responsable (+ admin) agit dessus. Qui peut
// assigner suit la même règle que Permis (estAutoriseAAssigner côté
// serveur) — cf. permis/collab page pour le pattern UI de référence.
// « fait » n'est pas un champ saisi, dérivé de la présence d'au moins un
// fichier — cf. GET .../unbord.

// --- Section « Documents » ---
// Livrables non-images : PDF APS/APD versionnés, plans CAO (DWG/PLN), devis,
// plaquettes. Modèle propre (pas ImageProjet élargi). Même seam de stockage —
// data URI en transition, URL objet à terme. `type` et `phase` = filtres.

// --- Section « Permis de construire » (conception uniquement) ---
// Le workflow historique (NICAD, dépôt/instruction, journal, certificat de
// conformité) a été retiré (sept. 2026) : les 3 blocs de la checklist
// (Constitution / Dépôt urbanisme / Procédure) couvrent déjà le travail réel.
// Le statut final (validé/refusé — déclenche le rappel doux de
// avertissementChangementPhase) garde une valeur propre. « Dossier
// technique » (5 pièces) retiré de l'UI à la même restructuration — champs
// laissés dormants côté données (cf. domaine/config.ts::PIECES_DOSSIER_PERMIS).

// --- Sous-checklists opérationnelles du permis (en 3 blocs) ---
// Miroir Trello Grey Concrete : suivi granulaire indépendant des verrous durs
// du permis (nicad/dossier 5 pièces/statut) — juste un %, aucun blocage.
// Échéance + responsable vivent au niveau du BLOC (Dossier de permis / Dépôt
// urbanisme / Procédure), pas de l'item ni d'un seul responsable pour tout le
// module (décision boss, sept. 2026, cf. mémoire) : chaque bloc peut avoir
// une personne et une échéance différentes. Écriture (cocher, uploader,
// prolongation) réservée au responsable DU BLOC + admin.

// --- Section « Études » (conception uniquement) ---
// Études techniques confiées à des BET : transforment l'APD en dossier
// d'exécution, puis constitution du DCE (dossier de consultation des
// entreprises). La consultation / attribution des marchés vit dans Exécution.
// Pas de verrou dur avant Chantier — juste un avertissement (bonne pratique,
// pas blocage légal comme le permis).
//
// Restructurée sept. 2026 (décision boss) : chaque type d'étude (géotechnique,
// structure…) n'est plus une ligne figée dans un tableau unique mais son
// propre BLOC — configurable par gabarit société (comme Foncier/Unbord, mais
// avec un niveau de nesting en plus puisque les blocs eux-mêmes sont
// configurables, pas juste les items dedans). Chaque bloc porte son
// interlocuteur (ex-« bureau d'études »)+contact, sa facture (montant +
// fichier, visible admin/CIO uniquement — jamais exposée à un collaborateur),
// son statut/remise/note (repris tels quels de l'ancien modèle), et ses
// propres livrables en checklist à fichiers (statut dérivé + case à cocher
// manuelle, même modèle que Foncier).

// -- Gabarit Études (configuration société, societe_admin ou CIO) ----------

// --- Section « Exécution / chantier » (les deux catégories) ---
// Miroir Trello Grey Concrete, même motif que Permis (ChecklistPermisGroupe) —
// 8 blocs fixes, chacun avec sa propre échéance et son responsable. Remplace
// entièrement l'ancien système lots/offres/situations/réception/réserves
// (retiré sept. 2026, cf. mémoire) : pas de verrou dur, juste un % de suivi
// opérationnel, indépendant, comme le reste des sous-checklists. S'applique
// aux deux catégories avec le même gabarit (décision boss, sept. 2026).

// --- Section « Avant-projet » ---
// Restructurée sept. 2026 (décision boss) : plus de fiche programme ni de
// verrou de validation macro — juste l'affectation/agenda + la checklist
// opérationnelle « Suivi opérationnel », réduite à 2 groupes (Livrables,
// Fichiers produits) et passée au même modèle que Foncier/Unbord : statut
// dérivé des fichiers joints (plus de case « fait »/note manuelles),
// assignation PAR BLOC comme Permis/Exécution (un responsable + une échéance
// par groupe, pas par ligne). Items libres par projet — admin OU dispatcher
// d'une cellule du projet (nouveauté sept. 2026) : ajout via
// POST …/avant-projet/checklist, suppression via DELETE …/checklist/:id.

// --- Pré-bilan de faisabilité (versionné) ---
// Une version = un point de mesure figé, rattaché à une sous-étape du
// chiffrage. Le nombre de versions et leur libellé dépendent de la
// catégorie (comme la checklist) — jamais de saisie libre.

// --- Section « Facturation client » (brique « gestion ») ---
// Le pré-bilan chiffre un projet ; ce module émet des factures réelles, les
// suit et les encaisse. Cf. cadrage « Facturation client ». Module admin-only —
// pas une section du projet au sens de SECTIONS_PROJET (comme le pré-bilan).
//   · le type découle de la nature du projet (mandat_client → honoraires ;
//     promotion_interne → vente) — jamais un choix ;
//   · numéro séquentiel PAR SOCIÉTÉ attribué à l'émission, immuable ensuite —
//     une facture émise se corrige par un avoir, pas par édition ;
//   · seuls montantHt + tauxTva sont saisis ; TVA / TTC en découlent ;
//   · le statut stocké se limite au cycle admin (brouillon → emise → annulee) ;
//     partiellement_payee / payee / en_retard sont calculés à la lecture.
// GARDES MIROIR du backend domaine/gardes.ts (ventilationTva,
// statutFactureEffectif) et domaine/config.ts (JALONS_FACTURE, refFacture).

export type FactureType = 'honoraires' | 'vente';

export const TYPES_FACTURE: Record<FactureType, string> = {
  honoraires: 'Honoraires',
  vente: 'Vente',
};

// Statut stocké — piloté par l'admin.
export type StatutFacture = 'brouillon' | 'emise' | 'annulee';

// Statut effectif — calculé à la lecture (cumul des paiements + échéance).
export type StatutFactureEffectif =
  | 'brouillon'
  | 'emise'
  | 'partiellement_payee'
  | 'payee'
  | 'en_retard'
  | 'annulee';

export const STATUTS_FACTURE: Record<StatutFactureEffectif, string> = {
  brouillon: 'Brouillon',
  emise: 'Émise',
  partiellement_payee: 'Partiellement payée',
  payee: 'Payée',
  en_retard: 'En retard',
  annulee: 'Annulée',
};

export type JalonFacture = 'signature' | 'avant_projet' | 'livraison';

// Libellés des CGV Grey Concrete 2026, art. 7 — miroir du backend
// domaine/config.ts::JALONS_FACTURE. Les parts (F1 / F2 / F3) sont un réglage
// du CIO (Réglages · Règles et délais), figé sur l'offre à sa soumission.
export const JALONS_FACTURE: { cle: JalonFacture; code: 'F1' | 'F2' | 'F3'; libelle: string }[] = [
  { cle: 'signature', code: 'F1', libelle: 'Acompte à la signature du contrat' },
  { cle: 'avant_projet', code: 'F2', libelle: "Fin de l'APD" },
  { cle: 'livraison', code: 'F3', libelle: "Livraison des plans d'exécution" },
];

// Mobile money distingué (Wave / Orange Money), décision du 27/09/2026.
export type ModePaiement = 'virement' | 'cheque' | 'especes' | 'wave' | 'orange_money';

export const MODES_PAIEMENT: Record<ModePaiement, string> = {
  virement: 'Virement',
  cheque: 'Chèque',
  especes: 'Espèces',
  wave: 'Wave',
  orange_money: 'Orange Money',
};

// Taux de TVA par défaut (prestations de services, Sénégal). Ajustable par
// facture (exonération, taux réduit) — jamais figé en dur.
export const TAUX_TVA_DEFAUT = 18;

export type Paiement = {
  id: string;
  date: string; // AAAA-MM-JJ
  montant: number; // FCFA
  mode: ModePaiement | null;
  reference: string;
};

export type Facture = {
  id: string;
  numero: number | null; // null tant que brouillon
  reference: string | null; // rendu d'affichage — format provisoire (cadrage §10)
  type: FactureType;
  jalon: JalonFacture | null; // renseigné si la facture appartient à un échéancier
  libelle: string;
  statut: StatutFacture;
  statutEffectif: StatutFactureEffectif;
  montantHt: number; // FCFA
  tauxTva: number; // %
  montantTva: number; // FCFA — dérivé
  montantTtc: number; // FCFA — dérivé
  echeanceLe: string | null; // AAAA-MM-JJ
  estAvoir: boolean;
  factureOrigineId: string | null; // avoir → facture annulée
  creeLe: string; // ISO 8601
  emiseLe: string | null;
  annuleeLe: string | null;
  montantPaye: number; // cumul des paiements
  resteAPayer: number; // montantTtc - montantPaye (négatif = avoir / trop-perçu)
  joursRetard: number; // 0 si non échue ou soldée
  paiements: Paiement[];
  // Montant de l'affaire (TTC) : offre d'origine, sinon offre acceptée du
  // dossier, sinon la facture — le CEO valide au-delà du seuil de contresignature.
  affaireTtc: number;
  // Détail (étape H3) — vide pour une facture à montant unique. Si présent,
  // montantHt = somme des lignes, un seul taux de TVA pour toute la facture.
  lignes: LigneFacture[];
};

export type ResumeFacturation = {
  totalFactureTtc: number; // net émis (avoirs déduits)
  totalEncaisse: number;
  totalDu: number;
  nbEnRetard: number;
};

// Référence courte d'un projet dans la section Facturation (qui n'appelle pas
// les routes Projets, fermées aux rôles de direction).
export type ProjetRef = {
  id: string;
  code: string;
  programme: string;
  client: { id: string; nom: string };
  // CO1 / CO2 / CO3 figée à l'envoi de l'offre (null : projet sans offre) —
  // tarif des reprises majeures (TS-MAJ) d'un devis complémentaire.
  categorieConception: string | null;
};

export type ProjetFacturation = Omit<ProjetRef, 'categorieConception'> & {
  nature: NatureDossier;
  categorie: Categorie;
  localisation: string;
  type: TypeBien;
  phase: Phase;
};

export type Facturation = {
  projetId: string;
  projet: ProjetFacturation; // en-tête de la page Facturation du projet
  factures: Facture[];
  // Lignes SU / EX de l'offre acceptée — facturées au mois, à la main.
  mensualites: Mensualite[];
  // Études techniques refacturables / refacturées et règlement des bureaux.
  etudes: EtudeRefacturation[];
  resume: ResumeFacturation;
};

export type LigneFacture = {
  id: string;
  designation: string;
  montantHt: number;
  montantBase: number | null; // refacturation ET : montant HT du bureau
  blocEtudeId: string | null;
};

// Règlement d'un bureau d'études refacturé (étape H3, CGV art. 5) — le
// bureau ne se règle qu'après encaissement du client.
export type StatutReglementBureau =
  | 'non_refacture'
  | 'en_attente_encaissement'
  | 'a_regler'
  | 'regle';

export const STATUTS_REGLEMENT_BUREAU: Record<StatutReglementBureau, string> = {
  non_refacture: 'À refacturer',
  en_attente_encaissement: 'En attente du client',
  a_regler: 'Bureau à régler',
  regle: 'Bureau réglé',
};

export type EtudeRefacturation = {
  blocId: string | null; // null = facture du bureau pas encore saisie
  carteId: string | null; // carte de l'étape 05 du gabarit (null = ancienne étude)
  libelle: string;
  bureau: string;
  montantBureauHt: number | null;
  montantRefactureHt: number | null; // bureau × 1,10 (coordination)
  statutReglement: StatutReglementBureau;
  facture: { id: string; reference: string | null } | null;
  bureauRegleLe: string | null;
  refacturable: boolean;
};

export type BureauARegler = {
  blocId: string;
  libelle: string;
  bureau: string;
  montantBureauHt: number | null;
  factureReference: string | null;
  projet: { id: string; code: string; programme: string };
};

export type Mensualite = {
  ligneDevisId: string;
  libelle: string; // « SU2 — Suivi de chantier — projet intermédiaire »
  prixMensuelHt: number;
  tauxTva: number;
  moisPrevus: number;
  moisFactures: number;
  aFacturerCeMois: boolean; // en chantier, mois restants, rien ce mois-ci
};

// GARDE MIROIR du backend domaine/gardes.ts::ventilationTva
// FCFA sans décimale : TVA arrondie au franc.
export function ventilationTva(
  montantHt: number,
  tauxTva: number,
): { montantTva: number; montantTtc: number } {
  const montantTva = Math.round((montantHt * tauxTva) / 100);
  return { montantTva, montantTtc: montantHt + montantTva };
}

// GARDE MIROIR du backend domaine/gardes.ts::statutFactureEffectif
// Soldée l'emporte sur en retard ; en retard l'emporte sur partiellement payée.
export function statutFactureEffectif(
  f: {
    statut: StatutFacture;
    echeanceLe: string | null;
    montantTtc: number;
    montantPaye: number;
  },
  aujourdhui: string, // AAAA-MM-JJ
): StatutFactureEffectif {
  if (f.statut !== 'emise') return f.statut;
  if (f.montantPaye >= f.montantTtc) return 'payee';
  if (f.echeanceLe && f.echeanceLe < aujourdhui) return 'en_retard';
  if (f.montantPaye > 0) return 'partiellement_payee';
  return 'emise';
}

// MIROIR du backend domaine/config.ts::refFacture : une seule suite par
// société, attribuée à l'émission — F (AV pour un avoir) + année + numéro.
export function refFacture(f: { numero: number | null; emiseLe: string | null; estAvoir: boolean }): string | null {
  if (f.numero == null) return null;
  const annee = (f.emiseLe ? new Date(f.emiseLe) : new Date()).getFullYear();
  return `${f.estAvoir ? 'AV' : 'F'}${annee}-${String(f.numero).padStart(4, '0')}`;
}

// --- Devis (brique « gestion », 2ᵉ étage après Facturation) ---
// Miroir partiel de Facture : même numérotation séquentielle par société,
// mêmes dates agenda en String. Diffère sur trois points (cf. cadrage
// « Devis ») : de VRAIES lignes multiples à taux de TVA propre à chacune
// (montantHt/Tva/Ttc dérivés en sommant les lignes, jamais stockés en
// double) ; projetId nullable (devis « libre » possible) ; double canal de
// réponse (validation manuelle admin ET lien public sans compte).

export type StatutDevis = 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'transforme';

// Statut effectif — « expire » est calculé à la lecture (dateValidite
// dépassée sans réponse), jamais stocké. GARDE MIROIR du backend
// devis/domaine.ts::statutDevisEffectif.
export type StatutDevisEffectif = StatutDevis | 'expire';

export const STATUTS_DEVIS: Record<StatutDevisEffectif, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
  expire: 'Expiré',
  transforme: 'Converti en facture',
};

export type LigneDevis = {
  id: string;
  produitServiceId: string | null;
  designation: string;
  surfaceM2: number | null; // ligne CO : quantité = surface × planches
  planches: number | null;
  quantite: number;
  prixUnitaire: number; // FCFA
  tauxTva: number; // %
  montantHt: number; // FCFA — dérivé
  montantTva: number; // FCFA — dérivé
  montantTtc: number; // FCFA — dérivé
  ordre: number;
};

export type Devis = {
  id: string;
  numero: number | null;
  reference: string | null; // format provisoire, cf. refDevis
  statut: StatutDevis;
  statutEffectif: StatutDevisEffectif;
  objet: string;
  client: Client;
  projetId: string | null;
  // Offre d'un dossier CRM (étape F) — null pour un devis hors CRM.
  dossierCrm: { id: string; code: string; statut: StatutCrm } | null; // statut : situation du lead (« En validation CFO »)
  dateValidite: string | null; // AAAA-MM-JJ
  dateEnvoi: string | null; // ISO 8601
  dateReponse: string | null;
  relancesEnvoyees: number;
  derniereRelanceLe: string | null;
  relanceAFaire: boolean; // palier J+3 / J+6 atteint, pas encore relancé
  // Avenant (TS) envoyé, toujours pas accepté au-delà du délai des Réglages.
  alerteAvenant: { jours: number; seuil: number } | null;
  lignes: LigneDevis[];
  montantHt: number;
  montantTva: number;
  montantTtc: number;
  // Offre de lead (maquette Finances) : message d'introduction (généré tant
  // que personne ne l'a réécrit) et délais de l'échéancier par échéance.
  messageIntroduction: string;
  messageIntroductionPersonnalise: boolean;
  delaisEcheancier: Record<string, number>;
  // Détail seulement (consultation, création, modification) ; null hors offre de lead.
  echeancier?: EcheanceOffre[] | null;
  creeLe: string;
};

// Finances · Feuille de temps d'un dossier (backend : finances/feuille-temps).
export type DelaiTranche =
  | { etat: 'payee' | 'a_echoir' | 'en_retard' | 'a_facturer' | 'facturation_en_retard'; jours: number }
  | { etat: 'non_planifiee' };

export type FeuilleTemps = {
  dossier: { id: string; code: string; statut: StatutCrm; client: { id: string; nom: string }; projet: { id: string; code: string } | null };
  offre: { id: string; reference: string | null; statut: StatutDevis; montantHt: number } | null;
  dernierEvenement: string | null;
  pipe: { cle: string; libelle: string; date: string | null; ecartJours: number | null; cible: string | null; horsCible: boolean }[];
  indicateurs: {
    cycleCommercialJours: number | null;
    signatureEncaissementJours: number | null;
    heuresImputees: number | null;
    heuresPrevues: number | null;
    honorairesParHeure: number | null;
  };
  facturation: {
    cle: string;
    famille: string;
    tranche: string;
    declencheur: string;
    reference: string | null;
    montantTtc: number;
    prevue: string | null;
    facturee: string | null;
    echeance: string | null;
    payee: string | null;
    delai: DelaiTranche;
  }[];
  temps: {
    total: number;
    prevues: number | null;
    repartition: { etape: string; heures: number }[];
    taches: { id: string; etape: string; libelle: string; debut: string | null; assigne: string; heuresStandard: number | null; joursEcoules: number; heures: number }[];
  } | null;
};

// Échéance de l'échéancier d'une offre (backend : facturation-offre.ts).
export type EcheanceOffre = {
  cle: string | null; // null = facturation au mois (pas de délai)
  famille: string;
  echeance: string; // F1 / F2 / F3, Avance / Solde, Unique, « 3 mensualités »
  part: number | null; // %
  declencheur: string;
  delaiJours: number | null; // jours après la signature
  montantTtc: number;
};

// Réponse de POST …/devis/:id/envoi UNIQUEMENT — le jeton clair du lien
// public n'est jamais ré-exposé ensuite (même convention qu'un lien
// d'invitation compte). L'admin doit le copier/transmettre à cet instant.
// `emailEnvoye` : false si le client n'a pas d'email renseigné (rien tenté)
// OU si le transport a échoué — dans les deux cas, `lienPublic` reste le repli.
export type DevisEnvoye = Devis & { lienPublic: string; emailEnvoye: boolean };

// Vue CLIENT (lien public, sans compte) — GET/POST …/devis-public/:token.
// Volontairement plus pauvre que Devis : aucun id interne, aucune coordonnée
// du client (déjà les siennes), pas de référence produit du catalogue.
export type DevisPublic = {
  reference: string | null;
  statutEffectif: StatutDevisEffectif;
  peutRepondre: boolean;
  objet: string;
  societe: {
    nom: string;
    logoUrl: string | null;
    logoUrlSombre: string | null;
    couleurMarque: string | null;
    icone: string | null;
    mentionsLegales: string | null; // pied du document
    coordonnees: string | null;
  };
  clientNom: string;
  dateValidite: string | null;
  dateEnvoi: string | null;
  dateReponse: string | null;
  lignes: (Omit<LigneDevis, 'produitServiceId' | 'ordre' | 'surfaceM2' | 'planches'> & {
    detail: string | null; // « 250 m² × 2 planches » (ligne CO)
  })[];
  montantHt: number;
  montantTva: number;
  montantTtc: number;
};

// Catalogue optionnel (cf. cadrage « Devis ») — démarre vide, alimenté par
// l'admin. Piocher dedans reste une option à côté de la ligne libre, jamais
// une contrainte.
// Mode de calcul d'une ligne tirée du catalogue réel (cf. backend
// prisma/data/catalogue-grey-concrete.json).
// tarif_co_surface_planches : reprise majeure TS-MAJ (tarif CO du projet ×
// surface × planches concernées, CGV art. 8).
export type ModeCalculProduit =
  | 'quantite'
  | 'surface_planches'
  | 'forfait'
  | 'tarif_co_surface_planches';

export type ProduitService = {
  id: string;
  code: string | null; // CO1, IM2, SU3, DPC… ; null = ajout manuel de l'admin
  famille: string | null; // CO, IM, SU, EX, PC
  unite: string | null; // m2, piece, mois, forfait
  modeCalcul: ModeCalculProduit;
  prixModifiable: boolean; // false : le tarif du catalogue s'impose
  coAssocie: string | null; // SU : catégorie CO dont il découle
  designation: string;
  prixUnitaire: number | null; // nullable — certains prix varient trop pour être fixés
  tauxTva: number;
  description: string;
};

// --- Facturation centralisée (page « Facturation », liste toutes sociétés
// confondues... non, tous projets confondus) — contrairement à Facturation
// (ci-dessus) qui reste scopée à un projet. Le client d'une facture SANS
// projet (convertie depuis un devis « libre ») se résout via devisOrigineId
// côté backend — jamais dupliqué ici.
export type FactureCentrale = {
  id: string;
  numero: number | null;
  reference: string | null;
  type: FactureType;
  jalon: JalonFacture | null;
  libelle: string;
  statut: StatutFacture;
  statutEffectif: StatutFactureEffectif;
  montantHt: number;
  tauxTva: number;
  montantTva: number;
  montantTtc: number;
  echeanceLe: string | null;
  estAvoir: boolean;
  factureOrigineId: string | null;
  devisOrigineId: string | null;
  devisEcheancierId: string | null; // offre dont la facture est une tranche
  ligneDevisId: string | null; // ligne d'offre facturée au mois (SU / EX)
  creeLe: string;
  emiseLe: string | null;
  annuleeLe: string | null;
  montantPaye: number;
  resteAPayer: number;
  joursRetard: number;
  projetId: string | null;
  projet: { id: string; code: string; programme: string } | null;
  client: { id: string; nom: string } | null;
  affaireTtc: number; // montant de l'affaire (TTC) — cf. Facture
  // Tranche d'échéancier « k/N » ; null hors échéancier.
  tranche: { rang: number; total: number } | null;
  // Facture directe d'un lead (sans offre) ; null sinon.
  dossierCrm: { id: string; code: string } | null;
  paiements: Paiement[];
  lignes: LigneFacture[];
};

// Lead du CRM proposé pour une facture directe (dossiers non archivés).
export type LeadFacturable = {
  id: string;
  code: string;
  client: string;
  localisation: string;
  statut: StatutCrm;
  prochaineReference: string; // « F2026-0013 » : référence indicative de la prochaine facture émise
};

// MIROIR du backend devis/domaine.ts::refDevis
// Offre de dossier : « CODE-OFn » (maquette Finances) ; devis libre : DEV-AAAA-NNNN.
export function refDevis(d: { numero: number | null; dateEnvoi: string | null; codeDossier: string | null; rangDossier: number | null }): string | null {
  if (d.codeDossier && d.rangDossier != null) return `${d.codeDossier}-OF${d.rangDossier}`;
  if (d.numero == null) return null;
  const annee = (d.dateEnvoi ? new Date(d.dateEnvoi) : new Date()).getFullYear();
  return `DEV${annee}-${String(d.numero).padStart(4, '0')}`;
}

// MIROIR du backend devis/domaine.ts::statutDevisEffectif
export function statutDevisEffectif(
  d: { statut: StatutDevis; dateValidite: string | null },
  aujourdhui: string, // AAAA-MM-JJ
): StatutDevisEffectif {
  if (d.statut === 'envoye' && d.dateValidite && d.dateValidite < aujourdhui) return 'expire';
  return d.statut;
}

// --- Rôles & permissions ------------------------------------------------
export type NiveauPermission = 'aucun' | 'lecture' | 'ecriture' | 'validation';

export type ModulePermission = { cle: string; nom: string };

export type RoleAvecPermissions = {
  id: string;
  nom: string;
  // true = rôle transverse (societeId null, ex. CEO/CTO/CIO).
  transverse: boolean;
  // Calculé par le serveur pour l'appelant : rôles propres → admin société
  // ou CIO ; transverses → CIO seul ; rôles socles → personne.
  modifiable: boolean;
  permissions: Partial<Record<string, NiveauPermission>>;
};

export type MatriceRoles = {
  modules: ModulePermission[];
  roles: RoleAvecPermissions[];
};

// --- Contrat (étape G, cadrage validé 27/09/2026) -----------------------------
// Préparé une fois l'offre acceptée ; sa SIGNATURE (lien public : bouton ou
// signature tracée ; ou papier scanné) fait passer le dossier en Onboard.
export type ModeContrat = 'modele' | 'sur_mesure';
export type StatutContrat = 'brouillon' | 'envoye' | 'signe';
export type ModeSignatureContrat = 'bouton' | 'trace' | 'papier';
export type StatutAnnexeContrat = 'a_joindre' | 'jointe' | 'non_necessaire';

export const STATUTS_CONTRAT: Record<StatutContrat, string> = {
  brouillon: 'En préparation',
  envoye: 'Envoyé au client',
  signe: 'Signé',
};

export const MODES_SIGNATURE: Record<ModeSignatureContrat, string> = {
  bouton: 'bouton « J’accepte »',
  trace: 'signature tracée à l’écran',
  papier: 'contrat papier scanné',
};

export type AnnexeContrat = {
  id: string;
  libelle: string;
  automatique: string | null; // 'offre' : l'offre acceptée, jointe d'office
  statut: StatutAnnexeContrat;
  fichierNom: string | null;
};

export type Contrat = {
  id: string;
  mode: ModeContrat;
  statut: StatutContrat;
  contenu: string | null;
  montantOffreHt: number;
  signataire: { nom: string; fonction: string };
  document: { nom: string } | null;
  dateEnvoi: string | null;
  signeLe: string | null;
  modeSignature: ModeSignatureContrat | null;
  signeParNom: string | null;
  signatureTrace: string | null;
  scan: { nom: string } | null;
  annexes: AnnexeContrat[];
};

export type ContratDossier = {
  contrat: Contrat | null;
  preparation: {
    offreAcceptee: { id: string; reference: string | null; montantHt: number; montantTtc: number } | null;
    modePrevu: ModeContrat | null;
    seuilSurMesureHt: number | null;
    // Qui signe pour la société : le CEO au-delà du seuil de contresignature
    // (Réglages, TTC), sinon l'Architecte DPLG. nom/fonction null = non réglés.
    signataire: { qui: 'ceo' | 'dplg'; seuilTtc: number; nom: string | null; fonction: string | null } | null;
    reglagesManquants: string[];
  };
};

export type ContratPublic = {
  societe: string;
  clientNom: string;
  codeDossier: string;
  programme: string;
  mode: ModeContrat;
  contenu: string | null;
  document: { nom: string } | null;
  signataire: { nom: string; fonction: string };
  offre: { reference: string | null; montantHt: number; montantTtc: number };
  annexes: {
    id: string;
    libelle: string;
    statut: StatutAnnexeContrat;
    automatique: string | null;
    fichierNom: string | null;
  }[];
  statut: StatutContrat;
  signeLe: string | null;
  peutSigner: boolean;
};

export type ParametresContrat = {
  modele: string | null;
  signataireNom: string | null;
  signataireFonction: string | null;
  signataireCeoNom: string | null;
  signataireCeoFonction: string | null;
  seuilSurMesureHt: number | null;
  variables: { cle: string; description: string }[];
  annexes: { id: string; libelle: string; automatique: string | null }[];
};

// --- Espace groupe : comptes & rôles (sept. 2026) ------------------------------
// GET /groupe/comptes — admin du groupe uniquement. Un compte = une personne
// dans une société, avec UN rôle ; les comptes d'administration
// (societe_admin) sont listés mais pas modifiables depuis cet écran.
export type StatutCompteGroupe = 'actif' | 'en_attente' | 'desactive';

export type RoleAttribuable = {
  id: string;
  nom: string;
  transverse: boolean; // CEO/CTO/CIO : définition partagée par le groupe
};

export type CompteGroupe = {
  id: string; // utilisateurId
  prenom: string;
  nom: string;
  email: string;
  statut: StatutCompteGroupe;
  role: { id: string; nom: string };
  administration: boolean;
  salaireBrutMensuel: number | null; // FCFA ; null = non renseigné
};

export type SocieteComptes = {
  id: string;
  nom: string;
  slug: string;
  rolesAttribuables: RoleAttribuable[];
  comptes: CompteGroupe[];
  // Création d'un compte (phase 1) : dossiers RH sans compte, cellules.
  dossiersSansCompte: { id: string; prenom: string; nom: string; poste: string; emailPro: string; matricule: string }[];
  cellules: { id: string; nom: string }[];
};

export type InvitationCompte = { lien: string; emailEnvoye: boolean };

export type ComptesGroupe = { societes: SocieteComptes[] };

// --- RH · Dossiers du personnel (lot 1, sept. 2026) --------------------------
// Groupe entier (Holding, Concrete, Coded) ; module « rh » de la matrice :
// lecture CFO/CEO, écriture RH. Jamais supprimé : archivé au départ.
export type TypeContrat = 'cdi' | 'cdd' | 'stage';
export type ModePaiementSalaire = 'virement' | 'wave' | 'orange_money';
export type TypePieceDossier =
  | 'piece_identite'
  | 'cv'
  | 'diplomes'
  | 'contrat_signe'
  | 'fiche_poste'
  | 'rib_ou_attestation'
  | 'certificat_residence'
  | 'photo_identite'
  | 'carte_ipm';

export type ChampsDossierPersonnel = {
  poste: string;
  typeContrat: TypeContrat;
  dateEntree: string | null;
  dateFin: string | null;
  salaireBase: number | null; // FCFA
  prenom: string;
  nom: string;
  dateNaissance: string | null;
  lieuNaissance: string;
  nationalite: string;
  numeroPiece: string;
  telephone: string;
  emailPro: string;
  contactUrgence: string;
  modePaiement: ModePaiementSalaire;
  coordonneesPaiement: string;
  numeroIpm: string;
  missionResultat: string;
  missionLivrables: string;
  missionKpi: string;
  missionSignalAlerte: string;
};

export type DossierPersonnel = ChampsDossierPersonnel & {
  id: string;
  matricule: string;
  societeId: string;
  collaborateurId: string | null;
  utilisateurId: string | null; // compte relié directement (sans fiche d'équipe)
  // Compte qui ouvre « Mon espace » : celui de la fiche d'équipe, sinon le direct.
  compte: { id: string; libelle: string; email: string; viaFiche: boolean } | null;
  societe: { id: string; nom: string; slug: string };
  cellule: string | null;
  archiveLe: string | null;
  pieces: { type: TypePieceDossier; nom: string | null; ajouteLe: string | null }[];
  completude: { pourcentage: number; manquants: number };
  bulletins: BulletinPaie[]; // du plus récent au plus ancien
  // Changement de moyen de paiement soumis par le salarié (Mon espace), à
  // valider avant la paie ; null = rien en attente.
  paiementDemandeMode: ModePaiementSalaire | null;
  paiementDemandeCoordonnees: string | null;
  paiementDemandeLe: string | null;
};

// Bulletin de paie (lot 5b) : un par mois, déposé par la RH.
export type BulletinPaie = { mois: string; nom: string; deposeLe: string };

export type OptionsDossiers = {
  societes: { id: string; nom: string }[];
  collaborateursSansDossier: { id: string; libelle: string; societeId: string; cellule: string | null }[];
  comptesSansDossier: { id: string; libelle: string; email: string }[];
};

// --- RH · Demandes (lot 2) — hypothèses de travail, cf. backend regles-conges ---
export type TypeAbsence = 'conge_paye' | 'maladie' | 'permission_exceptionnelle' | 'autre';
export type StatutAbsence = 'attente_n1' | 'autres_dates' | 'accord_n1' | 'validee' | 'refusee' | 'retiree';
export type DecisionN1 = 'valider' | 'sous_conditions' | 'autres_dates' | 'refuser';
export type MotifRefusAbsence = 'periode_critique' | 'effectif_insuffisant' | 'solde_insuffisant' | 'autre';

export type DemandeAbsence = {
  id: string;
  type: TypeAbsence;
  dateDebut: string;
  dateFin: string;
  jours: number;
  commentaire: string;
  justificatifNom: string | null;
  aJustificatif: boolean;
  statut: StatutAbsence;
  n1Role: string | null;
  decisionN1: DecisionN1 | null;
  motifRefus: MotifRefusAbsence | null;
  commentaireRefus: string;
  datesProposeesDebut: string | null;
  datesProposeesFin: string | null;
  createdAt: string;
  salarie?: { prenom: string; nom: string; poste?: string; matricule?: string };
};

// Année civile en cours (maquette : Report · Acquis 2026 · Pris · Restant) ; disponible = restant.
export type SoldeConges = { annee: number; report: number; acquis: number; pris: number; enAttente: number; disponible: number };

export type CategorieSoins = 'pharmacie' | 'consultation' | 'analyses_imagerie' | 'hospitalisation' | 'dentaire_optique' | 'autre';
export type StatutRemboursement = 'soumise' | 'transmise' | 'remboursee' | 'rejetee';
export type DemandeRemboursement = {
  id: string;
  categorie: CategorieSoins;
  beneficiaire: 'moi' | 'conjoint' | 'enfant';
  dateSoins: string;
  montant: number;
  montantRembourse: number | null;
  statut: StatutRemboursement;
  motifRejet: string;
  createdAt: string;
  justificatifs: { id: string; nom: string }[];
  dossier?: { prenom: string; nom: string; matricule: string };
};

export type LivrableAbsence = { cle: string; source: string; projet: string; groupe: string; echeance: string };
export type PreparationDecision = {
  demande: DemandeAbsence;
  livrables: LivrableAbsence[];
  candidats: { id: string; libelle: string; cellule: string | null }[];
  alerteCellule: { absents: number; membres: number; preselection: boolean };
};

// --- RH · Intégration (lot 3) — cf. backend rh/regles-integration.ts ---
export type StatutPointIntegration = 'fait' | 'a_faire' | 'a_venir';
export type PointIntegration = {
  jalon: 30 | 60 | 90;
  datePrevue: string;
  statut: StatutPointIntegration;
  realiseLe: string | null;
  compteRendu: string | null;
};
export type IntegrationSalarie = {
  id: string;
  matricule: string;
  prenom: string;
  nom: string;
  poste: string;
  societe: string;
  typeContrat: TypeContrat;
  dateEntree: string;
  mission: { resultat: string; livrables: string; kpi: string; signalAlerte: string };
  points: PointIntegration[];
  aTraiter: number;
};

// --- RH · Temps de travail (lot 4) -------------------------------------------
// Heures calculées depuis les blocs assignés (durée standard répartie sur la
// fenêtre début → échéance), hors absences validées — jamais saisies.
export type SectionTache = 'avant_projet' | 'permis' | 'execution';
export type ManqueTache = 'duree' | 'debut' | 'echeance' | 'fenetre' | 'absence';
export type StatutFeuilleTemps = 'en_cours' | 'a_controler' | 'sans_heures' | 'controlee';
export type EtatTacheTemps = 'a_venir' | 'en_cours' | 'terminee';

export type LigneCalculTemps = {
  id: string;
  etape?: string; // étape du gabarit (« 02 · Avant-projet »)
  section?: SectionTache; // feuilles figées avant le passage au gabarit (oct. 2026)
  libelle: string;
  projetCode: string;
  projetProgramme: string;
  debut: string;
  echeance: string;
  dureeStandard: number | null;
  jours?: number; // jours ouvrés de présence comptés dans le mois (absent des feuilles figées avant le 01/10/2026)
  heures: number; // part du mois
  manque: ManqueTache | null;
};
export type FeuilleTempsCalculee = {
  mois: string; // AAAA-MM
  statut: StatutFeuilleTemps;
  heuresImputees: number;
  heuresDisponibles: number;
  joursAbsence: number;
  occupation: number | null; // %
  controleLe: string | null;
  lignes: LigneCalculTemps[];
};
export type FeuilleTempsSalarie = FeuilleTempsCalculee & {
  dossierId: string;
  matricule: string;
  prenom: string;
  nom: string;
  poste: string;
  societe: string;
  cellule: string | null;
  blocsNonPlanifies: number;
};
export type FeuillesTemps = {
  mois: string;
  periodes: { mois: string; clos: boolean; aControler: number }[];
  feuilles: FeuilleTempsSalarie[];
};
export type MonTemps = {
  mois: string;
  periodes: string[];
  feuille: FeuilleTempsCalculee;
};

// --- RH · Mon espace (lot 5) ---------------------------------------------------
// Le dossier du compte connecté, sans le salaire (réservé RH, CFO, CEO).
export type SituationFamiliale = 'celibataire' | 'marie' | 'divorce' | 'veuf';

export type ProfilMonEspace = {
  id: string;
  matricule: string;
  prenom: string;
  nom: string;
  poste: string;
  societe: string;
  cellule: string | null;
  typeContrat: TypeContrat;
  dateEntree: string | null;
  dateFin: string | null;
  dateNaissance: string | null;
  lieuNaissance: string;
  nationalite: string;
  numeroPiece: string;
  telephone: string;
  emailPro: string;
  contactUrgence: string;
  telephoneUrgence: string;
  emailPerso: string;
  situationFamiliale: SituationFamiliale | null;
  enfantsACharge: number;
  adresse: string;
  modePaiement: ModePaiementSalaire;
  coordonneesPaiement: string;
  // Changement soumis à la RH (validé avant la paie) ; null = rien en attente.
  paiementDemande: { mode: ModePaiementSalaire; coordonnees: string; le: string } | null;
  numeroIpm: string;
  mission: { resultat: string; livrables: string; kpi: string; signalAlerte: string } | null;
  documents: { type: TypePieceDossier; nom: string | null; ajouteLe: string | null }[];
  bulletins: BulletinPaie[];
  attestations: AttestationTravail[]; // la plus récente d'abord
};

// Attestation de travail sur demande : délivrée par la RH (delivreeLe non null).
export type AttestationTravail = { id: string; demandeLe: string; delivreeLe: string | null; nom: string | null };

// --- RH · Remise et validation des tâches (lot 5c) -----------------------------
export type StatutTache = 'validee' | 'remise' | 'a_reprendre' | 'en_retard' | 'en_cours' | 'a_venir' | 'a_planifier';

// Tâche du gabarit assignée (TacheProjet), depuis oct. 2026.
export type TacheMonEspace = {
  id: string;
  etape: string; // « 02 · Avant-projet »
  carte: string;
  libelle: string;
  projetId: string;
  projetCode: string;
  projetProgramme: string;
  projetClient: string;
  version: number;
  debut: string | null;
  echeance: string | null;
  dureeStandard: number | null;
  heuresImputees: number; // cumul jusqu'à aujourd'hui
  manque: ManqueTache | null;
  etat: EtatTacheTemps | null;
  statut: StatutTache;
  remisLe: string | null;
  valideLe: string | null;
  renvoiMotif: string | null; // tant que la tâche est à reprendre
};

export type StatsPerformances = {
  total: number;
  validees: number;
  enCours: number;
  enRetard: number;
  respectDelais: { aTemps: number; total: number; pct: number | null };
};

export type TacheAValider = {
  id: string;
  etape: string;
  libelle: string;
  version: number;
  projetId: string;
  projetCode: string;
  projetProgramme: string;
  responsable: string;
  debut: string | null;
  echeance: string | null;
  remisLe: string | null;
  pieces: { id: string; nom: string }[]; // fichiers de la remise à valider (vide = sans fichier joint)
};

// Mon espace · Ma cellule (lot 5d) : l'équipe et les projets qu'elle suit.
export type MaCellule = {
  nom: string;
  pilote: string | null; // chef de team (dispatcher) ; null = « Pilote à désigner »
  membres: { id: string; nom: string; role: string; niveau: NiveauCollaborateur; estChef: boolean; estMoi: boolean }[];
  projets: { id: string; code: string; programme: string; phase: Phase }[];
};

// --- Pilotage · tableau de bord Holding (maquettes du boss, oct. 2026) ----

export type EvaluationIndicateur = 'dans_objectif' | 'hors_objectif' | 'a_fixer' | 'sans_donnee';

export type IndicateurPilotage = {
  cle: string;
  titre: string;
  valeur: number | null;
  affichage: string;
  evaluation: EvaluationIndicateur;
  atteintPropose: boolean; // objectif à fixer, valeur proposée atteinte
  texteObjectif: string;
  source: string;
};

export type StatutReporting = 'a_deposer' | 'en_retard' | 'depose' | 'depose_en_retard';

export type ReportingPilotage = {
  type: 'direction' | 'rh';
  mois: string; // AAAA-MM
  periode: string; // « septembre 2026 »
  titre: string;
  emetteur: string;
  destinataire: string;
  echeance: string; // AAAA-MM-JJ
  statut: StatutReporting;
  deposeLe: string | null;
  contenu: { libelle: string; valeur: string }[] | null; // null = aucune rubrique définie
  peutDeposer: boolean;
};

export type StatutDecision = 'ouverte' | 'echeance_depassee' | 'close';

export type DecisionRegistre = {
  id: string;
  numero: string; // D-014
  date: string;
  instance: string;
  origine: 'saisie' | 'hub';
  texte: string;
  responsable: string;
  echeance: string | null;
  statut: StatutDecision;
  closeLe: string | null;
  peutCloturer: boolean;
};

// « À votre attention » (accueil du CEO, Pilotage) — backend
// pilotage/attention.service.ts. null = rubrique hors des droits du compte.
export type AttentionPilotage = {
  retards: { projetId: string; code: string; client: string; enRetard: number; prolongees: number; joursMax: number }[] | null;
  factures:
    | {
        etat: 'a_emettre' | 'impayee';
        factureId: string | null;
        projetId: string | null;
        code: string;
        client: string;
        tranche: 'F1' | 'F2' | 'F3' | null;
        reference: string | null;
        montantTtc: number | null; // à émettre : TTC ; impayée : reste dû
        joursRetard: number;
        parVous: boolean; // validation offerte à ce compte (CEO : au-delà du seuil)
      }[]
    | null;
  ts: { devisId: string; projetId: string; code: string; objet: string; jours: number; seuil: number }[] | null;
  absences: { id: string; salarie: string; type: TypeAbsence; dateDebut: string; dateFin: string; jours: number }[];
};

export type ResponsableDecision = { role: string; libelle: string } | { collaborateurId: string; libelle: string };

export type VuePilotage = {
  mois: string; // « octobre 2026 »
  tuiles: { horsObjectif: number; suivis: number; reportingsADeposer: number; decisionsOuvertes: number };
  indicateurs: IndicateurPilotage[];
  reportings: ReportingPilotage[];
  decisions: DecisionRegistre[];
  saisie: { instances: string[]; responsables: ResponsableDecision[] } | null; // null = pas de saisie
  // Chiffres clés en tête de page, selon la matrice (backend pilotage/chiffres.service.ts).
  chiffres: {
    jeu: 'finances' | 'crm' | 'rh';
    tuiles: { cle: string; valeur: number; aide: string; etat: 'risque' | 'attention' | 'succes' | 'marque' }[];
  } | null;
};
