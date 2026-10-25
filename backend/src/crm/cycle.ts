import { NiveauPermission, StatutCrm } from '@prisma/client';

// Cycle commercial d'un dossier CRM (étapes E et F, validées sept. 2026) :
//
//   nouveau_projet ──soumettre──▶ en_validation ──valider──▶ offre_envoyee ──onboarder──▶ onboard
//         ▲ ▲                          │                          │
//         │ └──────────renvoyer────────┘ (commentaire DAF)         │
//         └────────────────────refaire──────────────────────────────┘ (offre expirée)
//
//   nouveau_projet / en_validation / offre_envoyee ──perdre──▶ perdu  (motif obligatoire)
//   offre refusée par le client (lien public ou saisie) ──▶ perdu, automatiquement
//
// L'offre (étape F, un Devis rattaché au dossier) conditionne trois passages,
// contrôlés par CrmService : soumettre exige un brouillon avec au moins une
// ligne ; valider ENVOIE ce brouillon (numéro, lien, validité 7 j) ;
// onboarder exige une offre acceptée ; refaire exige qu'aucune offre ne soit
// en attente de réponse ou acceptée.
//
// onboard et perdu sont définitifs. Chaque action exige un niveau sur un
// module de la matrice : la DAF (CFO) n'a que la lecture sur le CRM, elle
// valide via `finances_devis: validation` — valider une offre, c'est engager
// un chiffrage (et donner `crm: validation` au CFO lui ouvrirait aussi la
// création de fiches, la matrice étant cumulative).
//
// MIROIR (libellés + règles d'affichage) : frontend/lib/cycle-crm.ts.

export const ACTIONS_CRM = ['soumettre', 'valider', 'renvoyer', 'onboarder', 'refaire', 'perdre'] as const;
export type ActionCrm = (typeof ACTIONS_CRM)[number];

export type RegleAction = {
  de: StatutCrm[];
  vers: StatutCrm;
  module: string;
  niveau: NiveauPermission;
  // Texte exigé avec l'action : motif (perdre) ou commentaire DAF (renvoyer).
  commentaireObligatoire: boolean;
};

export const REGLES_ACTIONS: Record<ActionCrm, RegleAction> = {
  soumettre: {
    de: ['nouveau_projet'],
    vers: 'en_validation',
    module: 'crm',
    niveau: 'ecriture',
    commentaireObligatoire: false,
  },
  valider: {
    de: ['en_validation'],
    vers: 'offre_envoyee',
    module: 'finances_devis',
    niveau: 'validation',
    commentaireObligatoire: false,
  },
  renvoyer: {
    de: ['en_validation'],
    vers: 'nouveau_projet',
    module: 'finances_devis',
    niveau: 'validation',
    commentaireObligatoire: true,
  },
  onboarder: {
    de: ['offre_envoyee'],
    vers: 'onboard',
    module: 'crm',
    niveau: 'ecriture',
    commentaireObligatoire: false,
  },
  // Offre expirée sans réponse : on repart pour une nouvelle offre plutôt
  // que de déclarer le dossier perdu (décision F — une absence de réponse
  // n'est pas un refus). Mêmes rôles que soumettre.
  refaire: {
    de: ['offre_envoyee'],
    vers: 'nouveau_projet',
    module: 'crm',
    niveau: 'ecriture',
    commentaireObligatoire: false,
  },
  perdre: {
    de: ['nouveau_projet', 'en_validation', 'offre_envoyee'],
    vers: 'perdu',
    module: 'crm',
    niveau: 'ecriture',
    commentaireObligatoire: true,
  },
};

// Contenu de la fiche modifiable seulement tant qu'elle n'a pas été soumise
// (règle validée) — le propriétaire, lui, reste réassignable à toute étape.
// Sert au futur formulaire Programme (étape D) et à l'affichage du verrou.
export function ficheModifiable(statut: StatutCrm): boolean {
  return statut === 'nouveau_projet';
}

// Motif posé automatiquement quand le client refuse l'offre (cf. DevisService).
export const MOTIF_REFUS_CLIENT = 'Offre refusée par le client.';

// Rôle dont les titulaires peuvent être propriétaires d'un dossier (« le
// responsable GC », décision sept. 2026). Comparaison sur Role.nom, comme
// ROLE_CIO (cf. societe-admin-ou-cio.guard.ts) : si le rôle est renommé dans
// Paramètres, ce fichier est le seul à mettre à jour.
export const ROLE_PROPRIETAIRE_DOSSIER = 'Dir. GC';

// La DAF (« CFO c'est DAF, je garde CFO » — le boss) : destinataire des
// dossiers soumis et des factures brouillon à l'Onboard. Même convention.
export const ROLE_DAF = 'CFO';
