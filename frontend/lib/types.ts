export type Societe = {
  id: string;
  nom: string;
  slug: string;
  logoUrl: string | null;
  logoUrlSombre: string | null;
  couleurMarque: string | null;
  icone: string | null;
  secteur: string | null;
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

// Statut d'un dossier dans le pipeline CRM. La machine à états est la même
// pour les deux natures (3 étapes + 1 sortie) ; seuls les libellés changent.
// Passer à « valide » crée automatiquement un projet (voir lib/projets.ts).
export type StatutCrm = 'nouveau' | 'devis_contrat' | 'valide' | 'annule';

export const STATUTS_CRM: Record<NatureDossier, Record<StatutCrm, string>> = {
  mandat_client: {
    nouveau: 'Nouveau projet',
    devis_contrat: 'Devis / contrat',
    valide: 'Validé',
    annule: 'Annulé',
  },
  promotion_interne: {
    nouveau: 'Repéré',
    devis_contrat: 'Étudié',
    valide: 'GO direction',
    annule: 'Abandonné',
  },
};

export const STATUTS_ORDRE: StatutCrm[] = ['nouveau', 'devis_contrat', 'valide', 'annule'];

// Une ligne du CRM = un projet / dossier immobilier.
export type Projet = {
  id: string;
  code: string; // code projet — ex : PRJ-2026-014
  nature: NatureDossier;
  categorie: Categorie;
  localisation: string;
  type: TypeBien;
  nbPlanches: number; // nombre de planches
  surfaceTerrain: number; // m²
  client: Client;
  standing: Standing;
  gamme: Gamme;
  programme: string;
  statut: StatutCrm;
  creeLe: string; // ISO 8601
};

// Charge utile du formulaire « Nouveau projet ». `client` = soit l'id d'un
// client existant, soit les champs d'un nouveau client à créer au passage.
// `code` est généré côté service, pas saisi.
export type NouveauProjetPayload = {
  nature: NatureDossier;
  categorie: Categorie;
  localisation: string;
  type: TypeBien;
  nbPlanches: number;
  surfaceTerrain: number;
  client: { id: string } | { nouveau: Omit<Client, 'id'> };
  standing: Standing;
  gamme: Gamme;
  programme: string;
  statut: StatutCrm;
  // Vide → code généré (XX_YY.ZZ, + V2/V3 si doublon). Renseigné → utilisé tel
  // quel (409 si déjà pris). Cf. lib/nomenclature.ts.
  code?: string;
};

// --- Équipe : 6 cellules cross-fonctionnelles (Archi 1-4, Intérieur, Études) ---
// Une cellule prend un projet de bout en bout — « 1 projet = 1 cellule ».
// L'admin y a un CRUD complet (page Équipe). Un collaborateur peut être sans
// cellule (celluleId null) tout en restant rattaché à sa société.

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
  collaborateurs: Collaborateur[];
};

// Fiche du collaborateur connecté — `GET …/mon-profil`, résolue depuis le
// compte (jamais un :id d'URL). Alimente l'espace /collab/[slug].
export type MonProfil = Collaborateur & {
  celluleNom: string | null;
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
  apDateFin: string | null; // AAAA-MM-JJ — échéance de l'avant-projet
  apValideLe: string | null; // ISO 8601 — validation de l'avant-projet
};

// Indicateurs de performance — calcul de lecture serveur (aucune saisie).
// `faitAnnuel` / `projetsActifs` / `historique` alimentent la page « Mes
// indicateurs » ; les 4 premiers champs, le bandeau accueil + la fiche admin.
export type IndicateursCollaborateur = {
  projetsEnCours: number;
  projetsLivres: number;
  avantProjetDelais: { aTemps: number; total: number };
  checklistPct: number | null;
  // Fait brut de l'année civile en cours — toujours présent (0 / 0 si rien),
  // sans notion de série. « X avant-projets datés cette année, Y dans les délais ».
  faitAnnuel: { annee: number; datesCetteAnnee: number; dansLesDelais: number };
  projetsActifs: LigneProjetIndic[];
  historique: LigneProjetIndic[]; // projets livrés
};

