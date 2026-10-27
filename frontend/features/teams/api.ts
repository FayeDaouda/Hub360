import { apiSociete } from '@/lib/client-api';
import type { Cell, CellClientele, CellProcess, CellStatus, Employee, EmployeeLevel, TeamsView } from './types';

// -----------------------------------------------------------------------------
// Équipes — cellules et collaborateurs. API NestJS :
//   GET                    …/equipes                (la page en une lecture)
//   POST/PATCH/DELETE      …/cellules[/:id]         (409 si suppression d'une cellule non vide)
//   PATCH                  …/cellules/:id/dispatcher
//   PATCH                  …/collaborateurs/:id     (fiche d'équipe : cellule, niveau, photo)
// `photo` = data URI (redimensionnée côté navigateur, cf. lib/image-fichier.ts).
// -----------------------------------------------------------------------------

// Page « Équipes » (maquette du boss) : indicateurs, cellules, listes.
export function getTeamsView(slug: string): Promise<TeamsView> {
  return apiSociete<TeamsView>(slug, '/equipes');
}

// Code SOCIÉTÉ-PROCESSUS-NN attribué par le serveur ; le pilote rejoint la cellule.
export type NewCell = {
  processus: CellProcess;
  nom: string;
  clientele?: CellClientele;
  statut?: CellStatus;
  piloteId?: string | null;
};

export function createCell(slug: string, cell: NewCell): Promise<Cell> {
  return apiSociete<Cell>(slug, '/cellules', { method: 'POST', body: cell });
}

export function renameCell(slug: string, id: string, nom: string): Promise<Cell> {
  return apiSociete<Cell>(slug, `/cellules/${id}`, { method: 'PATCH', body: { nom } });
}

export function deleteCell(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/cellules/${id}`, { method: 'DELETE', sansCorps: true });
}

// Désigne (ou retire, dispatcherId=null) le pilote de la cellule — admin
// uniquement, doit être membre de cette cellule (décision boss, sept. 2026).
export function setCellPilot(slug: string, cellId: string, dispatcherId: string | null): Promise<Cell> {
  return apiSociete<Cell>(slug, `/cellules/${cellId}/dispatcher`, { method: 'PATCH', body: { dispatcherId } });
}

type EmployeeFields = {
  prenom: string;
  nom: string;
  role: string;
  niveau: EmployeeLevel;
  celluleId?: string | null;
  photo?: string | null;
  dateArrivee?: string | null; // AAAA-MM-JJ ; null = effacer
};

export function updateEmployee(slug: string, id: string, data: Partial<EmployeeFields>): Promise<Employee> {
  return apiSociete<Employee>(slug, `/collaborateurs/${id}`, { method: 'PATCH', body: data });
}
