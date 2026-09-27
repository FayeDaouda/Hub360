// Notifications du cycle CRM — tableau validé le 2026-09-27. Volontairement
// resserré sur les moments où quelqu'un doit AGIR (pas de fatigue de
// notifications) :
//
//   Événement                  Qui est prévenu                Pourquoi
//   dossier soumis à la DAF    DAF (CFO)                      elle doit valider
//   DAF renvoie le dossier     propriétaire (Dir. GC)         il doit corriger
//   offre acceptée             propriétaire + apporteur       contrat à préparer / information
//   offre refusée              propriétaire + apporteur       information
//   contrat signé (Onboard)    propriétaire + DAF             projet lancé / factures brouillon
//
// Pas de notification à l'émission d'une facture ni à un paiement : c'est la
// CFO qui les fait elle-même. L'apporteur n'est joignable que s'il est
// INTERNE (compte HUB) ; un apporteur externe n'a pas de compte.
//
// Fonctions pures : la résolution des comptes (requêtes) est dans
// NotificationsService.notifierDossierCrm.

import type { ActionCrm } from './cycle';

export type EvenementCrm =
  | 'dossier_soumis'
  | 'dossier_renvoye'
  | 'offre_acceptee'
  | 'offre_refusee'
  | 'contrat_signe';

export type CibleCrm = 'daf' | 'proprietaire' | 'apporteur';

// Actions manuelles du cycle qui notifient (les autres événements viennent de
// la réponse du client et de la signature du contrat).
export const EVENEMENT_PAR_ACTION: Partial<Record<ActionCrm, EvenementCrm>> = {
  soumettre: 'dossier_soumis',
  renvoyer: 'dossier_renvoye',
};

// Ordre = priorité du titre quand une même personne cumule deux cibles (le
// propriétaire qui est aussi l'apporteur reçoit le titre « action requise »).
export const CIBLES_EVENEMENT: Record<EvenementCrm, CibleCrm[]> = {
  dossier_soumis: ['daf'],
  dossier_renvoye: ['proprietaire'],
  offre_acceptee: ['proprietaire', 'apporteur'],
  offre_refusee: ['proprietaire', 'apporteur'],
  contrat_signe: ['proprietaire', 'daf'],
};

export type ContexteNotificationCrm = {
  code: string;
  programme: string;
  commentaire?: string | null; // renvoi DAF
  facturesPreparees?: number; // contrat signé
};

const LONGUEUR_MAX_COMMENTAIRE = 140;

function extrait(texte: string): string {
  const t = texte.replace(/\s+/g, ' ').trim();
  return t.length > LONGUEUR_MAX_COMMENTAIRE ? `${t.slice(0, LONGUEUR_MAX_COMMENTAIRE - 1)}…` : t;
}

export function titreNotificationCrm(
  evenement: EvenementCrm,
  cible: CibleCrm,
  ctx: ContexteNotificationCrm,
): string {
  const dossier = `${ctx.code} · ${ctx.programme}`;
  switch (evenement) {
    case 'dossier_soumis':
      return `${dossier} — offre à valider`;
    case 'dossier_renvoye':
      return ctx.commentaire
        ? `${dossier} — renvoyé par la DAF : « ${extrait(ctx.commentaire)} »`
        : `${dossier} — renvoyé par la DAF`;
    case 'offre_acceptee':
      return cible === 'proprietaire'
        ? `${dossier} — offre acceptée par le client, contrat à préparer`
        : `${dossier} — offre acceptée par le client`;
    case 'offre_refusee':
      return `${dossier} — offre refusée par le client, dossier perdu`;
    case 'contrat_signe': {
      const n = ctx.facturesPreparees ?? 0;
      if (cible === 'daf' && n > 0) {
        return `${dossier} — contrat signé, ${n} facture${n > 1 ? 's' : ''} brouillon à émettre`;
      }
      return `${dossier} — contrat signé, projet lancé`;
    }
  }
}

// Une notification par personne : cibles dans l'ordre de priorité, doublons
// fusionnés, et jamais l'auteur de l'action (il sait ce qu'il vient de faire).
export function planNotificationsCrm(
  evenement: EvenementCrm,
  ctx: ContexteNotificationCrm,
  comptes: Record<CibleCrm, string[]>,
  auteurId: string | null,
): { destinataireId: string; titre: string }[] {
  const plan = new Map<string, string>();
  for (const cible of CIBLES_EVENEMENT[evenement]) {
    for (const id of comptes[cible]) {
      if (id === auteurId || plan.has(id)) continue;
      plan.set(id, titreNotificationCrm(evenement, cible, ctx));
    }
  }
  return [...plan].map(([destinataireId, titre]) => ({ destinataireId, titre }));
}
