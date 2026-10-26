import type { NiveauPermission } from './types';

// Guide d'aide intégré (bouton « Aide » de la barre du haut) : une fiche par
// section du HUB, lue selon les droits RÉELS de la personne connectée (même
// règles que la sidebar, cf. acces-back-office.ts) — aucun texte par rôle
// écrit à la main, donc rien qui puisse contredire la matrice.

export type FicheAide = {
  titre: string;
  resume: string;
  // Ce que permet chaque niveau de la matrice (cumulatif : écriture inclut lecture).
  actions: Partial<Record<Exclude<NiveauPermission, 'aucun'>, string>>;
  // Gestes et raccourcis de la page (hors de la page elle-même, pour ne pas
  // l'encombrer).
  astuces?: string[];
};

export const FICHES_AIDE: Record<string, FicheAide> = {
  'mes-taches': {
    titre: 'Mes tâches',
    resume:
      'Ce que vous avez à faire, par urgence : tâches en retard (reprises comprises), à reprendre, à rendre cette semaine, puis vos remises en attente de validation. Une mention non lue s’affiche sur la ligne de sa tâche. « Déposer » envoie la tâche à votre N+1, avec fichiers et commentaire si besoin ; « Demander un délai » lui demande une prolongation.',
    actions: {},
    astuces: [
      'Glissez un fichier sur une tâche pour la déposer.',
      'Clavier : J et K pour passer d’une tâche à l’autre, Entrée pour l’ouvrir, D pour la déposer.',
    ],
  },
  'tableau-de-bord': {
    titre: 'Pilotage',
    resume: 'Indicateurs du mois et leurs objectifs, reportings mensuels, registre des décisions.',
    actions: {
      lecture:
        'Consulter les indicateurs, les reportings et les décisions. Selon votre fonction, vous déposez un reporting (avec votre analyse) ou saisissez les décisions du registre.',
    },
  },
  crm: {
    titre: 'CRM',
    resume:
      'Registre des projets de l’année, de la prise de contact à la signature : fiche programme, offre, validation CFO, envoi au client.',
    actions: {
      lecture: 'Consulter le registre et la fiche de chaque dossier.',
      ecriture: 'Créer un nouveau projet, compléter sa fiche sous 72 h, préparer l’offre et la soumettre au CFO.',
      validation: 'Valider les offres soumises et les envoyer au client.',
    },
  },
  projets: {
    titre: 'Projets',
    resume:
      'Projets ouverts selon le gabarit : cartes et tâches datées, remises (v01, v02… avec fichiers), validation ou reprise, prolongations, éléments en TS, fils de discussion.',
    actions: {
      lecture:
        'Consulter les projets (pour un salarié : ceux où il a une tâche), commenter dans les fils, déposer ses tâches et demander un délai.',
      ecriture: 'Assigner les tâches, à la tâche ou à toute une carte.',
    },
  },
  facturation: {
    titre: 'Finances',
    resume: 'Devis, factures et paiements, tableau de bord, grille tarifaire, feuille de temps.',
    actions: {
      lecture: 'Consulter les devis et factures, les imprimer en PDF, exporter les listes vers Excel.',
      ecriture: 'Préparer devis et factures, enregistrer les paiements.',
      validation: 'Valider les factures (émission) et les offres.',
    },
  },
  rh: {
    titre: 'RH',
    resume:
      'Dossiers du personnel, demandes (absences, remboursements, attestations), intégration des arrivants, feuilles de temps.',
    actions: {
      lecture: 'Consulter les dossiers et les feuilles de temps.',
      ecriture:
        'Tenir les dossiers et leurs pièces, déposer les bulletins, traiter les demandes, contrôler les feuilles de temps (après avoir répondu aux écarts signalés par les salariés), enregistrer un départ (ses tâches sont alors confiées à un collègue).',
    },
  },
  equipe: {
    titre: 'Équipes',
    resume: 'Cellules de travail, leur chef de team et les collaborateurs affectés.',
    actions: {
      lecture: 'Consulter l’organisation des équipes.',
      ecriture: 'Créer les cellules et réaffecter les collaborateurs.',
    },
  },
  'mon-espace': {
    titre: 'Mon espace',
    resume:
      'Votre espace personnel, en deux blocs. Mon travail : performances, temps, cellule et, si vous êtes N+1, « À valider ». Mon dossier : congés et absences, remboursements santé, informations, documents (bulletins, attestations).',
    actions: {},
  },
  parametres: {
    titre: 'Réglages',
    resume:
      'Administration du HUB : gabarit versionné, règles et délais, objectifs des indicateurs, journal des modifications, signalements ; rôles, localités et contrats.',
    actions: {},
  },
};

// Repères valables pour tous les comptes.
export const REPERES_AIDE = [
  'Rechercher un projet, un collègue ou tout ce que vos droits vous ouvrent : la loupe en haut, ou Ctrl K (⌘K sur Mac).',
  'La cloche réunit vos notifications ; chaque matin à 7 h, le HUB y ajoute les rappels du jour (tâches à rendre, relances, factures échues).',
  'Les listes Factures, Devis, CRM, RH et Feuilles de temps s’exportent vers Excel, filtres compris.',
  'Un problème, une question, une idée : « Signaler un problème » ci-dessous. La page où vous êtes est jointe automatiquement.',
];

export function phraseNiveau(fiche: FicheAide, niveau: NiveauPermission): string[] {
  const ordre = ['lecture', 'ecriture', 'validation'] as const;
  const rang = ordre.indexOf(niveau as (typeof ordre)[number]);
  return ordre.filter((n, i) => i <= rang && fiche.actions[n]).map((n) => fiche.actions[n]!);
}
