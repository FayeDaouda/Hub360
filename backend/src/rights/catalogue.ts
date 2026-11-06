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
];
