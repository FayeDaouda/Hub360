import { ETAPE, type Right } from '@hub/domain';

// Catalogue des étapes de la matrice des droits (31/10/2026) : chaque bouton
// du HUB dépend d'une seule étape et d'un seul droit. Un module absent d'ici
// garde une seule étape, « Ensemble du module » (même clé que le module) ;
// les lots par module le découpent ici. Un droit sans phrase est « sans
// objet » pour l'étape et n'est jamais accordé.
//
// Les bases déjà en service reçoivent les étapes par migration (avec les
// droits de départ) ; une installation neuve par le socle (prisma/socle.ts).

export type EtapeCatalogue = {
  module: string;
  cle: string;
  nom: string;
  ordre: number;
  libelles: Partial<Record<Right, string>>;
};

export const LIBELLES_MODULE: Partial<Record<Right, string>> = {
  lecture: 'Voit les écrans et les informations du module',
  ecriture: 'Crée et modifie',
  validation: 'Valide, émet, paie, signe : les actes qui engagent',
  suppression: 'Supprime ou archive, de façon récupérable',
};

// Clés partagées avec l'écran (@hub/domain).
export { ETAPE };

export const ETAPES_DETAILLEES: EtapeCatalogue[] = [
  // CRM (lot 2, 31/10/2026).
  {
    module: 'crm',
    cle: ETAPE.crmDossiers,
    nom: 'Dossiers et leads',
    ordre: 0,
    libelles: {
      lecture: 'Voit le registre des dossiers et leurs fiches',
      ecriture: 'Crée un lead, complète sa fiche, refait une offre, déclare un dossier perdu',
      suppression: 'Archive ou désarchive un lead encore en « Nouveau projet »',
    },
  },
  // Le bouton « Soumettre au CFO » seul (décision du 31/10/2026) : il se
  // donne sans la création ni la modification des leads.
  {
    module: 'crm',
    cle: ETAPE.crmSoumission,
    nom: 'Soumission au CFO',
    ordre: 1,
    libelles: {
      ecriture: 'Soumet un dossier au CFO pour validation de l’offre ; la fiche se fige',
    },
  },
  {
    module: 'crm',
    cle: ETAPE.crmProprietaire,
    nom: 'Propriétaire du dossier',
    ordre: 2,
    libelles: {
      lecture: 'Voit qui suit chaque dossier',
      ecriture: 'Réassigne un dossier à un autre Dir. GC',
    },
  },
  {
    module: 'crm',
    cle: ETAPE.crmApporteur,
    nom: 'Fiche apporteur',
    ordre: 3,
    libelles: {
      lecture: 'Voit l’apporteur d’affaire et sa commission',
      ecriture: 'Modifie la fiche apporteur après la création du dossier',
    },
  },
  {
    module: 'crm',
    cle: ETAPE.crmTotaux,
    nom: 'Totaux du pipeline',
    ordre: 4,
    libelles: {
      lecture: 'Voit les montants HT par étape du pipeline, sans le détail des offres',
    },
  },

  // Finances (lot 3, 31/10/2026). Les étapes principales gardent la clé de
  // leur module (finances_devis…), lue partout dans le HUB.
  {
    module: 'finances_devis',
    cle: ETAPE.financesOffres,
    nom: 'Offres et devis',
    ordre: 0,
    libelles: {
      lecture: 'Voit les offres, les devis et leurs montants',
      ecriture: 'Rédige et modifie une offre, enregistre la réponse du client, relance',
      validation: 'Valide ou renvoie une offre soumise, l’envoie au client',
      suppression: 'Supprime une offre ou un devis en brouillon',
    },
  },
  {
    module: 'finances_devis',
    cle: ETAPE.financesContresignature,
    nom: 'Contresignature au-delà du seuil',
    ordre: 1,
    libelles: {
      validation:
        'Valide seul les offres, devis et factures au-delà du seuil de contresignature (et seulement celles-là), décide des avoirs',
    },
  },
  {
    module: 'finances_devis',
    cle: ETAPE.financesCatalogue,
    nom: 'Catalogue produits et services',
    ordre: 2,
    libelles: {
      lecture: 'Voit les prestations et leurs tarifs',
      ecriture: 'Ajoute ou modifie une prestation et ses tarifs',
      suppression: 'Retire une prestation du catalogue',
    },
  },
  {
    module: 'finances_factures',
    cle: ETAPE.financesFactures,
    nom: 'Factures',
    ordre: 0,
    libelles: {
      lecture: 'Voit les factures, les échéanciers et les relances',
      ecriture: 'Prépare une facture, un échéancier, des mensualités, relance un client',
      validation: 'Émet une facture (numéro définitif) ou un avoir',
      suppression: 'Supprime une facture en brouillon',
    },
  },
  {
    module: 'finances_factures',
    cle: ETAPE.financesEncaissements,
    nom: 'Encaissements',
    ordre: 1,
    libelles: {
      lecture: 'Voit les paiements reçus',
      validation: 'Enregistre un paiement reçu',
      suppression: 'Annule un paiement enregistré',
    },
  },
  {
    module: 'finances_factures',
    cle: ETAPE.financesCloture,
    nom: 'Clôture du mois',
    ordre: 2,
    libelles: {
      lecture: 'Voit les mois clôturés',
      validation: 'Clôture un mois terminé : ses factures et paiements sont figés',
      suppression: 'Rouvre un mois clôturé, avec un motif',
    },
  },
  {
    module: 'finances_factures',
    cle: ETAPE.financesParametres,
    nom: 'Paramètres de facturation',
    ordre: 3,
    libelles: {
      lecture: 'Voit la numérotation et le profil de facturation',
      ecriture: 'Modifie la numérotation des factures et le profil de facturation',
    },
  },
  // Lot 4 (Holding, 31/10/2026) : vue consolidée de toutes les sociétés.
  {
    module: 'finances_factures',
    cle: ETAPE.financesGroupe,
    nom: 'Finances du groupe',
    ordre: 4,
    libelles: {
      lecture: 'Voit les finances consolidées de toutes les sociétés du groupe (facturé, encaissé, à encaisser)',
    },
  },
  {
    module: 'finances_marges',
    cle: ETAPE.financesMarges,
    nom: 'Marges et rentabilité',
    ordre: 0,
    libelles: {
      lecture: 'Voit la rentabilité des projets (taux) et la feuille de temps chiffrée',
    },
  },
  {
    module: 'finances_marges',
    cle: ETAPE.financesRentabiliteDetail,
    nom: 'Rentabilité en montants',
    ordre: 1,
    libelles: {
      lecture: 'Voit les montants (pas seulement le taux) et le coût par salarié',
      ecriture: 'Modifie les paramètres de rentabilité',
    },
  },
  {
    module: 'finances_charges',
    cle: ETAPE.financesCharges,
    nom: 'Charges',
    ordre: 0,
    libelles: {
      lecture: 'Voit les charges et les bureaux d’études à régler',
      validation: 'Règle un bureau d’études',
    },
  },
  {
    module: 'finances_charges',
    cle: ETAPE.financesCommissions,
    nom: 'Commissions des apporteurs',
    ordre: 1,
    libelles: {
      lecture: 'Voit les commissions dues et versées',
      ecriture: 'Saisit ou modifie les coordonnées de paiement d’un apporteur',
      validation: 'Paie une commission',
    },
  },
];
