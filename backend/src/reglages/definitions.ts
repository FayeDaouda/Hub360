import { GABARIT_GC_CONCEPTION } from './gabarit-gc-conception';
import type { ContenuGabarit } from './gabarit';

// Règles et délais, objectifs des indicateurs (Réglages CIO). Valeurs par
// défaut = celles de la maquette du boss (« En service »), jamais déduites.
// `appliquee` dit si le HUB s'en sert déjà : une règle pas encore branchée
// est affichée comme telle, pour qu'aucun changement ne paraisse avoir un
// effet qu'il n'a pas.

export type TypeValeur =
  | { type: 'entier'; min: number; max: number; unite?: string }
  | { type: 'parts'; cles: string[] } // somme = 100
  | { type: 'heures'; cles: string[] } // plusieurs durées nommées
  // enService : libellé affiché après « En service : » quand il diffère de l'option.
  | { type: 'choix'; options: { valeur: string; libelle: string; enService?: string }[] }
  | { type: 'texte'; max: number }
  | { type: 'dates' } // liste AAAA-MM-JJ
  | { type: 'pourcentage' } // 0 à 100, vide = à fixer
  | { type: 'zone' }; // { de, a } en %, vide = à fixer

export type DefinitionReglage = {
  cle: string;
  libelle: string;
  valeur: TypeValeur;
  defaut: unknown;
  aide: string;
  appliquee: boolean;
  propose?: string; // objectifs : valeur proposée, indicative
  // Seuil de gouvernance : chaque modification est notifiée au CEO (en plus
  // du journal), comme les coordonnées de paiement (revue Dir. GC, 21/10/2026).
  gouvernance?: boolean;
};

