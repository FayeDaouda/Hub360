// Agenda (12/11/2026) : listes partagées par le serveur et l'écran.

// Rappels proposés avant un rendez-vous, en minutes : 10 min, 30 min, 1 h,
// la veille (24 h).
export const RAPPELS_AGENDA = [
  { minutes: 10, libelle: '10 minutes avant' },
  { minutes: 30, libelle: '30 minutes avant' },
  { minutes: 60, libelle: '1 heure avant' },
  { minutes: 1440, libelle: 'La veille (24 h avant)' },
] as const;
export const RAPPELS_MINUTES = RAPPELS_AGENDA.map((r) => r.minutes);
export const RAPPEL_MAX_MINUTES = Math.max(...RAPPELS_MINUTES);

// Réponse d'un invité à une réunion.
export type ReponseInvitation = 'oui' | 'non' | 'peut_etre';
export const LIBELLES_REPONSE: Record<ReponseInvitation, string> = {
  oui: 'Oui',
  non: 'Non',
  peut_etre: 'Peut-être',
};