// --- Notifications collaborateur ---
// Le back pré-rend `titre` (grammaire française côté serveur, comme le reste du
// contrat). `derivee` = alerte d'échéance calculée à la volée, non stockée,
// donc jamais « lue ».

export type NotificationType =
  | 'projet_assigne'
  | 'phase_changee'
  | 'echeance_avant_projet';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  titre: string;
  projetId: string | null;
  projetCode: string | null;
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
  permis: 'Permis',
  etudes: 'Études',
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
  celluleAssignee: string | null; // une seule cellule par projet
  latitude: number | null; // pin géo posé à la main
  longitude: number | null;
  statut: StatutProjetExec;
  phase: Phase;
  creeLe: string; // ISO 8601
};

// Garde de transition de phase. Seul verrou dur pour l'instant : on ne quitte
// « avant_projet » que s'il est validé. Les autres transitions sont libres
// vers l'avant — leur garde viendra avec la section qui produit la preuve
// (permis obtenu, marché signé, réception faite).
//
// GARDE MIROIR — le backend rejoue cette règle sur PUT …/projets/:id/phase
// (422 non-adjacent, 409 verrou avant-projet). Toute modification ici doit
// être répercutée côté NestJS, et réciproquement.
export function peutAvancerPhase(
  projet: Pick<ProjetExecution, 'categorie' | 'phase'>,
  contexte: { avantProjetValide: boolean; permisObtenu: boolean },
): { ok: boolean; raison?: string } {
  const sequence = PHASES_PAR_CATEGORIE[projet.categorie];
  const i = sequence.indexOf(projet.phase);
  if (i < 0 || i >= sequence.length - 1) return { ok: false, raison: 'Dernière phase' };
  if (projet.phase === 'avant_projet' && !contexte.avantProjetValide) {
    return { ok: false, raison: "L'avant-projet doit être validé d'abord." };
  }
  // Deuxième verrou dur : on ne quitte « permis » que le permis en main.
  if (projet.phase === 'permis' && !contexte.permisObtenu) {
    return { ok: false, raison: 'Le permis de construire doit être obtenu.' };
  }
  return { ok: true };
}

// Les 5 sections d'un projet (dossiers internes). Ordre = ordre d'affichage.
export type SectionProjet =
  | 'avant-projet'
  | 'images'
  | 'documents'
  | 'permis'
  | 'etude'
  | 'execution';

export const SECTIONS_PROJET: {
  cle: SectionProjet;
  libelle: string;
  description: string;
}[] = [
  { cle: 'avant-projet', libelle: 'Avant-projet', description: 'Cadrage, faisabilité, esquisse' },
  { cle: 'images', libelle: 'Images', description: 'Photos, rendus, références' },
  {
    cle: 'documents',
    libelle: 'Documents',
    description: 'PDF APS/APD, plans CAO, devis, plaquettes',
  },
  {
    cle: 'permis',
    libelle: 'Permis de construire',
    description: 'Dossier PC, échanges, autorisations',
  },
  { cle: 'etude', libelle: 'Étude', description: 'Plans techniques, notes, DCE' },
  { cle: 'execution', libelle: 'Exécution', description: 'Chantier, comptes-rendus, réserves' },
];

// Sections disponibles selon la catégorie : « aménagement » n'a ni permis
// de construire ni étude.
export const SECTIONS_PAR_CATEGORIE: Record<Categorie, SectionProjet[]> = {
  conception: ['avant-projet', 'images', 'documents', 'permis', 'etude', 'execution'],
  amenagement: ['avant-projet', 'images', 'documents', 'execution'],
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

export type ImageProjet = {
  id: string;
  projetId: string;
  url: string; // data URI en mock ; vraie URL objet une fois le stockage branché
  nom: string; // nom de fichier d'origine
  usage: UsageImage; // 'travail' par défaut à l'ajout
  phase: Phase | null; // tag optionnel — filtre, ne gate rien
  legende: string; // surtout renseigné côté portfolio
  ordre: number; // rang d'affichage dans le portfolio (drag & drop)
  ajoutePar: string; // nom résolu ; utilisateurId côté API
  ajouteLe: string; // ISO 8601
  supprimee: boolean; // soft-delete
  supprimeLe: string | null;
  supprimePar: string | null;
};

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
  note: string;
  ajoutePar: string;
  ajouteLe: string; // ISO 8601
  supprimee: boolean;
  supprimeLe: string | null;
  supprimePar: string | null;
};

