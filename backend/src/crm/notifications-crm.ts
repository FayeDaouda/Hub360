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
// Revue COO (22/10/2026) : la personne qui a CRÉÉ le lead (souvent le COO)
// et l'apporteur interne suivent l'issue de leurs dossiers — offre acceptée
// ou refusée, dossier perdu, offre expirée sans réponse (tournée des rappels),
// contrat signé.
//   dossier perdu              propriétaire + créateur + apporteur   information (motif)
//   offre expirée              propriétaire + créateur + apporteur   refaire l'offre ou perdre
//
// Pas de notification à l'émission d'une facture ni à un paiement : c'est la
// CFO qui les fait elle-même. L'apporteur n'est joignable que s'il est
// INTERNE (compte HUB) ; un apporteur externe n'a pas de compte.
//
// Fonctions pures : la résolution des comptes (requêtes) est dans
// NotificationsService.notifierDossierCrm.

import type { ActionCrm } from './cycle';
import { ChampsFiche, TOTAL_CHAMPS_FICHE, champsManquants } from './fiche';
import { plural } from '../shared/text';

export type EvenementCrm =
  | 'dossier_soumis'
  | 'dossier_renvoye'
  | 'offre_envoyee'
  | 'offre_acceptee'
  | 'offre_refusee'
  | 'contrat_signe'
  | 'dossier_perdu'
  | 'offre_expiree';

export type CibleCrm = 'daf' | 'proprietaire' | 'apporteur' | 'createur';

// Actions manuelles du cycle qui notifient (les autres événements viennent de
// la réponse du client et de la signature du contrat).
export const EVENEMENT_PAR_ACTION: Partial<Record<ActionCrm, EvenementCrm>> = {
  soumettre: 'dossier_soumis',
  renvoyer: 'dossier_renvoye',
  valider: 'offre_envoyee',
  perdre: 'dossier_perdu',
};

// Ordre = priorité du titre quand une même personne cumule deux cibles (le
// propriétaire qui est aussi l'apporteur reçoit le titre « action requise »).
export const CIBLES_EVENEMENT: Record<EvenementCrm, CibleCrm[]> = {
  dossier_soumis: ['daf'],
  dossier_renvoye: ['proprietaire'],
  offre_envoyee: ['proprietaire'],
  offre_acceptee: ['proprietaire', 'apporteur', 'createur'],
  offre_refusee: ['proprietaire', 'apporteur', 'createur'],
  contrat_signe: ['proprietaire', 'daf', 'createur'],
  dossier_perdu: ['proprietaire', 'createur', 'apporteur'],
  offre_expiree: ['proprietaire', 'createur', 'apporteur'],
};

export type ContexteNotificationCrm = {
  code: string;
  programme: string;
  commentaire?: string | null; // renvoi DAF, motif de perte
  facturesPreparees?: number; // contrat signé
};

const LONGUEUR_MAX_COMMENTAIRE = 140;

function extrait(texte: string): string {
  const t = texte.replace(/\s+/g, ' ').trim();
  return t.length > LONGUEUR_MAX_COMMENTAIRE ? `${t.slice(0, LONGUEUR_MAX_COMMENTAIRE - 1)}…` : t;
}

export function titreNotificationCrm(evenement: EvenementCrm, cible: CibleCrm, ctx: ContexteNotificationCrm): string {
  const dossier = `${ctx.code} · ${ctx.programme}`;
  switch (evenement) {
    case 'dossier_soumis':
      return `${dossier} — offre à valider`;
    case 'dossier_renvoye':
      return ctx.commentaire
        ? `${dossier} — renvoyé par la DAF : « ${extrait(ctx.commentaire)} »`
        : `${dossier} — renvoyé par la DAF`;
    case 'offre_envoyee':
      return `${dossier} — offre validée et envoyée au client`;
    case 'offre_acceptee':
      return cible === 'proprietaire'
        ? `${dossier} — offre acceptée par le client, contrat à préparer`
        : `${dossier} — offre acceptée par le client`;
    case 'offre_refusee':
      return `${dossier} — offre refusée par le client, dossier perdu`;
    case 'contrat_signe': {
      const n = ctx.facturesPreparees ?? 0;
      if (cible === 'daf' && n > 0) {
        return `${dossier} — contrat signé, ${plural(n, 'facture')} brouillon à émettre`;
      }
      return `${dossier} — contrat signé, projet lancé`;
    }
    case 'dossier_perdu':
      return ctx.commentaire
        ? `${dossier} — dossier déclaré perdu : « ${extrait(ctx.commentaire)} »`
        : `${dossier} — dossier déclaré perdu`;
    case 'offre_expiree':
      return cible === 'proprietaire'
        ? `${dossier} — offre expirée sans réponse du client, à refaire ou à déclarer perdue`
        : `${dossier} — offre expirée sans réponse du client`;
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

// Relance d'un lead resté incomplet (maquette « Nouveau projet », oct. 2026 :
// « les autres champs se complètent ensuite dans la fiche, sous 72 h. Au-delà,
// le HUB crée une relance »). Alerte DÉRIVÉE à la lecture du flux, jamais
// stockée : elle s'éteint d'elle-même dès que la fiche est complète, archivée
// ou sortie de « Nouveau projet ». Destinataires (NotificationsService) : le
// propriétaire ; un lead « à assigner » relance tous les titulaires Dir. GC.
export const DELAI_RELANCE_FICHE_MS = 72 * 3600 * 1000;

// null = pas (ou plus) de relance pour ce dossier à cet instant.
export function relanceFicheIncomplete(
  d: ChampsFiche & { createdAt: Date },
  maintenant: Date,
): { titre: string; date: Date } | null {
  const echue = new Date(d.createdAt.getTime() + DELAI_RELANCE_FICHE_MS);
  if (echue > maintenant) return null;
  const manquants = champsManquants(d);
  if (!manquants.length) return null;
  const faits = TOTAL_CHAMPS_FICHE - manquants.length;
  return {
    titre: `${d.code} — fiche ${faits}/${TOTAL_CHAMPS_FICHE} depuis plus de 72 h : à compléter avant l’offre`,
    date: echue,
  };
}
