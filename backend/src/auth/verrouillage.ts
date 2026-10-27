// Verrouillage des comptes (décision du 28/10/2026, lot C) : après 10 essais
// de connexion infructueux (mot de passe ou code de double authentification),
// le compte est verrouillé 15 minutes ; la durée double à chaque récidive,
// plafonnée à une heure. Une connexion réussie remet tout à zéro ; le CIO
// peut débloquer avant la fin (Comptes & rôles).
export const ESSAIS_AVANT_VERROUILLAGE = 10;
const PREMIER_VERROUILLAGE_MS = 15 * 60_000;
const VERROUILLAGE_MAX_MS = 60 * 60_000;

// `verrouillages` : verrouillages déjà subis depuis la dernière connexion
// réussie (0 pour le premier).
export const dureeVerrouillage = (verrouillages: number) =>
  Math.min(PREMIER_VERROUILLAGE_MS * 2 ** verrouillages, VERROUILLAGE_MAX_MS);

export const estVerrouille = (verrouilleJusquau: Date | null, maintenant = new Date()) =>
  verrouilleJusquau !== null && verrouilleJusquau > maintenant;