export const REGLES: DefinitionReglage[] = [
  {
    cle: 'budget_atelier_heures',
    libelle: 'Budget atelier (heures)',
    valeur: { type: 'entier', min: 8, max: 9999, unite: 'h' },
    defaut: 320,
    aide: "Fixe l'horizon J1 → livraison. S'applique aux projets ouverts ensuite ; les seuils de la note client suivent le budget.",
    appliquee: false,
  },
  {
    cle: 'parts_factures',
    libelle: 'Parts des factures F1 / F2 / F3 (%)',
    valeur: { type: 'parts', cles: ['F1', 'F2', 'F3'] },
    defaut: { F1: 40, F2: 40, F3: 20 },
    aide: "Somme égale à 100 %. S'applique aux offres rédigées ensuite ; une offre déjà soumise au CFO garde ses parts.",
    appliquee: true, // figées sur l'offre à sa soumission, appliquées à l'Onboard (factures)
  },
  {
    cle: 'ouverture_projet',
    libelle: 'Ouverture du projet',
    valeur: {
      type: 'choix',
      options: [{ valeur: 'emission_f1', libelle: "À l'émission de F1 (défaut)", enService: "à l'émission de F1" }],
    },
    defaut: 'emission_f1',
    aide: "Déclenche l'instanciation du gabarit (J1). Les projets déjà ouverts ne changent pas.",
    appliquee: false,
  },
  {
    cle: 'seuil_contresignature_ceo',
    libelle: 'Seuil de contresignature par le CEO (FCFA)',
    valeur: { type: 'entier', min: 0, max: 100_000_000_000, unite: 'FCFA' },
    defaut: 50_000_000,
    aide: "Au-delà de ce montant TTC, seul le CEO contresigne le devis accepté ; en deçà, l'Architecte DPLG.",
    appliquee: true, // signataire du contrat choisi à sa préparation (contrats.service)
    gouvernance: true,
  },
  {
    cle: 'pilote_etudes',
    libelle: 'Pilote des études (05)',
    valeur: {
      type: 'choix',
      options: [
        {
          valeur: 'architecte_dplg',
          libelle: 'Architecte DPLG (défaut)',
          enService: 'Architecte DPLG (Head of Engineering à recruter)',
        },
        { valeur: 'head_of_engineering', libelle: 'Head of Engineering (à recruter)' },
      ],
    },
    defaut: 'architecte_dplg',
    aide: "Reçoit les commandes, le suivi des BET et les retards EXTERNES. S'applique aux projets ouverts ensuite.",
    appliquee: false,
  },
  {
    cle: 'delai_levee_reserves_jours',
    libelle: 'Délai de levée de réserves (jours ouvrés)',
    valeur: { type: 'entier', min: 1, max: 365, unite: 'j' },
    defaut: 5,
    aide: 'Échéance donnée au BET ou au client pour lever des réserves (visa BC, instruction).',
    appliquee: false,
  },
  {
    cle: 'alerte_avenant_jours',
    libelle: 'Alerte avenant non accepté (jours)',
    valeur: { type: 'entier', min: 1, max: 365, unite: 'j' },
    defaut: 7,
    aide: "Au-delà, l'avenant (TS) non accepté par le client déclenche une alerte et une échéance dépassée au registre.",
    appliquee: true, // alerte sur l'avenant (Facturation) et échéance au registre (Pilotage)
  },
  {
    cle: 'charges_gc_heures',
    libelle: 'Charges Grey Concrete (heures)',
    valeur: { type: 'heures', cles: ['Notice', 'Cachet', 'Timbre'] },
    defaut: { Notice: 2, Cachet: 1, Timbre: 1 },
    aide: 'Temps atelier des charges du dossier de dépôt. Les montants restent chez le CFO.',
    appliquee: false,
  },
  {
    cle: 'outil_rendu',
    libelle: 'Outil de rendu (libellé)',
    valeur: { type: 'texte', max: 60 },
    defaut: 'B-render',
    aide: 'Rubrique Rendus des sources natives (point ouvert 5).',
    appliquee: false,
  },
  {
    cle: 'jours_feries',
    libelle: 'Jours fériés',
    valeur: { type: 'dates' },
    defaut: [],
    aide: "Retirés du calendrier ouvrable de tous les projets, en cours compris : une échéance qui traverse un jour férié recule d'un jour.",
    appliquee: true, // temps de travail (lot 4) et décompte des congés (lot 2)
  },
  {
    cle: 'plafond_report_conges',
    libelle: 'Plafond de report des congés (jours)',
    valeur: { type: 'entier', min: 0, max: 60, unite: 'j' },
    defaut: 0,
    aide: "Congés payés non pris reportés sur l'année suivante, au plus ce nombre de jours (report plafonné, décision du 19/10/2026). 0 = aucun report. Compté à partir de 2026.",
    appliquee: true, // solde de « Congés et absences » (regles-conges.ts)
  },
  {
    cle: 'alerte_fin_cdd_jours',
    libelle: 'Alerte fin de CDD ou de stage (jours avant)',
    valeur: { type: 'entier', min: 1, max: 365, unite: 'j' },
    defaut: 30,
    aide: "Une fin de CDD ou de stage entre dans « À traiter aujourd'hui » de la RH ce nombre de jours avant (décision du 20/10/2026).",
    appliquee: true,
  },
  {
    cle: 'alerte_fin_essai_jours',
    libelle: "Alerte fin de période d'essai (jours avant)",
    valeur: { type: 'entier', min: 1, max: 90, unite: 'j' },
    defaut: 15,
    aide: "Pour confirmer ou rompre à temps : la fin de période d'essai entre dans « À traiter aujourd'hui » de la RH ce nombre de jours avant.",
    appliquee: true,
  },
  {
    cle: 'alerte_echeance_rh_jours',
    libelle: "Alerte pièce d'identité et visite médicale (jours avant)",
    valeur: { type: 'entier', min: 1, max: 180, unite: 'j' },
    defaut: 30,
    aide: "Expiration de la pièce d'identité, prochaine visite médicale : alerte RH ce nombre de jours avant (et tant qu'elles sont dépassées).",
    appliquee: true,
  },
  {
    cle: 'relance_demandes_jours',
    libelle: 'Relance des demandes en attente (jours ouvrés)',
    valeur: { type: 'entier', min: 1, max: 30, unite: 'j' },
    defaut: 3,
    aide: 'Absence, remboursement ou attestation sans décision : relance à 7 h au N+1 ou à la RH après ce nombre de jours ouvrés, puis à chaque nouveau palier (décision du 20/10/2026).',
    appliquee: true,
  },
  {
    cle: 'seuil_validation_avoir_ceo',
    libelle: "Seuil de validation d'un avoir par le CEO (FCFA TTC)",
    valeur: { type: 'entier', min: 0, max: 100_000_000_000, unite: 'FCFA' },
    defaut: 1_000_000,
    aide: 'Tout avoir exige un motif et prévient le CEO ; au-delà de ce montant TTC, le CEO le valide avant émission (revue CFO, 20/10/2026).',
    appliquee: true,
    gouvernance: true,
  },
  {
    cle: 'seuil_ts_cto_ht',
    libelle: "Seuil de validation d'un TS par le CTO (FCFA HT)",
    valeur: { type: 'entier', min: 0, max: 100_000_000_000, unite: 'FCFA' },
    defaut: 500_000,
    aide: "Un travail supplémentaire chiffré au-delà de ce montant HT (reprise majeure, nouvelle planche) est validé par le CTO avant d'être ajouté ; en deçà, le Dir. GC l'ajoute (revue Dir. GC, 21/10/2026).",
    appliquee: true,
    gouvernance: true,
  },
  {
    cle: 'rappel_reporting_jours_avant',
    libelle: 'Rappel du reporting mensuel (jours avant le dépôt)',
    valeur: { type: 'entier', min: 1, max: 10, unite: 'j' },
    defaut: 3,
    aide: "L'émetteur d'un reporting (Dir. GC, RH) est rappelé ce nombre de jours avant la date de dépôt (le 5), puis relancé chaque semaine en cas de retard ; le destinataire est prévenu du retard une fois (revue Dir. GC, 21/10/2026).",
    appliquee: true,
  },
  {
    cle: 'rappel_cloture_jour',
    libelle: 'Rappel de clôture mensuelle (jour du mois suivant)',
    valeur: { type: 'entier', min: 1, max: 28, unite: 'j' },
    defaut: 5,
    aide: 'À partir de ce jour, le CFO est relancé chaque semaine tant que le mois précédent n’est pas clôturé (revue CFO, 20/10/2026).',
    appliquee: true,
  },
  {
    cle: 'signalement_rh_apres_relances',
    libelle: 'Absence signalée à la RH après N relances du N+1 sans réponse',
    valeur: { type: 'entier', min: 1, max: 10, unite: 'relances' },
    defaut: 2,
    aide: "Le N+1 n'a pas répondu après ce nombre de relances : la demande est signalée aussi à la RH (au CEO si la demandeuse est la RH), une seule fois (revue RH validée, 20/10/2026).",
    appliquee: true,
  },
];

