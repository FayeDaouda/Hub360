// Types du module Équipes, tirés de la description OpenAPI générée depuis le
// back (ADR 0005) : la réponse de GET /equipes est décrite par TeamsViewDto
// (backend/src/teams/teams-view.dto.ts). Les noms des champs sont ceux de
// l'API, inchangés pendant la structuration.
import type { CorpsRequete, SchemaApi } from '@/lib/api/types';

export type TeamsView = SchemaApi<'TeamsViewDto'>;
export type TeamCell = SchemaApi<'TeamCellDto'>;

// Nomenclature ISO 9001 des cellules et séniorité (2ᵉ axe, distinct du métier).
export type CellProcess = TeamCell['processus'];
export type CellClientele = TeamCell['clientele'];
export type CellStatus = TeamCell['statut'];
export type PositionState = SchemaApi<'CellPositionDto'>['etat'];
export type EmployeeLevel = SchemaApi<'CellMemberDto'>['niveau'];

// Corps envoyés : création d'une cellule (code SOCIÉTÉ-PROCESSUS-NN attribué
// par le serveur ; le pilote rejoint la cellule) et fiche d'équipe d'un
// collaborateur (cellule, niveau, photo en data URI).
export type NewCell = CorpsRequete<'/api/societes/{slug}/cellules', 'post'>;
export type EmployeeUpdate = CorpsRequete<'/api/societes/{slug}/collaborateurs/{id}', 'patch'>;