// --- Section « Permis de construire » (conception uniquement) ---
// Procédure sénégalaise (loi 2008-43, Code de l'urbanisme, révisé déc. 2023) :
// NICAD → dossier → dépôt (TeleDAC ou guichet mairie) → instruction 90 j →
// obtention → (fin de chantier) certificat de conformité.
// Le passage « permis obtenu » est le 2ᵉ verrou dur de peutAvancerPhase.

export type StatutNicad = 'a_demander' | 'demande' | 'obtenu';

export const STATUTS_NICAD: Record<StatutNicad, string> = {
  a_demander: 'À demander',
  demande: 'Demandé',
  obtenu: 'Obtenu',
};

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

export type VoieDepot = 'teledac' | 'mairie';

export const VOIES_DEPOT: Record<VoieDepot, string> = {
  teledac: 'TeleDAC',
  mairie: 'Guichet mairie',
};

export type StatutPermis =
  | 'a_deposer'
  | 'depose'
  | 'instruction'
  | 'observations'
  | 'obtenu'
  | 'refuse';

export const STATUTS_PERMIS: Record<StatutPermis, string> = {
  a_deposer: 'À déposer',
  depose: 'Déposé',
  instruction: 'En instruction',
  observations: 'Observations',
  obtenu: 'Obtenu',
  refuse: 'Refusé',
};

export const DELAI_INSTRUCTION_JOURS = 90;

export type EntreeJournal = {
  id: string;
  date: string; // ISO 8601
  texte: string;
  auteur: string;
};

export type Permis = {
  projetId: string;
  nicad: StatutNicad;
  nicadNumero: string; // renseigné quand obtenu
  planBornage: boolean; // plan de bornage du géomètre joint
  dossier: Record<PieceDossierPermis, boolean>;
  statut: StatutPermis;
  voie: VoieDepot | null;
  dateDepot: string | null; // ISO — déclenche le compteur 90 j
  numeroRecepisse: string;
  dateObtention: string | null;
  dateRefus: string | null;
  certificatConformite: boolean;
  dateCertificat: string | null;
  journal: EntreeJournal[];
};

// Toutes les pièces du dossier cochées — garde avant de marquer « déposé ».
export function dossierPermisComplet(dossier: Record<PieceDossierPermis, boolean>): boolean {
  return PIECES_DOSSIER_PERMIS.every((p) => dossier[p.cle]);
}

// Jours restants sur les 90 jours d'instruction. `null` si pas encore déposé
// ou déjà tranché (obtenu / refusé). Négatif = délai dépassé.
export function joursRestantsInstruction(permis: Permis): number | null {
  if (!permis.dateDepot) return null;
  if (permis.statut === 'obtenu' || permis.statut === 'refuse' || permis.statut === 'a_deposer') {
    return null;
  }
  const ecoules = Math.floor((Date.now() - new Date(permis.dateDepot).getTime()) / 86_400_000);
  return DELAI_INSTRUCTION_JOURS - ecoules;
}

export type NiveauDelai = 'ok' | 'attention' | 'depasse';

export function niveauDelai(jours: number | null): NiveauDelai {
  if (jours === null || jours > 15) return 'ok';
  if (jours > 0) return 'attention';
  return 'depasse';
}

// --- Section « Études » (conception uniquement) ---
// Études techniques confiées à des BET : transforment l'APD en dossier
// d'exécution, puis constitution du DCE (dossier de consultation des
// entreprises). La consultation / attribution des marchés vit dans Exécution.
// Pas de verrou dur avant Chantier — juste un avertissement (bonne pratique,
// pas blocage légal comme le permis).

