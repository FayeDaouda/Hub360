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

export type PeriodeTableauBord = 'jour' | 'semaine' | 'mois' | 'annee';

export type TendanceKpi = 'hausse' | 'baisse' | 'stable';

export type FormatValeur = 'montant' | 'montant_compact' | 'pourcent' | 'nombre' | 'surface';

export type StatKpi = {
  cle: string;
  libelle: string;
  valeur: number;
  format: FormatValeur;
  // Delta vs période précédente — optionnel : une métrique « photo à l'instant T »
  // (sans historique fiable en base) n'en fournit pas, et n'affiche alors que
  // `detail`. Les trois vont ensemble ou aucun.
  variation?: number;
  uniteVariation?: 'pourcent' | 'points';
  tendance?: TendanceKpi;
  // Complément affiché sous la valeur (remplace « vs période précédente », ou
  // tient lieu de contexte quand il n'y a pas de delta).
  detail?: string;
};

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

export type StatutJalon = 'a_faire' | 'en_attente' | 'a_risque' | 'fait';

export type JalonApercu = {
  id: string;
  date: string; // ISO 8601
  projet: string;
  type: string;
  statut: StatutJalon;
};

// Aperçu d'un projet actif sur le tableau de bord. `categorie` +
// `promotionInterne` : les champs réels du modèle Projet (pas un « département »
// dérivé). `statut` = l'enum Prisma StatutProjetExec.
export type ProjetApercu = {
  id: string;
  nom: string;
  categorie: Categorie;
  promotionInterne: boolean; // nature === 'promotion_interne'
  client: string;
  avancement: number; // 0-100
  statut: StatutProjetExec;
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
  nom: string;
  type: TypeClient;
  // Sigle choisi par l'entreprise — obligatoire pour une personne morale,
  // segment CLIENT du code dossier (cf. lib/nomenclature.ts).
  sigle?: string;
  contact?: string; // personne référente
  email?: string;
  telephone?: string;
};

export type TypeBien =
  | 'villa'
  | 'immeuble'
  | 'lotissement'
  | 'bureaux'
  | 'commerce'
  | 'mixte';

export const TYPES_BIEN: Record<TypeBien, string> = {
  villa: 'Villa',
  immeuble: 'Immeuble',
  lotissement: 'Lotissement',
  bureaux: 'Bureaux',
  commerce: 'Commerce',
  mixte: 'Mixte',
};

// Catégorie d'un dossier / projet. Détermine les sections disponibles :
// un projet « aménagement » n'a ni permis de construire ni étude
// (voir SECTIONS_PAR_CATEGORIE plus bas).
export type Categorie = 'conception' | 'amenagement';

export const CATEGORIES: Record<Categorie, string> = {
  conception: 'Conception',
  amenagement: 'Aménagement',
};

// Libellés courts (l'en-tête de colonne / de champ porte déjà « Standing »,
// « Gamme ») pour garder le tableau CRM lisible sans scroll horizontal.
export type Standing = 'economique' | 'moyen' | 'haut' | 'grand';

export const STANDINGS: Record<Standing, string> = {
  economique: 'Économique',
  moyen: 'Moyen',
  haut: 'Haut',
  grand: 'Grand',
};

export type Gamme = 'entree' | 'milieu' | 'premium' | 'luxe';

