import { BookUser, History, LayoutGrid, LifeBuoy, ShieldCheck, Users, type LucideIcon } from 'lucide-react';

// Sections de l'Administration du HUB (refonte du 07/11/2026) : rangées en
// trois groupes dans le menu latéral, chacune joignable par son adresse
// (/groupe?onglet=droits) — rechargement, lien direct, capture.

export type SectionConsole = 'comptes' | 'droits' | 'modules' | 'annuaire' | 'journal' | 'deblocages';

export type DefinitionSection = {
  cle: SectionConsole;
  libelle: string;
  icone: LucideIcon;
  // « societe » : la section porte sur la société de connexion (affichée
  // dans l'en-tête) ; « groupe » : sur toutes les sociétés.
  portee: 'groupe' | 'societe';
  description: (societe: string) => string;
};

export type GroupeSections = { libelle: string; sections: DefinitionSection[] };

export const GROUPES_CONSOLE: GroupeSections[] = [
  {
    libelle: 'Personnes',
    sections: [
      {
        cle: 'comptes',
        portee: 'groupe',
        libelle: 'Comptes & rôles',
        icone: Users,
        description: () =>
          'Les comptes de toutes les sociétés du groupe. Créez-les depuis les dossiers RH et attribuez à chacun son rôle dans sa société. Le salaire se renseigne dans le dossier RH.',
      },
      {
        cle: 'droits',
        portee: 'societe',
        libelle: 'Droits des rôles',
        icone: ShieldCheck,
        description: (societe) =>
          `Ce que chaque rôle peut voir, créer, valider ou supprimer dans ${societe}, module par module et étape par étape.`,
      },
    ],
  },
  {
    libelle: 'Plateforme',
    sections: [
      {
        cle: 'modules',
        portee: 'societe',
        libelle: 'Modules',
        icone: LayoutGrid,
        description: (societe) =>
          `Activez ou coupez chaque module pour ${societe}, et fermez le HUB pour maintenance. Chaque bascule exige un motif et entre au journal d’audit.`,
      },
      {
        cle: 'annuaire',
        portee: 'societe',
        libelle: 'Annuaire',
        icone: BookUser,
        description: (societe) =>
          `Ce que voient les salariés de ${societe} dans leur annuaire : leur société, plus la direction du groupe, ou tout le groupe. Seuls les champs d’annuaire (dont le téléphone professionnel) sont montrés. Chaque changement exige un motif et entre au journal d’audit.`,
      },
    ],
  },
  {
    libelle: 'Contrôle',
    sections: [
      {
        cle: 'journal',
        portee: 'societe',
        libelle: 'Journal d’audit',
        icone: History,
        description: () => 'Qui a fait quoi, et quand : comptes, droits, finances, réglages, paie, interventions.',
      },
      {
        cle: 'deblocages',
        portee: 'societe',
        libelle: 'Déblocages',
        icone: LifeBuoy,
        description: () =>
          'Retrouvez un dossier ou un projet par son code pour faire ce que le parcours normal ne permet pas. Chaque intervention exige un motif et entre au journal d’audit.',
      },
    ],
  },
];

export const SECTION_PAR_DEFAUT: SectionConsole = 'comptes';

const SECTIONS = GROUPES_CONSOLE.flatMap((g) => g.sections.map((s) => ({ ...s, groupe: g.libelle })));

// Anciennes adresses encore valables (liens enregistrés) : « Interrupteurs »
// a rejoint « Modules » (08/11/2026).
const ALIAS: Record<string, SectionConsole> = { interrupteurs: 'modules' };

/** La section demandée par `?onglet=`, sinon celle par défaut (valeur inconnue comprise). */
export function sectionDepuisParametre(valeur: string | null): SectionConsole {
  if (valeur && Object.hasOwn(ALIAS, valeur)) return ALIAS[valeur];
  return SECTIONS.find((s) => s.cle === valeur)?.cle ?? SECTION_PAR_DEFAUT;
}

/** Définition et groupe d'une section. */
export function definitionSection(cle: SectionConsole): DefinitionSection & { groupe: string } {
  return SECTIONS.find((s) => s.cle === cle) ?? SECTIONS[0];
}

/** Adresse d'une section : la section par défaut garde l'adresse nue. */
export function lienSection(cle: SectionConsole): string {
  return cle === SECTION_PAR_DEFAUT ? '/groupe' : `/groupe?onglet=${cle}`;
}
