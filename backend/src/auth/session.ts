import { ROLE_CEO, ROLE_CFO, ROLE_CIO, ROLE_HR, ROLE_HUB_ADMIN } from '@hub/domain';

// Durée des sessions (décision du 28/10/2026, lot B) : douze heures au plus
// depuis la connexion, pour tous les rôles ; sans activité, une heure pour le
// CEO, le CFO, le CIO, la RH et l'Administrateur HUB (29/10/2026), quatre
// heures pour les autres. Le jeton porte
// l'heure de la connexion (`debut`) ; l'activité dans le HUB le fait
// prolonger (POST /auth/moi/prolongation), jamais au-delà de debut + 12 h.
// Fixées ici et non dans la configuration : c'est une décision de la
// direction. Dates en secondes, comme dans le jeton.
export const DUREE_MAX_SESSION_S = 12 * 3600;
const INACTIVITE_COURTE_S = 3600;
const INACTIVITE_S = 4 * 3600;
const ROLES_INACTIVITE_COURTE: ReadonlySet<string> = new Set([ROLE_CEO, ROLE_CFO, ROLE_CIO, ROLE_HR, ROLE_HUB_ADMIN]);

export const delaiInactivite = (role: string) =>
  ROLES_INACTIVITE_COURTE.has(role) ? INACTIVITE_COURTE_S : INACTIVITE_S;

// Validité d'un jeton émis à `iat` dans une session ouverte à `debut` ; zéro
// ou moins : la session a atteint ses douze heures.
export const dureeJeton = (role: string, debut: number, iat: number) =>
  Math.min(delaiInactivite(role), debut + DUREE_MAX_SESSION_S - iat);

// Revérifiée à chaque requête (JwtStrategy), y compris pour un jeton émis
// avant cette règle (sept jours de validité, sans `debut`).
export const sessionEchue = (debut: number, maintenant = Date.now()) =>
  maintenant >= (debut + DUREE_MAX_SESSION_S) * 1000;