export const GAMMES: Record<Gamme, string> = {
  entree: 'Entrée',
  milieu: 'Milieu',
  premium: 'Premium',
  luxe: 'Luxe',
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
  programme: string; // "" = fiche Programme à remplir
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
export type ModifierFichePayload = Partial<{
  categorie: Categorie;
  type: TypeBien;
  surfaceTerrain: number;
  nbPlanches: number;
  standing: Standing;
  gamme: Gamme;
  programme: string;
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
  nom: string;
  // Membre habilité à répartir les tâches aux autres (décision boss, sept.
  // 2026) — un seul par cellule, désigné par l'admin, doit être membre.
  dispatcherId: string | null;
  collaborateurs: Collaborateur[];
};

// Fiche du collaborateur connecté — `GET …/mon-profil`, résolue depuis le
// compte (jamais un :id d'URL). Alimente l'espace /collab/[slug].
export type MonProfil = Collaborateur & {
  celluleNom: string | null;
  // Dispatcher de sa cellule (décision boss, sept. 2026) — peut réassigner
  // les lignes/blocs dont l'assigné est un membre de SA cellule (même
  // périmètre que le guard estAutoriseAAssigner côté serveur). `equipeAssignable`
  // = ses coéquipiers, vide si `estDispatcher` est faux.
  estDispatcher: boolean;
  equipeAssignable: { id: string; prenom: string; nom: string }[];
};

// Un projet tel que présenté sur « Mes indicateurs » (carte active / ligne
// d'historique). Dérivé serveur — miroir de CollaborateursService.indicateurs.
export type LigneProjetIndic = {
  id: string;
  code: string;
  programme: string;
  type: TypeBien;
  phase: Phase;
  clientNom: string;
  checklistPct: number | null; // null = pas encore de checklist
};

// Indicateurs de performance — calcul de lecture serveur (aucune saisie).
// `faitAnnuel` / `projetsActifs` / `historique` alimentent la page « Mes
// indicateurs » ; les 3 premiers champs, le bandeau accueil + la fiche admin.
export type IndicateursCollaborateur = {
  projetsEnCours: number;
  projetsLivres: number;
  // « Mes tâches » (point 3, sept. 2026, décision boss) — lignes Avant-
  // projet assignées + items des blocs Permis/Exécution dont ce
  // collaborateur est responsable, crédités un par un (remplace l'ancien
  // checklistPct/avantProjetDelais calculés en moyenne de projet, pas
  // filtrés par assignation individuelle). Deux signaux délais séparés,
  // pas un score unique : `enRetard` (dérivé à la volée, pour agir tout de
  // suite) et `respectDelais` (ratio historique, pour la fiabilité dans la
  // durée) — même logique que pipeline actif / taux de conversion sur le CRM.
  mesTaches: {
    total: number;
    faites: number;
    pct: number | null; // null = aucune tâche
    enRetard: number;
    respectDelais: { aTemps: number; total: number };
  };
  // Liste détaillée et filtrable de ces mêmes tâches (point 2, sept. 2026,
  // décision boss) — une ligne par tâche Avant-projet, une ligne par BLOC
  // pour Permis/Exécution (le bloc reste l'unité de travail affichée, même
  // si `mesTaches` ci-dessus compte ses items un par un).
  taches: TacheIndividuelle[];
  projetsActifs: LigneProjetIndic[];
  historique: LigneProjetIndic[]; // projets livrés
};

export type ModuleTache = 'avant_projet' | 'permis' | 'execution';

export const MODULES_TACHE: Record<ModuleTache, string> = {
  avant_projet: 'Avant-projet',
  permis: 'Autorisation',
  execution: 'Dossier Exécutions',
};

// Chemin de la section projet correspondante — cf. app/collab/[slug]/projets/[projetId]/…
export const CHEMIN_MODULE_TACHE: Record<ModuleTache, string> = {
  avant_projet: 'avant-projet',
  permis: 'permis',
  execution: 'execution',
};

export type TacheIndividuelle = {
  id: string;
  module: ModuleTache;
  libelle: string;
  projetId: string;
  projetCode: string;
  projetProgramme: string;
  fait: boolean;
  // Nb d'items faits / total du bloc — module = avant_projet, permis ou
  // execution, tous assignés par bloc depuis sept. 2026 (même grain partout).
  faits: number | null;
  total: number | null;
  echeance: string | null; // AAAA-MM-JJ
  enRetard: boolean; // dérivé serveur : non faite ET échéance dépassée
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
  | 'offre_acceptee'
  | 'offre_refusee'
  | 'contrat_signe'
  // Remise / validation des tâches (RH lot 5c) — ouvrent le projet.
  | 'tache_remise'
  | 'tache_validee'
  | 'tache_renvoyee'
  | 'mention_projet' // @mention dans un fil de projet (maquette « Projets »)
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

export const STATUTS_PROJET_EXEC: Record<StatutProjetExec, string> = {
  a_assigner: 'À assigner',
  assigne: 'Assigné',
  en_cours: 'En cours',
  livre: 'Livré',
};

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

export const PHASES_PAR_CATEGORIE: Record<Categorie, Phase[]> = {
  conception: ['avant_projet', 'permis', 'etudes', 'chantier', 'livre'],
  amenagement: ['avant_projet', 'chantier', 'livre'],
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

// Garde de transition de phase. Les phases peuvent se chevaucher dans la
// réalité du terrain (décision boss, sept. 2026) : plus aucun verrou dur sur
// l'avant-projet non validé ou le permis non obtenu — seule la dernière phase
// de la séquence bloque l'avancement.
//
// GARDE MIROIR — le backend rejoue cette règle sur PUT …/projets/:id/phase
// (422 si transition non adjacente). Toute modification ici doit être
// répercutée côté NestJS, et réciproquement.
export function peutAvancerPhase(
  projet: Pick<ProjetExecution, 'categorie' | 'phase'>,
  _contexte: { permisObtenu: boolean },
): { ok: boolean; raison?: string } {
  const sequence = PHASES_PAR_CATEGORIE[projet.categorie];
  const i = sequence.indexOf(projet.phase);
  if (i < 0 || i >= sequence.length - 1) return { ok: false, raison: 'Dernière phase' };
  return { ok: true };
}

// Rappel doux (n'affecte jamais `peutAvancerPhase.ok`) : signale qu'on quitte
// « permis » sans permis en main. À combiner avec les autres textes de la
// prop `avertissement` du PhaseStepper — jamais un blocage. Le verrou de
// validation avant-projet a été retiré (sept. 2026, cf. schema.prisma
// backend) — plus de rappel correspondant.
export function avertissementChangementPhase(
  projet: Pick<ProjetExecution, 'phase'>,
  contexte: { permisObtenu: boolean },
): string | null {
  if (projet.phase === 'permis' && !contexte.permisObtenu) {
    return 'Le permis de construire n’est pas encore obtenu.';
  }
  return null;
}

// Les 6 sections d'un projet (dossiers internes). Ordre = ordre d'affichage
// (confirmé boss, sept. 2026 — 11 cartes au total à terme, les 5 suivantes
// restant à ajouter une fois leur contenu défini carte par carte).
export type SectionProjet =
  | 'foncier'
  | 'documents'
  | 'avant-projet'
  | 'images'
  | 'permis'
  | 'etude'
  | 'execution';

export const SECTIONS_PROJET: {
  cle: SectionProjet;
  libelle: string;
  description: string;
}[] = [
  {
    cle: 'foncier',
    libelle: 'Foncier',
    description: 'Cadastre, droit réel, relevé de l’existant sur le terrain',
  },
  {
    cle: 'documents',
    libelle: 'Documents',
    description: 'PDF APS/APD, plans CAO, devis, plaquettes',
  },
  { cle: 'avant-projet', libelle: 'Avant-projet', description: 'Cadrage, faisabilité, esquisse' },
  { cle: 'images', libelle: 'Images', description: 'Photos, rendus, références' },
  {
    cle: 'permis',
    libelle: 'Autorisation',
    description: 'Dossier PC, échanges, autorisations',
  },
  { cle: 'etude', libelle: 'Bureau d’études technique', description: 'Plans techniques, notes, DCE' },
  {
    cle: 'execution',
    libelle: 'Dossier Exécutions',
    description: 'Chantier, comptes-rendus, réserves',
  },
];

// Sections disponibles selon la catégorie : « aménagement » n'a ni permis
// de construire ni étude. Foncier s'applique aux deux — un terrain se
// documente pareil, conception ou aménagement. Foncier en premier (demande
// boss, sept. 2026) : c'est le point de départ réel d'un dossier.
export const SECTIONS_PAR_CATEGORIE: Record<Categorie, SectionProjet[]> = {
  conception: ['foncier', 'avant-projet', 'images', 'documents', 'permis', 'etude', 'execution'],
  amenagement: ['foncier', 'avant-projet', 'images', 'documents', 'execution'],
};

// Hiérarchie de couleur (sept. 2026, cf. globals.css .projet-carte--* /
// .phase-etape--* / .lien-retour--* / .module-icone--*) — identité fixe liée
// à la place dans le parcours, pas au statut. Images et Documents restent
// neutres (transverses, pas une étape). Point de vérité UNIQUE : consommé
// par les cartes de la fiche projet (admin + collab), le lien de retour de
// chaque section (admin + SectionCollabShell) et le badge d'icône de module —
// ne pas redéclarer cette table ailleurs.
export const COULEUR_SECTION: Record<SectionProjet, string> = {
  'avant-projet': 'avant-projet',
  permis: 'permis',
  images: 'images',
  documents: 'documents',
  foncier: 'foncier',
  etude: 'etude',
  execution: 'execution',
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

export type UsageImage = 'travail' | 'portfolio';

export const USAGES_IMAGE: Record<UsageImage, string> = {
  travail: 'Travail',
  portfolio: 'Portfolio',
};

// Sujet de la photo — distinct de `Phase` qui tague la temporalité du projet
// (« à quel moment » vs « quoi »). Enum fixe pour l'instant (cf. mémoire) :
// pas d'ajout/modif par l'admin tant qu'un vrai besoin ne s'est pas confirmé.
// `autre` (sept. 2026) : catch-all pour les images jointes depuis Permis/
// Avant-projet (scans administratifs, rendus 3D, mood board…) — pas des
// photos du bâtiment, aucune des 4 valeurs de base ne leur correspond.
export type TypePhotoImage = 'facade' | 'interieur' | 'chantier' | 'existant' | 'autre';

export const TYPES_PHOTO_IMAGE: Record<TypePhotoImage, string> = {
  facade: 'Façade',
  interieur: 'Intérieur',
  chantier: 'Chantier',
  existant: 'Existant',
  autre: 'Autre',
};

// Provenance d'une image jointe depuis le bouton d'une checklist plutôt que
// de cette page (Permis/Exécution/Foncier/Avant-projet) — sept. 2026. Texte
// déjà pré-rendu côté serveur (« <module> → <groupe> », ex. « Autorisation →
// Dossier de Permis ») ; `route` sert à construire le lien retour
// (`/…/projets/:id/<route>`). null si l'image vient de cette page directement.
export type ProvenanceImage = { route: string; libelle: string };

export type ImageProjet = {
  id: string;
  projetId: string;
  url: string; // data URI en mock ; vraie URL objet une fois le stockage branché
  nom: string; // nom de fichier d'origine
  usage: UsageImage; // 'travail' par défaut à l'ajout
  phase: Phase | null; // tag optionnel — filtre, ne gate rien (temporalité)
  typePhoto: TypePhotoImage | null; // tag optionnel — sujet de la photo
  provenance: ProvenanceImage | null;
  legende: string; // surtout renseigné côté portfolio
  ordre: number; // rang d'affichage dans le portfolio (drag & drop)
  ajoutePar: string; // nom résolu ; utilisateurId côté API
  ajouteLe: string; // ISO 8601
  supprimee: boolean; // soft-delete
  supprimeLe: string | null;
  supprimePar: string | null;
};

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

export type GroupeFoncierCle = 'documents' | 'releve_existant';
export type StatutItemFoncier = 'fait' | 'en_attente' | 'non_necessaire';

export type FichierItemFoncier = {
  id: string;
  nom: string;
  url: string;
  estImage: boolean;
  ajouteLe: string;
};

export type ItemFoncier = {
  id: string;
  libelle: string;
  statut: StatutItemFoncier;
  fichiers: FichierItemFoncier[];
};

export type GroupeFoncier = {
  groupe: GroupeFoncierCle;
  libelle: string;
  description: string;
  items: ItemFoncier[];
  responsable: { id: string; prenom: string; nom: string } | null;
};

export type Foncier = {
  projetId: string;
  groupes: GroupeFoncier[];
};

// Gabarit société (configuration — societe_admin ou CIO, hors fiche projet).
export type LigneGabaritFoncier = {
  id: string;
  societeId: string;
  groupe: GroupeFoncierCle;
  libelle: string;
  ordre: number;
};

// Miroir de GROUPES_UNBORD (backend, domaine/config.ts) — les 2 blocs sont
// fixes, pas configurables (seuls les items dedans le sont).
export const GROUPES_FONCIER: { cle: GroupeFoncierCle; libelle: string }[] = [
  { cle: 'documents', libelle: 'Documents' },
  { cle: 'releve_existant', libelle: "Relevé de l'existant" },
];

// --- Section « Documents » ---
// Livrables non-images : PDF APS/APD versionnés, plans CAO (DWG/PLN), devis,
// plaquettes. Modèle propre (pas ImageProjet élargi). Même seam de stockage —
// data URI en transition, URL objet à terme. `type` et `phase` = filtres.

export type TypeFichier =
  | 'plan'
  | 'rendu_source'
  | 'devis'
  | 'plaquette'
  | 'pdf_dossier'
  | 'autre';

export const TYPES_FICHIER: Record<TypeFichier, string> = {
  plan: 'Plan CAO',
  rendu_source: 'Source de rendu',
  devis: 'Devis',
  plaquette: 'Plaquette',
  pdf_dossier: 'Dossier PDF',
  autre: 'Autre',
};

export type FichierProjet = {
  id: string;
  projetId: string;
  url: string; // data URI en transition ; URL objet une fois le stockage branché
  nom: string;
  typeMime: string;
  taille: number; // octets
  type: TypeFichier;
  phase: Phase | null;
  // Posé quand l'upload part d'une ligne de la checklist Permis plutôt que
  // de cette page — même fichier, juste un repère de provenance.
  ligneChecklistPermisId: string | null;
  note: string;
  ajoutePar: string;
  ajouteLe: string; // ISO 8601
  supprimee: boolean;
  supprimeLe: string | null;
  supprimePar: string | null;
};

// --- Section « Permis de construire » (conception uniquement) ---
// Le workflow historique (NICAD, dépôt/instruction, journal, certificat de
// conformité) a été retiré (sept. 2026) : les 3 blocs de la checklist
// (Constitution / Dépôt urbanisme / Procédure) couvrent déjà le travail réel.
// Le statut final (validé/refusé — déclenche le rappel doux de
// avertissementChangementPhase) garde une valeur propre. « Dossier
// technique » (5 pièces) retiré de l'UI à la même restructuration — champs
// laissés dormants côté données (cf. domaine/config.ts::PIECES_DOSSIER_PERMIS).

export type PieceDossierPermis =
  | 'titre_propriete'
  | 'plan_cadastral_vise'
  | 'plans_apd'
  | 'devis'
  | 'timbre_fiscal';

export const PIECES_DOSSIER_PERMIS: { cle: PieceDossierPermis; libelle: string }[] = [
  { cle: 'titre_propriete', libelle: 'Titre de propriété' },
  { cle: 'plan_cadastral_vise', libelle: 'Plan cadastral visé (NICAD)' },
  { cle: 'plans_apd', libelle: 'Plans architecturaux (APD)' },
  { cle: 'devis', libelle: 'Devis descriptif' },
  { cle: 'timbre_fiscal', libelle: 'Timbre fiscal (10 000 FCFA) + taxe mairie' },
];

// L'enum garde instruction/observations pour ne pas invalider de vieilles
// valeurs déjà en base, mais plus aucun chemin n'écrit dessus — seuls les 4
// états ci-dessous restent proposés (cf. STATUTS_PERMIS_CHOIX). `depose`
// réintroduit sept. 2026 (restructuration Permis) : « Déposé » devient un
// choix à part entière plutôt qu'une valeur dormante sous l'étiquette
// « En cours » — zéro migration de données, la valeur existait déjà.
export type StatutPermis =
  | 'a_deposer'
  | 'depose'
  | 'instruction'
  | 'observations'
  | 'obtenu'
  | 'refuse';

export const STATUTS_PERMIS: Record<StatutPermis, string> = {
  a_deposer: 'En cours',
  depose: 'Déposé',
  instruction: 'En cours',
  observations: 'En cours',
  obtenu: 'Validé',
  refuse: 'Refusé',
};

// Les 4 choix proposés dans le sélecteur, dans l'ordre logique du flux
// (cf. STATUTS_PERMIS ci-dessus pour l'étiquette d'affichage, y compris des
// vieilles valeurs intermédiaires dormantes).
export const STATUTS_PERMIS_CHOIX: StatutPermis[] = ['a_deposer', 'depose', 'obtenu', 'refuse'];

export type Permis = {
  projetId: string;
  dossier: Record<PieceDossierPermis, boolean>;
  statut: StatutPermis;
  dateObtention: string | null;
  dateRefus: string | null;
  // Équipe(s) à proposer dans le sélecteur de responsable de chaque bloc
  // (front : GET …/collaborateurs?cellule=), comme AvantProjet. Plusieurs
  // possibles depuis sept. 2026 (décision boss).
  celluleIds: string[];
  checklists: ChecklistPermisGroupe[];
};

// --- Sous-checklists opérationnelles du permis (en 3 blocs) ---
// Miroir Trello Grey Concrete : suivi granulaire indépendant des verrous durs
// du permis (nicad/dossier 5 pièces/statut) — juste un %, aucun blocage.
// Échéance + responsable vivent au niveau du BLOC (Dossier de permis / Dépôt
// urbanisme / Procédure), pas de l'item ni d'un seul responsable pour tout le
// module (décision boss, sept. 2026, cf. mémoire) : chaque bloc peut avoir
// une personne et une échéance différentes. Écriture (cocher, uploader,
// prolongation) réservée au responsable DU BLOC + admin.

export type GroupeChecklistPermis = 'dossier_permis' | 'depot_urbanisme' | 'procedure';

// Image ou document rattaché à un item précis — même objet que dans
// Images/Documents (ImageProjet/FichierProjet), juste un repère de
// provenance ; pas de copie (cf. PermisService.joindreImages/joindreFichiers).
export type FichierLigneChecklistPermis = {
  id: string;
  nom: string;
  url: string;
  estImage: boolean;
  ajouteLe: string; // ISO 8601
};

export type ItemChecklistPermis = {
  id: string;
  libelle: string;
  fait: boolean;
  // Item désactivé (« non nécessaire », sept. 2026) — mutuellement exclusif
  // avec fait (cf. lib/permis.ts::majLigneChecklistPermis).
  nonRequise: boolean;
  note: string;
  faitPar: { id: string; nom: string } | null;
  faitLe: string | null; // ISO 8601
  fichiers: FichierLigneChecklistPermis[];
};

export type ChecklistPermisGroupe = {
  groupe: GroupeChecklistPermis;
  libelle: string;
  description: string;
  // Un seul responsable par bloc, une seule échéance par bloc — null =
  // personne désigné / pas d'échéance fixée (admin seul peut alors agir).
  debut: string | null; // AAAA-MM-JJ — fenêtre début → échéance (RH · Temps)
  echeance: string | null; // AAAA-MM-JJ
  responsable: { id: string; nom: string } | null;
  prolongationDemandeeLe: string | null; // ISO 8601 — non nul = en attente
  prolongationEcheance: string | null; // AAAA-MM-JJ proposée
  prolongationMotif: string | null;
  items: ItemChecklistPermis[];
  // Point d'upload partagé du bloc (Dépôt urbanisme / Procédure, sept.
  // 2026) — pas rattaché à un item précis. Toujours vide pour Constitution,
  // dont l'unique item reçoit déjà ses fichiers directement.
  fichiersBloc: FichierLigneChecklistPermis[];
};

// Toutes les pièces du dossier cochées — garde avant de marquer « déposé ».
export function dossierPermisComplet(dossier: Record<PieceDossierPermis, boolean>): boolean {
  return PIECES_DOSSIER_PERMIS.every((p) => dossier[p.cle]);
}

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

export type StatutEtude = 'a_lancer' | 'en_cours' | 'remise' | 'validee' | 'non_requise';

export const STATUTS_ETUDE: Record<StatutEtude, string> = {
  a_lancer: 'À lancer',
  en_cours: 'En cours',
  remise: 'Remise',
  validee: 'Validée',
  non_requise: 'Non requise',
};

export type StatutItemEtude = 'fait' | 'en_attente' | 'non_necessaire';

export type FichierItemEtude = {
  id: string;
  nom: string;
  url: string;
  estImage: boolean;
  ajouteLe: string; // ISO 8601
};

export type ItemEtude = {
  id: string;
  libelle: string;
  statut: StatutItemEtude;
  fichiers: FichierItemEtude[];
};

// null = redacted (appelant non admin/CIO) ; jamais renvoyé à un
// collaborateur, même en lecture seule (cf. cadrage).
export type FactureEtude = {
  montant: number | null;
  fichierNom: string | null;
  fichierCle: string | null;
};

export type BlocEtude = {
  id: string;
  libelle: string;
  interlocuteur: string; // ex-« bet » (nom du bureau d'études)
  contactInterlocuteur: string;
  statut: StatutEtude;
  dateRemisePrevue: string | null; // AAAA-MM-JJ
  dateRemiseReelle: string | null;
  note: string;
  facture: FactureEtude | null;
  items: ItemEtude[];
};

export type Etudes = {
  projetId: string;
  blocs: BlocEtude[];
  dceConstitue: boolean;
  dceLe: string | null;
};

// DCE mobilisable quand chaque bloc est validé OU non requis (pas
// « remise » — on ne met pas un rendu non vérifié dans l'appel d'offres).
export function etudesCompletes(e: Etudes): boolean {
  return e.blocs.every((b) => b.statut === 'validee' || b.statut === 'non_requise');
}

// Blocs ni validés ni non-requis — pour l'avertissement du stepper.
export function etudesEnAttente(e: Etudes): number {
  return e.blocs.filter((b) => b.statut !== 'validee' && b.statut !== 'non_requise').length;
}

// -- Gabarit Études (configuration société, societe_admin ou CIO) ----------

export type LigneGabaritEtude = {
  id: string;
  blocEtudeGabaritId: string;
  libelle: string;
  ordre: number;
};

export type BlocGabaritEtude = {
  id: string;
  libelle: string;
  ordre: number;
  items: LigneGabaritEtude[];
};

// --- Section « Exécution / chantier » (les deux catégories) ---
// Miroir Trello Grey Concrete, même motif que Permis (ChecklistPermisGroupe) —
// 8 blocs fixes, chacun avec sa propre échéance et son responsable. Remplace
// entièrement l'ancien système lots/offres/situations/réception/réserves
// (retiré sept. 2026, cf. mémoire) : pas de verrou dur, juste un % de suivi
// opérationnel, indépendant, comme le reste des sous-checklists. S'applique
// aux deux catégories avec le même gabarit (décision boss, sept. 2026).

export type GroupeChecklistExecution =
  | 'etudes'
  | 'plans'
  | 'viabilite'
  | 'locaux_technique'
  | 'amenagements'
  | 'menuiserie'
  | 'details'
  | 'cctp';

// Image ou document rattaché à un item précis — même objet que dans
// Images/Documents (ImageProjet/FichierProjet), juste un repère de
// provenance ; pas de copie (cf. ExecutionService.joindreImages/joindreFichiers).
export type FichierLigneChecklistExecution = {
  id: string;
  nom: string;
  url: string;
  estImage: boolean;
  ajouteLe: string; // ISO 8601
};

export type ItemChecklistExecution = {
  id: string;
  libelle: string;
  fait: boolean;
  // Item désactivé (« non nécessaire », sept. 2026) — mutuellement exclusif
  // avec fait, même modèle que ItemChecklistPermis.
  nonRequise: boolean;
  note: string;
  faitPar: { id: string; nom: string } | null;
  faitLe: string | null; // ISO 8601
  fichiers: FichierLigneChecklistExecution[];
};

export type ChecklistExecutionGroupe = {
  groupe: GroupeChecklistExecution;
  libelle: string;
  description: string;
  // Un seul responsable par bloc, une seule échéance par bloc — null =
  // personne désigné / pas d'échéance fixée (admin seul peut alors agir).
  debut: string | null; // AAAA-MM-JJ — fenêtre début → échéance (RH · Temps)
  echeance: string | null; // AAAA-MM-JJ
  responsable: { id: string; nom: string } | null;
  prolongationDemandeeLe: string | null; // ISO 8601 — non nul = en attente
  prolongationEcheance: string | null; // AAAA-MM-JJ proposée
  prolongationMotif: string | null;
  items: ItemChecklistExecution[];
};

export type Execution = {
  projetId: string;
  // Équipe(s) à proposer dans le sélecteur de responsable de chaque bloc
  // (front : GET …/collaborateurs?cellule=), comme Permis. Plusieurs
  // possibles depuis sept. 2026 (décision boss).
  celluleIds: string[];
  checklists: ChecklistExecutionGroupe[];
};

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

export type GroupeChecklistAvp = 'taches_complementaires' | 'fichiers_produits';

export type StatutItemChecklistAvp = 'fait' | 'en_attente' | 'non_necessaire';

export type FichierItemChecklistAvp = {
  id: string;
  nom: string;
  url: string;
  estImage: boolean;
  ajouteLe: string;
};

export type ItemChecklistAvp = {
  id: string;
  libelle: string;
  statut: StatutItemChecklistAvp;
  fichiers: FichierItemChecklistAvp[];
};

export type ChecklistAvpGroupe = {
  groupe: GroupeChecklistAvp;
  libelle: string;
  description: string;
  // Assignation par bloc (même motif que ChecklistPermisGroupe) — vide =
  // toute l'équipe du projet peut agir (règle de septembre, en repli).
  debut: string | null; // AAAA-MM-JJ — fenêtre début → échéance (RH · Temps)
  echeance: string | null; // AAAA-MM-JJ
  responsable: { id: string; nom: string } | null;
  prolongationDemandeeLe: string | null; // ISO 8601 — non nul = en attente
  prolongationEcheance: string | null; // AAAA-MM-JJ proposée
  prolongationMotif: string | null;
  items: ItemChecklistAvp[];
};

// MIROIR de backend domaine/gardes.ts::avancementChecklistAvp. Checklists
// Permis/Exécution (case « fait » manuelle) — purement indicatif, aucun
// verrou. Un item « non requis » (Permis uniquement, sept. 2026) compte comme
// réglé, même convention que avancementChecklistFichiers ci-dessous. NE PAS
// réutiliser pour Avant-projet (cf. avancementChecklistFichiers — items à
// statut dérivé des fichiers, plus de case « fait »).
export function avancementChecklistAvp(
  items: { fait: boolean; nonRequise?: boolean }[],
): { faits: number; total: number; pct: number; complete: boolean } {
  const faits = items.filter((i) => i.fait || i.nonRequise).length;
  const total = items.length;
  return {
    faits,
    total,
    pct: total ? Math.round((faits / total) * 100) : 0,
    complete: total > 0 && faits === total,
  };
}

// MIROIR de backend domaine/gardes.ts::avancementChecklistFichiers. Purement
// indicatif (carte de section), aucun verrou — un item « non nécessaire »
// compte comme réglé, au même titre qu'un item avec au moins un fichier joint.
export function avancementChecklistFichiers(
  items: { statut: StatutItemChecklistAvp }[],
): { faits: number; total: number; pct: number; complete: boolean } {
  const faits = items.filter((i) => i.statut !== 'en_attente').length;
  const total = items.length;
  return {
    faits,
    total,
    pct: total ? Math.round((faits / total) * 100) : 0,
    complete: total > 0 && faits === total,
  };
}

// Tous les items à plat — pour un compteur global sur la carte de section.
export function itemsChecklistAvp(groupes: ChecklistAvpGroupe[]): ItemChecklistAvp[] {
  return groupes.flatMap((g) => g.items);
}

export type AvantProjet = {
  projetId: string;
  // Affectation & agenda (miroir carte Trello) — FK Collaborateur résolue { id, nom }
  dessinateur: { id: string; nom: string } | null;
  responsable3d: { id: string; nom: string } | null;
  dateDebut: string | null; // AAAA-MM-JJ
  dateFin: string | null;
  // Équipe(s) du projet — sert à limiter le sélecteur d'assignation de
  // chaque bloc, cf. ChecklistAvpGroupe. Plusieurs possibles depuis sept.
  // 2026 (décision boss).
  celluleIds: string[];
  // Suivi opérationnel (sous-checklists Trello) — indicatif, ne gate rien
  checklists: ChecklistAvpGroupe[];
};

// Charge utile du PATCH avant-projet : affectation + agenda (merge partiel).
// `dessinateur`/`responsable3d` s'envoient par id (FK Collaborateur).
export type PatchAvantProjet = Partial<{
  dessinateurId: string | null;
  responsable3dId: string | null;
  dateDebut: string | null;
  dateFin: string | null;
}>;

// --- Pré-bilan de faisabilité (versionné) ---
// Une version = un point de mesure figé, rattaché à une sous-étape du
// chiffrage. Le nombre de versions et leur libellé dépendent de la
// catégorie (comme la checklist) — jamais de saisie libre.

export type EtapePreBilan = 'esq' | 'aps' | 'apd' | 'estimation' | 'definitif';

export const ETAPES_PRE_BILAN: Record<
  Categorie,
  { cle: EtapePreBilan; libelle: string }[]
> = {
  conception: [
    { cle: 'esq', libelle: 'ESQ' },
    { cle: 'aps', libelle: 'APS' },
    { cle: 'apd', libelle: 'APD' },
  ],
  amenagement: [
    { cle: 'estimation', libelle: 'Estimation initiale' },
    { cle: 'definitif', libelle: 'Chiffrage définitif' },
  ],
};

export type LignePreBilan =
  | 'charges_foncieres'
  | 'travaux'
  | 'fournitures_mobilier'
  | 'travaux_amenagement'
  | 'honoraires'
  | 'frais_divers'
  | 'aleas';

export const LIGNES_PRE_BILAN: Record<
  Categorie,
  { cle: LignePreBilan; libelle: string }[]
> = {
  conception: [
    { cle: 'charges_foncieres', libelle: 'Charges foncières' },
    { cle: 'travaux', libelle: 'Travaux' },
    { cle: 'honoraires', libelle: 'Honoraires' },
    { cle: 'frais_divers', libelle: 'Frais divers' },
    { cle: 'aleas', libelle: 'Aléas' },
  ],
  amenagement: [
    { cle: 'fournitures_mobilier', libelle: 'Fournitures & mobilier' },
    { cle: 'travaux_amenagement', libelle: "Travaux d'aménagement" },
    { cle: 'honoraires', libelle: 'Honoraires' },
    { cle: 'frais_divers', libelle: 'Frais divers' },
    { cle: 'aleas', libelle: 'Aléas' },
  ],
};

export type VersionPreBilan = {
  etape: EtapePreBilan;
  couts: Partial<Record<LignePreBilan, number>>; // montants FCFA saisis
  prixVenteEstime: number | null; // uniquement si nature = promotion_interne
  creeeLe: string; // ISO 8601
  figeeLe: string | null; // se fige à la création de la version suivante
};

export type PreBilan = {
  projetId: string;
  versions: VersionPreBilan[]; // dans l'ordre de ETAPES_PRE_BILAN[categorie]
};

// Complétude *structurelle* du pré-bilan : toutes les versions attendues
// existent et la dernière a un total non nul. C'est la condition qui rend la
// case « Budget validé / Pré-bilan validé » cochable — le jugement métier
// (marge acceptable) reste à l'humain.
//
// GARDE MIROIR — le backend recalcule cette complétude à la validation de
// l'avant-projet (POST …/avant-projet/validation, 409 sinon), jamais depuis
// le body. À garder synchronisée avec l'équivalent NestJS.
export function preBilanComplet(pb: PreBilan | null, categorie: Categorie): boolean {
  if (!pb) return false;
  const attendu = ETAPES_PRE_BILAN[categorie].length;
  if (pb.versions.length < attendu) return false;
  const derniere = pb.versions[pb.versions.length - 1];
  const total = Object.values(derniere.couts).reduce<number>((s, n) => s + (n ?? 0), 0);
  return total > 0;
}

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
  // Détail (étape H3) — vide pour une facture à montant unique. Si présent,
  // montantHt = somme des lignes, un seul taux de TVA pour toute la facture.
  lignes: LigneFacture[];
};

export type ResumeFacturation = {
  totalFactureTtc: number; // net émis (avoirs déduits)
  totalEncaisse: number;
  totalDu: number;
  nbEnRetard: number;
  suggestionVenteHt: number | null; // prix de vente de la dernière version pré-bilan figée
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
  blocId: string;
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

// MIROIR du backend domaine/config.ts::refFacture
// Format PROVISOIRE — le format légal et les mentions obligatoires restent à
// caler sur un modèle de facture réel Grey Concrete (cadrage §10). Le numéro
// séquentiel fait foi ; ceci n'est qu'un rendu.
export function refFacture(
  numero: number | null,
  emiseLe: string | null,
  estAvoir: boolean,
): string | null {
  if (numero == null) return null;
  const annee = (emiseLe ? new Date(emiseLe) : new Date()).getFullYear();
  return `${estAvoir ? 'AV' : 'F'}${annee}-${String(numero).padStart(4, '0')}`;
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
  dossierCrm: { id: string; code: string } | null;
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
  creeLe: string;
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
  creeLe: string;
  emiseLe: string | null;
  annuleeLe: string | null;
  montantPaye: number;
  resteAPayer: number;
  joursRetard: number;
  projetId: string | null;
  projet: { id: string; code: string; programme: string } | null;
  client: { id: string; nom: string } | null;
  lignes: LigneFacture[];
};

// MIROIR du backend devis/domaine.ts::refDevis
export function refDevis(numero: number | null, dateEnvoi: string | null): string | null {
  if (numero == null) return null;
  const annee = (dateEnvoi ? new Date(dateEnvoi) : new Date()).getFullYear();
  return `DEV${annee}-${String(numero).padStart(4, '0')}`;
}

// MIROIR du backend devis/domaine.ts::statutDevisEffectif
export function statutDevisEffectif(
  d: { statut: StatutDevis; dateValidite: string | null },
  aujourdhui: string, // AAAA-MM-JJ
): StatutDevisEffectif {
  if (d.statut === 'envoye' && d.dateValidite && d.dateValidite < aujourdhui) return 'expire';
  return d.statut;
}

export type AvancementProjets = {
  pourcentage: number;
  // Delta optionnel (cf. StatKpi) : absent quand la valeur est une photo à
  // l'instant T ; le composant affiche alors un `sousTexte` de contexte.
  variation?: number;
  tendance?: TendanceKpi;
};

export type TableauBordSociete = {
  periode: PeriodeTableauBord;
  libellePeriode: string;
  kpis: StatKpi[];
  projetsSignesParPeriode: Histogramme;
  avancementMoyen: AvancementProjets;
  jalons: JalonApercu[];
  projets: ProjetApercu[];
};

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
};

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
  section: SectionTache;
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
export type DureesStandardSection = {
  section: SectionTache;
  libelle: string;
  groupes: { groupe: string; libelle: string; heures: number | null }[];
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

export type TacheMonEspace = {
  id: string;
  section: SectionTache;
  groupe: string;
  libelle: string;
  projetId: string;
  projetCode: string;
  projetProgramme: string;
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
  section: SectionTache;
  groupe: string;
  libelle: string;
  projetId: string;
  projetCode: string;
  projetProgramme: string;
  responsable: string;
  debut: string | null;
  echeance: string | null;
  remisLe: string;
};

// Mon espace · Ma cellule (lot 5d) : l'équipe et les projets qu'elle suit.
export type MaCellule = {
  nom: string;
  pilote: string | null; // chef de team (dispatcher) ; null = « Pilote à désigner »
  membres: { id: string; nom: string; role: string; niveau: NiveauCollaborateur; estChef: boolean; estMoi: boolean }[];
  projets: { id: string; code: string; programme: string; phase: Phase }[];
};