export type TypeEtude =
  | 'geotechnique'
  | 'topographie'
  | 'structure'
  | 'fluides'
  | 'electricite'
  | 'vrd';

export const TYPES_ETUDE: Record<TypeEtude, string> = {
  geotechnique: 'Étude géotechnique (sol)',
  topographie: 'Relevé topographique',
  structure: 'Structure / béton armé',
  fluides: 'Fluides (plomberie / CVC)',
  electricite: 'Électricité (courants forts / faibles)',
  vrd: 'VRD (voirie & réseaux divers)',
};

// Ensemble amorcé à la création (toutes « à lancer ») ; chacune peut être
// passée « non requise » selon le projet.
export const ETUDES_PAR_DEFAUT: TypeEtude[] = [
  'geotechnique',
  'topographie',
  'structure',
  'fluides',
  'electricite',
  'vrd',
];

export type StatutEtude = 'a_lancer' | 'en_cours' | 'remise' | 'validee' | 'non_requise';

export const STATUTS_ETUDE: Record<StatutEtude, string> = {
  a_lancer: 'À lancer',
  en_cours: 'En cours',
  remise: 'Remise',
  validee: 'Validée',
  non_requise: 'Non requise',
};

export type LigneEtude = {
  type: TypeEtude;
  statut: StatutEtude;
  bet: string; // nom du bureau d'études ; partenaireId nullable plus tard
  dateRemisePrevue: string | null; // ISO date
  dateRemiseReelle: string | null;
  note: string;
};

export type Etudes = {
  projetId: string;
  lignes: LigneEtude[];
  dceConstitue: boolean;
  dceLe: string | null;
};

// DCE mobilisable quand chaque ligne est validée OU non requise (pas
// « remise » — on ne met pas un rendu non vérifié dans l'appel d'offres).
export function etudesCompletes(e: Etudes): boolean {
  return e.lignes.every((l) => l.statut === 'validee' || l.statut === 'non_requise');
}

// Lignes ni validées ni non-requises — pour l'avertissement du stepper.
export function etudesEnAttente(e: Etudes): number {
  return e.lignes.filter((l) => l.statut !== 'validee' && l.statut !== 'non_requise').length;
}

// --- Section « Exécution / chantier » (les deux catégories) ---
// La phase la plus longue : consultation & attribution des marchés (le seam
// avec le DCE des Études), suivi lot par lot (avancement + situations de
// paiement), CR de chantier, réception. Pas de verrou dur avant « Livré » —
// avertissement doux si tous les lots ne sont pas terminés (comme Études).
// Paramétré par catégorie : lots BTP + réserves formelles côté conception ;
// mobilier/aménagement + simple validation client côté aménagement.

export type TypeLot =
  | 'gros_oeuvre'
  | 'second_oeuvre'
  | 'lots_techniques'
  | 'vrd'
  | 'fournitures_mobilier'
  | 'travaux_amenagement';

export const TYPES_LOT: Record<TypeLot, string> = {
  gros_oeuvre: 'Gros œuvre',
  second_oeuvre: 'Second œuvre',
  lots_techniques: 'Lots techniques',
  vrd: 'VRD',
  fournitures_mobilier: 'Fournitures & mobilier',
  travaux_amenagement: "Travaux d'aménagement",
};

export const LOTS_PAR_CATEGORIE: Record<Categorie, TypeLot[]> = {
  conception: ['gros_oeuvre', 'second_oeuvre', 'lots_techniques', 'vrd'],
  amenagement: ['fournitures_mobilier', 'travaux_amenagement'],
};

export type StatutLot = 'a_consulter' | 'consulte' | 'attribue' | 'en_cours' | 'termine';

export const STATUTS_LOT: Record<StatutLot, string> = {
  a_consulter: 'À consulter',
  consulte: 'Consulté',
  attribue: 'Attribué',
  en_cours: 'En cours',
  termine: 'Terminé',
};

export type OffreEntreprise = {
  id: string;
  entreprise: string;
  montant: number; // FCFA
  delaiJours: number | null;
};

