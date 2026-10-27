// Types de « Mon espace », tirés de la description OpenAPI générée depuis le
// back (ADR 0005) : réponses décrites par MySpaceViewDto et MyCellViewDto
// (backend/src/my-space). Les noms des champs sont ceux de l'API, inchangés.
import type { CorpsRequete, SchemaApi } from '@/lib/api/types';

export type MySpaceView = SchemaApi<'MySpaceViewDto'>;
// Dossier du personnel du compte connecté.
export type MyFile = SchemaApi<'MyFileDto'>;
export type MyCellView = SchemaApi<'MyCellViewDto'>;
// La cellule du compte : son équipe et les projets qu'elle suit.
export type MyCell = SchemaApi<'MyCellDto'>;
export type PaymentMode = MyFile['modePaiement'];
export type EmployeeDocumentType = SchemaApi<'EmployeeDocumentDto'>['type'];
// « Mes informations » : enregistrées immédiatement, champ par champ.
export type ContactDetails = CorpsRequete<'/api/societes/{slug}/mon-espace/coordonnees', 'patch'>;
// Changement de moyen de paiement : soumis à la RH, appliqué après sa validation.
export type PaymentChange = CorpsRequete<'/api/societes/{slug}/mon-espace/paiement', 'post'>;
