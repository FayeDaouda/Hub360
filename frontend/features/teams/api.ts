import { apiSociete } from '@/lib/client-api';
import type { EmployeeUpdate, NewCell, TeamsView } from './types';

// -----------------------------------------------------------------------------
// Équipes — cellules et collaborateurs. API NestJS :
//   GET                    …/equipes                (la page en une lecture)
//   POST/PATCH/DELETE      …/cellules[/:id]         (409 si suppression d'une cellule non vide)
//   PATCH                  …/cellules/:id/dispatcher
//   PATCH                  …/collaborateurs/:id     (fiche d'équipe : cellule, niveau, photo)
// Les écritures relisent ensuite la vue : leurs réponses ne sont pas utilisées.
// -----------------------------------------------------------------------------

// Page « Équipes » (maquette du boss) : indicateurs, cellules, listes.
export function getTeamsView(slug: string): Promise<TeamsView> {
  return apiSociete<TeamsView>(slug, '/equipes');
}

export function createCell(slug: string, cell: NewCell): Promise<unknown> {
  return apiSociete(slug, '/cellules', { method: 'POST', body: cell });
}

export function renameCell(slug: string, id: string, nom: string): Promise<unknown> {
  return apiSociete(slug, `/cellules/${id}`, { method: 'PATCH', body: { nom } });
}

export function deleteCell(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/cellules/${id}`, { method: 'DELETE', sansCorps: true });
}

// Désigne (ou retire, dispatcherId=null) le pilote de la cellule — admin
// uniquement, doit être membre de cette cellule (décision boss, sept. 2026).
export function setCellPilot(slug: string, cellId: string, dispatcherId: string | null): Promise<unknown> {
  return apiSociete(slug, `/cellules/${cellId}/dispatcher`, { method: 'PATCH', body: { dispatcherId } });
}

export function updateEmployee(slug: string, id: string, data: EmployeeUpdate): Promise<unknown> {
  return apiSociete(slug, `/collaborateurs/${id}`, { method: 'PATCH', body: data });
}