export const OBJECTIFS: DefinitionReglage[] = [
  {
    cle: 'objectif_nouveaux_projets',
    libelle: 'Nouveaux projets de conception par mois',
    valeur: { type: 'entier', min: 0, max: 999 },
    defaut: 4,
    aide: 'Manuel §7.2 : 4 par mois.',
    appliquee: true,
  },
  {
    cle: 'objectif_conversion_chantier',
    libelle: 'Conversion en suivi de chantier (%)',
    valeur: { type: 'pourcentage' },
    defaut: 50,
    aide: 'Manuel §7.2 : 50 %.',
    appliquee: true,
  },
  {
    cle: 'objectif_taches_a_temps',
    libelle: 'Tâches validées à temps (%)',
    valeur: { type: 'pourcentage' },
    defaut: 90, // validé le 14/10/2026
    aide: "Remise validée comparée à l'échéance de référence. 90 % minimum.",
    appliquee: true,
  },
  {
    cle: 'objectif_charge_equipes',
    libelle: 'Charge des équipes : zone (%)',
    valeur: { type: 'zone' },
    defaut: { de: 70, a: 100 }, // validé le 14/10/2026
    aide: 'Temps standard des tâches assignées rapporté aux heures disponibles. Zone normale : 70 à 100 %.',
    appliquee: true,
  },
  {
    cle: 'objectif_taux_reprises',
    libelle: 'Taux de reprises : seuil maximum (%)',
    valeur: { type: 'pourcentage' },
    defaut: 20, // validé le 14/10/2026
    aide: 'Part des tâches validées ayant eu au moins une reprise. 20 % au plus.',
    appliquee: true,
  },
];