export type SituationPaiement = {
  id: string;
  numero: number;
  date: string; // ISO date
  avancementCumule: number; // %
  montantSituation: number; // FCFA — travaux de la période
  retenueGarantie: number; // FCFA
  montantVerse: number; // FCFA — net payé
};

export type Lot = {
  type: TypeLot;
  statut: StatutLot;
  // consultation / attribution (le seam avec le DCE)
  entreprisesConsultees: string[];
  offres: OffreEntreprise[];
  entrepriseRetenue: string;
  montantMarche: number; // = montant attribué (FCFA)
  dateAttribution: string | null;
  // suivi
  avancement: number; // % physique
  dateDebut: string | null;
  dateFinPrevue: string | null;
  situations: SituationPaiement[];
};

export type Reserve = {
  id: string;
  description: string;
  statut: 'ouverte' | 'levee';
  dateLevee: string | null;
};

export type Reception = {
  receptionProvisoire: string | null;
  reserves: Reserve[]; // surtout conception
  leveeReserves: string | null;
  receptionDefinitive: string | null;
  validationClient: boolean; // surtout aménagement
  dateValidationClient: string | null;
};

export type Execution = {
  projetId: string;
  lots: Lot[];
  crChantier: EntreeJournal[];
  reception: Reception;
};

export function lotsTermines(e: Execution): boolean {
  return e.lots.length > 0 && e.lots.every((l) => l.statut === 'termine');
}

export function lotsEnAttente(e: Execution): number {
  return e.lots.filter((l) => l.statut !== 'termine').length;
}

// Net déjà versé sur un lot.
export function verseSurLot(l: Lot): number {
  return l.situations.reduce((s, x) => s + (x.montantVerse || 0), 0);
}

// Total des marchés signés (tous lots) — à confronter au pré-bilan APD figé.
export function totalMarches(e: Execution): number {
  return e.lots.reduce((s, l) => s + (l.montantMarche || 0), 0);
}

export function reservesOuvertes(e: Execution): number {
  return e.reception.reserves.filter((r) => r.statut === 'ouverte').length;
}

// --- Section « Avant-projet » ---
// Fiche programme (le brief) + validation (le GO qui débloque la suite).

export type NiveauFinition = 'standard' | 'soigne' | 'haut_de_gamme';

export const NIVEAUX_FINITION: Record<NiveauFinition, string> = {
  standard: 'Standard',
  soigne: 'Soigné',
  haut_de_gamme: 'Haut de gamme',
};

export type ChecklistAvantProjet = {
  programmeValide: boolean;
  budgetValide: boolean;
  esquisseValidee: boolean;
  engagementValide: boolean;
};

// --- Sous-checklists opérationnelles de l'avant-projet ---
// Le suivi quotidien de l'équipe (miroir du Trello Grey Concrete), distinct du
// gate macro à 4 points : n'ajoute AUCUN verrou de phase, alimente juste un %.
// Le contrat (GET …/avant-projet) renvoie `checklists` déjà groupées et
// libellées par le backend (CHECKLISTS_AVANT_PROJET) — le front n'a qu'à
// afficher et PATCH …/avant-projet/checklist/:cle (un champ à la fois).

export type GroupeChecklistAvp =
  | 'releve_existant'
  | 'taches_complementaires'
  | 'fichiers_produits'
  | 'dossier_final';

export type ItemChecklistAvp = {
  cle: string;
  libelle: string;
  fait: boolean;
  nonRequis: boolean; // équivalent de StatutEtude.non_requise — hors dénominateur
  note: string;
};

export type ChecklistAvpGroupe = {
  groupe: GroupeChecklistAvp;
  libelle: string;
  items: ItemChecklistAvp[];
};

