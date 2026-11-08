// Catalogue des modules du HUB (liste du boss, 31/10/2026 ; statuts du lot 0,
// relus avec le code) : ce qui est en service, en partie, ou à venir, et le
// module de la matrice qui le porte quand il existe — c'est lui qu'on active
// ou coupe par société (interrupteurs). Les modules « à venir » n'ont pas de
// case dans la matrice : elle n'apparaît qu'une fois le module construit.

export type StatutModule = 'en_service' | 'en_partie' | 'a_venir';
export type ModuleCatalogue = { nom: string; statut: StatutModule; module?: string; note?: string };
export type FamilleModules = { nom: string; modules: ModuleCatalogue[] };

const avenir = (...noms: string[]): ModuleCatalogue[] => noms.map((nom) => ({ nom, statut: 'a_venir' }));

export const CATALOGUE_MODULES: FamilleModules[] = [
  {
    nom: 'Socle (toutes les sociétés)',
    modules: [
      { nom: 'Tableau de bord', statut: 'en_service', module: 'pilotage', note: 'Accueil et Pilotage' },
      { nom: 'Messagerie interne', statut: 'en_service', module: 'communication' },
      { nom: 'Documents partagés', statut: 'a_venir', module: 'documents', note: 'Case prête, pas encore d’écran' },
      { nom: 'Annuaire', statut: 'en_partie', note: 'Fiche contact, recherche Ctrl+K' },
      { nom: 'Mon espace RH', statut: 'en_service', note: 'Chacun ses propres données, hors matrice' },
      { nom: 'Agenda et réunions', statut: 'en_service', module: 'agenda' },
      { nom: 'Tâches et suivi d’actions', statut: 'en_service', module: 'projets', note: 'Mes tâches' },
      { nom: 'Notifications et alertes', statut: 'en_service', note: 'Cloche, alertes d’échéance' },
      { nom: 'Recherche globale', statut: 'en_service', note: 'Ctrl+K' },
      { nom: 'Actualités et annonces', statut: 'en_service', module: 'annonces' },
    ],
  },
  {
    nom: 'RH',
    modules: [
      { nom: 'Temps et pointage', statut: 'en_service', module: 'rh', note: 'Feuilles de temps' },
      { nom: 'Notes de frais', statut: 'en_partie', module: 'rh', note: 'Demandes de remboursement' },
      { nom: 'Validation congés et temps', statut: 'en_service', module: 'rh' },
      { nom: 'Performance équipe', statut: 'en_partie', module: 'equipe', note: 'Indicateurs, charge des équipes' },
      { nom: 'Recrutement', statut: 'en_service', module: 'recrutement' },
      { nom: 'Gestion RH (dossiers, contrats)', statut: 'en_service', module: 'rh' },
      { nom: 'Formation et habilitations', statut: 'a_venir' },
      { nom: 'Paie', statut: 'en_partie', module: 'rh', note: 'Salaires, bulletins déposés (pas de calcul)' },
      { nom: 'Dotations et EPI', statut: 'a_venir' },
      { nom: 'Planning des équipes', statut: 'en_partie', module: 'equipe', note: 'Calendrier des absences' },
      ...avenir(
        'Organigramme',
        'Mobilité inter-sociétés',
        'Santé et sécurité (visites médicales, accidents)',
        'Discipline et relations sociales',
      ),
      { nom: 'Onboarding et offboarding', statut: 'en_partie', module: 'rh', note: 'Intégration des arrivées' },
    ],
  },
  {
    nom: 'Métier : immobilier et construction',
    modules: [
      { nom: 'CRM et projets', statut: 'en_service', module: 'crm' },
      { nom: 'DCE, CCTP et métrés', statut: 'en_partie', module: 'projets', note: 'Blocs d’exécution' },
      { nom: 'Chantier et incidents', statut: 'a_venir' },
      { nom: 'Études de faisabilité et programmation', statut: 'en_service', module: 'projets' },
      { nom: 'Suivi des permis et autorisations', statut: 'en_service', module: 'projets' },
      ...avenir('Planning de travaux', 'Suivi d’avancement chantier', 'Réception et levée de réserves'),
      ...avenir('Sous-traitants et fournisseurs'),
      { nom: 'Bureaux d’études et consultations', statut: 'en_partie', module: 'projets', note: 'Blocs Études' },
      ...avenir('Commercialisation et réservations', 'Gestion locative et copropriété', 'Après-vente et garanties'),
    ],
  },
  {
    nom: 'Métier : création et design',
    modules: avenir(
      'Briefs et projets créatifs (Indigo)',
      'Bibliothèque de marques et chartes',
      'Validation des créations',
      'Catalogue produits (Cognac)',
      'Fiches techniques et nomenclatures',
      'Atelier et production',
      'Matières et stock cuir',
    ),
  },
  {
    nom: 'Achats et logistique',
    modules: avenir(
      'Demandes d’achat',
      'Fournisseurs et catalogue',
      'Bons de commande',
      'Stocks et matériel',
      'Parc véhicules et engins',
    ),
  },
  {
    nom: 'Pilotage (Holding)',
    modules: [
      { nom: 'Finances et facturation', statut: 'en_service', module: 'finances_factures' },
      { nom: 'Consolidation', statut: 'en_partie', module: 'finances_factures', note: 'Onglet « Groupe » de Finances' },
      { nom: 'Validations Holding', statut: 'en_partie', module: 'pilotage', note: 'Décisions proposées au CEO' },
      { nom: 'Budgets et suivi budgétaire', statut: 'a_venir' },
      { nom: 'Trésorerie multi-devises', statut: 'en_partie', module: 'finances_factures', note: 'Trésorerie en FCFA' },
      ...avenir('Participations et venture capital', 'Patrimoine et actifs'),
      { nom: 'Juridique et contrats', statut: 'en_partie', note: 'Contrats clients signés' },
      { nom: 'Conformité et risques', statut: 'a_venir' },
      { nom: 'Indicateurs groupe (KPI)', statut: 'en_partie', module: 'pilotage', note: 'Indicateurs par société' },
    ],
  },
  {
    nom: 'Administration',
    modules: [
      { nom: 'Paramétrage et droits', statut: 'en_service', note: 'Comptes, matrice, modules (CIO)' },
      { nom: 'Journal d’audit', statut: 'en_service', module: 'pilotage' },
      { nom: 'Sauvegardes et exports', statut: 'en_partie', note: 'Sauvegarde du serveur, exports Excel' },
      { nom: 'Intégrations (comptabilité, banque, signature)', statut: 'a_venir' },
      { nom: 'Gestion des sociétés et entités', statut: 'en_partie', note: 'Portail, modules' },
    ],
  },
];