// Réglages définis par société (slug) : seule Grey Concrete a les siens
// (maquette du boss). Une autre société n'a pas de réglages tant qu'ils ne
// sont pas fournis — rien n'est extrapolé.
export const GABARITS_PAR_SOCIETE: Record<string, { code: string; contenu: ContenuGabarit }[]> = {
  'grey-concrete': [{ code: 'GC-CONCEPTION', contenu: GABARIT_GC_CONCEPTION }],
};

// Valide et normalise une valeur saisie ; lève une Error lisible sinon.
export function normaliser(def: DefinitionReglage, v: unknown): unknown {
  const t = def.valeur;
  const nombre = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const refus = (m: string) => {
    throw new Error(`${def.libelle} : ${m}`);
  };
  switch (t.type) {
    case 'entier':
      if (!nombre(v) || !Number.isInteger(v) || (v as number) < t.min || (v as number) > t.max)
        refus(`entier de ${t.min} à ${t.max} attendu.`);
      return v;
    case 'parts': {
      const o = (v ?? {}) as Record<string, unknown>;
      if (!t.cles.every((k) => nombre(o[k]) && Number.isInteger(o[k]) && (o[k] as number) >= 0))
        refus('parts entières positives attendues.');
      if (t.cles.reduce((s, k) => s + (o[k] as number), 0) !== 100) refus('la somme des parts doit faire 100 %.');
      return Object.fromEntries(t.cles.map((k) => [k, o[k]]));
    }
    case 'heures': {
      const o = (v ?? {}) as Record<string, unknown>;
      if (!t.cles.every((k) => nombre(o[k]) && (o[k] as number) >= 0 && (o[k] as number) <= 999))
        refus('durées en heures attendues.');
      return Object.fromEntries(t.cles.map((k) => [k, o[k]]));
    }
    case 'choix':
      if (!t.options.some((o) => o.valeur === v)) refus('choix inconnu.');
      return v;
    case 'texte':
      if (typeof v !== 'string' || !v.trim() || v.trim().length > t.max)
        refus(`texte de 1 à ${t.max} caractères attendu.`);
      return (v as string).trim();
    case 'dates': {
      if (
        !Array.isArray(v) ||
        !v.every(
          (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)),
        )
      ) {
        refus('dates AAAA-MM-JJ attendues.');
      }
      return [...new Set(v as string[])].sort();
    }
    case 'pourcentage':
      if (v === null) return null;
      if (!nombre(v) || (v as number) < 0 || (v as number) > 100)
        refus('pourcentage de 0 à 100 attendu (vide = à fixer).');
      return v;
    case 'zone': {
      if (v === null) return null;
      const z = v as { de?: unknown; a?: unknown };
      if (
        !nombre(z?.de) ||
        !nombre(z?.a) ||
        (z.de as number) < 0 ||
        (z.a as number) > 200 ||
        (z.de as number) > (z.a as number)
      ) {
        refus('zone « de … à … » en % attendue (vide = à fixer).');
      }
      return { de: z.de, a: z.a };
    }
  }
}