// MIROIR de backend domaine/gardes.ts::avancementChecklistAvp — `nonRequis`
// sort du dénominateur. Purement indicatif (carte de section), aucun verrou.
export function avancementChecklistAvp(
  items: { fait: boolean; nonRequis: boolean }[],
): { faits: number; total: number; pct: number; complete: boolean } {
  const applicables = items.filter((i) => !i.nonRequis);
  const faits = applicables.filter((i) => i.fait).length;
  const total = applicables.length;
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

// Libellés de la checklist selon catégorie × nature : le livrable de
// conception diffère (esquisse / planches d'ambiance), la validation « par le
// client » n'a de sens qu'en mandat, et le dernier verrou est le contrat
// (mandat) ou le GO direction (promotion).
//
// GARDE MIROIR — le backend vérifie les 4 booléens à la validation de
// l'avant-projet (POST …/avant-projet/validation, 409 si incomplet). Les clés
// de ChecklistAvantProjet doivent rester alignées des deux côtés.
export function checklistAvantProjet(
  categorie: Categorie,
  nature: NatureDossier,
): { cle: keyof ChecklistAvantProjet; libelle: string }[] {
  const client = nature === 'mandat_client';
  const livrable = categorie === 'amenagement' ? "Planches d'ambiance" : 'Esquisse';
  const livrableAccord = categorie === 'amenagement' ? 'validées' : 'validée';
  return [
    { cle: 'programmeValide', libelle: 'Programme validé' },
    { cle: 'budgetValide', libelle: client ? 'Budget validé' : 'Pré-bilan validé (marge OK)' },
    {
      cle: 'esquisseValidee',
      libelle: client
        ? `${livrable} ${livrableAccord} par le client`
        : `${livrable} ${livrableAccord}`,
    },
    {
      cle: 'engagementValide',
      libelle: client ? 'Contrat / honoraires signés' : 'GO direction acté',
    },
  ];
}

export type AvantProjet = {
  projetId: string;
  // Fiche programme
  besoinSurface: number | null; // m² à construire / aménager
  nbLots: number | null; // pièces, logements, lots
  usages: string;
  niveauFinition: NiveauFinition;
  budgetCibleClient: number | null; // FCFA
  delaiSouhaite: string;
  contraintes: string;
  references: string;
  // Affectation & agenda (miroir carte Trello) — FK Collaborateur résolue { id, nom }
  dessinateur: { id: string; nom: string } | null;
  responsable3d: { id: string; nom: string } | null;
  dateDebut: string | null; // AAAA-MM-JJ
  dateFin: string | null;
  // Validation macro (gate de sortie de phase)
  checklist: ChecklistAvantProjet;
  // Suivi opérationnel (sous-checklists Trello) — indicatif, ne gate rien
  checklists: ChecklistAvpGroupe[];
  pieceValidation: string | null; // mail / PV joint (libellé)
  valideLe: string | null; // ISO 8601
  validePar: string | null;
};

// Charge utile du PATCH avant-projet : la fiche programme (merge partiel).
// `dessinateur`/`responsable3d` s'envoient par id (FK Collaborateur).
export type PatchAvantProjet = Partial<{
  besoinSurface: number | null;
  nbLots: number | null;
  usages: string;
  niveauFinition: NiveauFinition;
  budgetCibleClient: number | null;
  delaiSouhaite: string;
  contraintes: string;
  references: string;
  dessinateurId: string | null;
  responsable3dId: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  checklist: Partial<ChecklistAvantProjet>;
  pieceValidation: string | null;
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

export const JALONS_FACTURE: { cle: JalonFacture; libelle: string }[] = [
  { cle: 'signature', libelle: 'Signature du contrat' },
  { cle: 'avant_projet', libelle: "Validation de l'avant-projet" },
  { cle: 'livraison', libelle: 'Livraison' },
];

export type ModePaiement = 'virement' | 'cheque' | 'especes' | 'mobile_money';

export const MODES_PAIEMENT: Record<ModePaiement, string> = {
  virement: 'Virement',
  cheque: 'Chèque',
  especes: 'Espèces',
  mobile_money: 'Mobile money',
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
};

export type ResumeFacturation = {
  totalFactureTtc: number; // net émis (avoirs déduits)
  totalEncaisse: number;
  totalDu: number;
  nbEnRetard: number;
  suggestionVenteHt: number | null; // prix de vente de la dernière version pré-bilan figée
};

export type Facturation = {
  projetId: string;
  factures: Facture[];
  resume: ResumeFacturation;
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
