import { niveauSuffisant } from './auth';
import { completudeFiche } from './crm';
import type { NiveauPermission, Projet, Session, StatutCrm } from './types';

// Actions du cycle commercial — MIROIR de backend/src/crm/cycle.ts (mêmes
// statuts de départ, mêmes droits). Sert à n'afficher que les boutons
// utilisables ; le serveur reste seul juge et revérifie tout.
export type ActionCrm = 'soumettre' | 'valider' | 'renvoyer' | 'onboarder' | 'refaire' | 'perdre';

type DefAction = {
  libelle: string;
  de: StatutCrm[];
  module: string;
  niveau: NiveauPermission;
  // Libellé du champ texte obligatoire, s'il y en a un.
  texte?: { label: string; placeholder: string };
  // Ce que l'action va provoquer — affiché avant confirmation.
  consequence: string;
  ton: 'principal' | 'neutre' | 'danger';
};

export const ACTIONS_CRM: Record<ActionCrm, DefAction> = {
  soumettre: {
    libelle: 'Soumettre à la DAF',
    de: ['nouveau_projet'],
    module: 'crm',
    niveau: 'ecriture',
    consequence: 'Le dossier part en validation chez la DAF ; sa fiche sera figée.',
    ton: 'principal',
  },
  valider: {
    libelle: 'Valider et envoyer l’offre',
    de: ['en_validation'],
    module: 'finances_devis',
    niveau: 'validation',
    consequence:
      'L’offre est numérotée et envoyée au client (email + lien de réponse), valable 7 jours. Elle ne sera plus modifiable.',
    ton: 'principal',
  },
  renvoyer: {
    libelle: 'Renvoyer',
    de: ['en_validation'],
    module: 'finances_devis',
    niveau: 'validation',
    texte: { label: 'Commentaire pour l’équipe', placeholder: 'Ce qui doit être revu…' },
    consequence: 'Le dossier revient en « Nouveau projet » avec ton commentaire.',
    ton: 'neutre',
  },
  onboarder: {
    libelle: 'Client acquis — Onboard',
    de: ['offre_envoyee'],
    module: 'crm',
    niveau: 'ecriture',
    consequence: 'Client acquis : un projet d’exécution sera créé dans « Projets ». Définitif.',
    ton: 'principal',
  },
  refaire: {
    libelle: 'Refaire une offre',
    de: ['offre_envoyee'],
    module: 'crm',
    niveau: 'ecriture',
    consequence:
      'Le dossier revient en « Nouveau projet » pour préparer une nouvelle offre. L’offre expirée reste dans l’historique.',
    ton: 'neutre',
  },
  perdre: {
    libelle: 'Déclarer perdu',
    de: ['nouveau_projet', 'en_validation', 'offre_envoyee'],
    module: 'crm',
    niveau: 'ecriture',
    texte: { label: 'Motif de la perte', placeholder: 'Pourquoi le dossier est perdu…' },
    consequence: 'Le dossier sort du pipeline. Définitif.',
    ton: 'danger',
  },
};

// « onboarder » n'est pas proposé : c'est l'acceptation de l'offre par le
// client qui fait passer le dossier en Onboard (décision du 29/10/2026).
const ORDRE: ActionCrm[] = ['soumettre', 'valider', 'refaire', 'renvoyer', 'perdre'];

// Pourquoi une action permise par le statut et le rôle ne peut PAS encore
// partir, d'après l'offre du dossier (étape F) — null = rien ne bloque, ou
// on ne sait pas (offre invisible sans finances_devis : le serveur tranchera
// et renverra son message). Mêmes conditions que CrmService.verifierOffre.
export function raisonBlocage(action: ActionCrm, projet: Projet): string | null {
  // La fiche se verrouille à la soumission : complète d'abord (crm/fiche.ts).
  const fiche = completudeFiche(projet);
  if (action === 'soumettre' && fiche.faits < fiche.total) {
    return `Complète d’abord la fiche (${fiche.faits}/${fiche.total}).`;
  }
  if (!('offre' in projet)) return null;
  const offre = projet.offre ?? null;
  const statut = offre?.statutEffectif;
  if (action === 'soumettre' && (statut !== 'brouillon' || !offre?.nbLignes)) {
    return 'Prépare d’abord l’offre (au moins une ligne).';
  }
  if (action === 'onboarder' && statut !== 'accepte') {
    return 'Attends l’acceptation de l’offre par le client.';
  }
  if (action === 'refaire' && statut === 'envoye') {
    return `L’offre attend encore la réponse du client (valable jusqu’au ${offre?.dateValidite}).`;
  }
  if (action === 'refaire' && statut === 'accepte') {
    return 'L’offre a été acceptée : le dossier passe en Onboard, il ne repart pas pour une nouvelle offre.';
  }
  return null;
}

// Actions que cette session peut déclencher sur un dossier dans ce statut.
export function actionsPossibles(statut: StatutCrm, session: Session): ActionCrm[] {
  return ORDRE.filter((a) => {
    const def = ACTIONS_CRM[a];
    return def.de.includes(statut) && niveauSuffisant(session, def.module, def.niveau);
  });
}

// Variante de pastille (.statut-select--*) par statut — grammaire commune :
// argile à traiter · iris chez la DAF · ocre offre en cours · sauge acquis ·
// rouge perdu. Un seul point de vérité (liste, fiche, entonnoir).
export const CLASSE_STATUT: Record<StatutCrm, string> = {
  nouveau_projet: 'nouveau',
  en_validation: 'daf',
  offre_envoyee: 'devis',
  onboard: 'valide',
  perdu: 'annule',
};
