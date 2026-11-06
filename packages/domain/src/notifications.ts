// Notifications (02/11/2026) : la catégorie de chaque type et les préférences
// de chacun — une seule écriture pour le serveur (envoi système, heures
// calmes) et l'écran (pop-ups, son, compteur).

export const CATEGORIES_NOTIFICATION = ['decisions', 'mentions', 'messagerie', 'informations'] as const;
export type CategorieNotification = (typeof CATEGORIES_NOTIFICATION)[number];

export const LIBELLES_CATEGORIE: Record<CategorieNotification, { libelle: string; aide: string }> = {
  decisions: { libelle: 'Décisions à prendre', aide: 'Valider, approuver, trancher, relances' },
  mentions: { libelle: 'Mentions', aide: 'Quand on vous cite avec @ dans une conversation ou un fil' },
  messagerie: { libelle: 'Messagerie', aide: 'Nouveaux messages, ajout à un groupe' },
  informations: { libelle: 'Informations', aide: 'Tout le reste : suivi, décisions prises, annonces' },
};

// Ce qui demande une action du destinataire (onglet « Décisions » de la cloche).
const TYPES_DECISION = new Set([
  'prolongation_demandee',
  'dossier_soumis',
  'dossier_renvoye',
  'rappel_offre',
  'rappel_facture',
  'rappel_tache',
  'avenant_ts',
  'signalement_recu',
  'tache_remise',
  'tache_renvoyee',
  'absence_a_decider',
  'remboursement_a_traiter',
  'decision_assignee',
  'ecart_temps_signale',
  'rappel_demande',
  'salaire_a_valider',
  'avoir_a_valider',
  'cloture_a_faire',
  'reporting_question',
  'reporting_a_deposer',
  'reporting_en_retard',
  'ts_a_valider',
  'demande_droit_a_valider',
  'visa_a_apposer',
  'arrivant_a_affecter',
  'rappel_decision',
  'decision_proposee',
  'commission_a_payer',
  'facture_a_valider',
  'fiche_a_completer',
  'attente_ceo',
  'annonce_a_valider',
  'poste_a_approuver',
  'candidature_recue',
]);

export function categorieNotification(type: string, derivee = false): CategorieNotification {
  if (type === 'mention_chat' || type === 'mention_projet') return 'mentions';
  if (type === 'groupe_chat' || type === 'message_chat') return 'messagerie';
  return derivee || TYPES_DECISION.has(type) ? 'decisions' : 'informations';
}

export type CanauxCategorie = { popup: boolean; son: boolean; systeme: boolean };
export type PreferencesNotifications = {
  categories: Record<CategorieNotification, CanauxCategorie>;
  // Heures calmes : ni son ni notification système (les pop-ups restent, silencieux).
  calme: { actif: boolean; debut: string; fin: string }; // « 20:00 » → « 07:00 »
};

export const PREFERENCES_PAR_DEFAUT: PreferencesNotifications = {
  categories: {
    decisions: { popup: true, son: true, systeme: true },
    mentions: { popup: true, son: true, systeme: true },
    messagerie: { popup: true, son: true, systeme: true },
    informations: { popup: true, son: true, systeme: true },
  },
  calme: { actif: false, debut: '20:00', fin: '07:00' },
};

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Préférences lues (base, session) complétées des valeurs par défaut.
export function normaliserPreferences(brut: unknown): PreferencesNotifications {
  const p = (brut ?? {}) as Partial<PreferencesNotifications>;
  const categories = { ...PREFERENCES_PAR_DEFAUT.categories };
  for (const c of CATEGORIES_NOTIFICATION) {
    const v = p.categories?.[c] as Partial<CanauxCategorie> | undefined;
    categories[c] = {
      popup: typeof v?.popup === 'boolean' ? v.popup : true,
      son: typeof v?.son === 'boolean' ? v.son : true,
      systeme: typeof v?.systeme === 'boolean' ? v.systeme : true,
    };
  }
  const calme = p.calme ?? PREFERENCES_PAR_DEFAUT.calme;
  return {
    categories,
    calme: {
      actif: !!calme.actif,
      debut: HEURE.test(calme.debut ?? '') ? calme.debut : PREFERENCES_PAR_DEFAUT.calme.debut,
      fin: HEURE.test(calme.fin ?? '') ? calme.fin : PREFERENCES_PAR_DEFAUT.calme.fin,
    },
  };
}

// En heures calmes, à l'heure de Dakar (UTC, sans heure d'été) ; la plage peut
// passer minuit (20:00 → 07:00).
export function enHeuresCalmes(p: PreferencesNotifications, maintenant: Date = new Date()): boolean {
  if (!p.calme.actif || p.calme.debut === p.calme.fin) return false;
  const minutes = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  const [d, f] = [p.calme.debut, p.calme.fin].map((h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)));
  return d < f ? minutes >= d && minutes < f : minutes >= d || minutes < f;
}
