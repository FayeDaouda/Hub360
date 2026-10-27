// Types du module Équipes. Les noms des champs sont ceux de l'API (routes
// /cellules, /collaborateurs, /equipes), inchangés pendant la structuration.
// Un projet peut être suivi par PLUSIEURS cellules (décision boss, sept.
// 2026) ; un collaborateur est rattaché à une seule cellule au plus
// (celluleId null = sans cellule).
import type { StatutCompte } from '@/lib/types';

// Séniorité (2ᵉ axe, distinct du métier `role`).
export type EmployeeLevel = 'stagiaire' | 'junior' | 'confirme' | 'senior' | 'lead';

// Nomenclature ISO 9001 des cellules (backend : teams/teams.service.ts).
export type CellProcess = 'DIR' | 'ARC' | 'INT' | 'ETU';
export type CellClientele = 'externes' | 'holding' | 'tous' | 'sans_objet';
export type CellStatus = 'active' | 'a_constituer' | 'reportee';
export type PositionState = 'occupe' | 'ouvert' | 'reporte' | 'a_recruter' | 'externe';

export type Employee = {
  id: string;
  prenom: string;
  nom: string;
  role: string; // métier
  niveau: EmployeeLevel;
  photoUrl: string | null; // data URI en transition ; URL signée S3 plus tard
  celluleId: string | null;
  // Entrée dans le studio (AAAA-MM-JJ), saisie admin. null = non renseignée :
  // aucune ancienneté improvisée. Distincte de la création de la fiche.
  dateArrivee: string | null;
  email: string | null; // du compte lié, s'il existe
  statutCompte: StatutCompte;
};

export type Cell = {
  id: string;
  nom: string; // nom d'usage
  code: string; // « GC-ARC-01 » (nomenclature ISO 9001, jamais réutilisé)
  processus: CellProcess;
  clientele: CellClientele;
  statut: CellStatus;
  // Membre habilité à répartir les tâches aux autres (décision boss, sept.
  // 2026) — un seul par cellule, désigné par l'admin, doit être membre ;
  // pilote de la cellule dans la page Équipes.
  dispatcherId: string | null;
  collaborateurs: Employee[];
};

export type TeamCell = {
  id: string;
  code: string;
  processus: CellProcess;
  nom: string;
  clientele: CellClientele;
  statut: CellStatus;
  // sansCompte : chef sans compte HUB actif — ses remises remontent au Dir. GC.
  pilote: { id: string; nom: string; sansCompte?: boolean } | null;
  pctATemps: number | null; // null = pas encore d'étape livrée
  postes: { id: string; libelle: string; etat: PositionState; titulaire: { id: string; nom: string } | null }[];
  membres: {
    id: string;
    nom: string;
    role: string;
    niveau: EmployeeLevel;
    photoUrl: string | null; // data URI en transition (cf. Employee.photoUrl)
    absentJusquau?: string | null; // absence validée qui couvre aujourd'hui
    poste: string | null;
    estPilote: boolean;
    taches: number; // tâches du mois en cours
    heures: number; // heures imputées ce mois, à ce jour
    pctATemps: number | null;
  }[];
};

export type TeamsView = {
  indicateurs: {
    cellules: { actives: number; total: number };
    salariesAAffecter: number;
    projetsSignes: { total: number; nonAffectes: number };
    // Tâches (revue CTO) ; etapesEnRetard = le chiffre du reporting de la direction.
    taches: { enCours: number; enRetard: number; pctATemps: number | null; etapesEnRetard: number };
    absencesEnAttente: number;
  };
  cellules: TeamCell[];
  salariesAAffecter: {
    id: string;
    nom: string;
    role: string;
    niveau: EmployeeLevel;
    dateArrivee: string | null;
  }[];
  projets: { id: string; code: string; programme: string; client: string; cellules: { code: string; nom: string }[] }[];
  tachesEnCours: {
    id: string;
    projet: string;
    etape: string;
    libelle: string;
    assigne: string | null;
    echeance: string | null;
    enRetard: boolean;
    prolongeeJusquau: string | null; // retard qualifié, pas compté en retard
  }[];
  collaborateurs: { id: string; nom: string; cellule: string | null }[];
  prochainsCodes: Record<CellProcess, string>;
};
