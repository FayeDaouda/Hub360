import type { PeriodeTableauBord, TableauBordSociete } from './types';

// -----------------------------------------------------------------------------
// Données du tableau de bord back-office d'une société.
//
// TODO(api) : brancher sur `GET /api/societes/:slug/tableau-de-bord?periode=…`
// une fois le module « projets » disponible côté backend. Le NestJS reste la
// source de vérité (cible multi-plateforme : web, desktop, iOS consomment la
// même API). D'ici là, jeu de données de démonstration pour caler l'UI,
// confiné à ce seul fichier — aucun composant ne dépend de sa forme interne.
//
// Contenu calé sur Grey Concrete réel (voir mémoire projet
// « grey-concrete-business ») : studio intégré de 4 personnes à Dakar, pas un
// gros promoteur — volumes et montants à l'échelle d'une boutique, pas d'un
// programme immobilier de masse.
// -----------------------------------------------------------------------------

// Échéances à venir, tous départements confondus — indépendantes de la
// fenêtre temporelle choisie, partagées entre les périodes.
const JALONS: TableauBordSociete['jalons'] = [
  {
    id: 'j1',
    date: '2026-09-12',
    projet: 'Villa Cap Vert — Ngor',
    type: 'Rendu esquisse',
    statut: 'a_faire',
  },
  {
    id: 'j2',
    date: '2026-09-17',
    projet: 'Duplex Sacré-Cœur',
    type: 'Signature devis',
    statut: 'en_attente',
  },
  {
    id: 'j3',
    date: '2026-09-22',
    projet: 'Appartement Point E',
    type: 'Livraison mobilier sur mesure',
    statut: 'a_faire',
  },
  {
    id: 'j4',
    date: '2026-09-28',
    projet: 'Résidence Yoff',
    type: 'Dépôt permis de construire',
    statut: 'en_attente',
  },
  {
    id: 'j5',
    date: '2026-10-03',
    projet: 'Villa Almadies',
    type: 'Réception de chantier',
    statut: 'a_risque',
  },
];

const PROJETS: TableauBordSociete['projets'] = [
  {
    id: 'p1',
    nom: 'Villa Cap Vert — Ngor',
    departement: 'developpement',
    client: 'M. et Mme Diouf',
    avancement: 20,
    statut: 'en_cours',
  },
  {
    id: 'p2',
    nom: 'Duplex Sacré-Cœur',
    departement: 'conception',
    client: 'Cheikh Mbaye',
    avancement: 65,
    statut: 'en_cours',
  },
  {
    id: 'p3',
    nom: 'Appartement Point E',
    departement: 'amenagement',
    client: 'Fatou Sarr',
    avancement: 90,
    statut: 'en_cours',
  },
  {
    id: 'p4',
    nom: 'Résidence Yoff',
    departement: 'developpement',
    client: 'SCI Ndiaye Frères',
    avancement: 35,
    statut: 'en_attente_client',
  },
  {
    id: 'p5',
    nom: 'Bureaux Almadies Business',
    departement: 'amenagement',
    client: 'Teranga Capital',
    avancement: 100,
    statut: 'livre',
  },
];

const MOIS: TableauBordSociete = {
  periode: 'mois',
  libellePeriode: '1 – 30 septembre 2026',
  kpis: [
    {
      cle: 'projets-actifs',
      libelle: 'Projets actifs',
      valeur: 6,
      format: 'nombre',
      variation: 1,
      uniteVariation: 'points',
      tendance: 'hausse',
      detail: '2 développement · 3 conception · 1 aménagement',
    },
    {
      cle: 'projets-livres',
      libelle: 'Projets livrés (cumul)',
      valeur: 60,
      format: 'nombre',
      variation: 2,
      uniteVariation: 'points',
      tendance: 'hausse',
      detail: '+2 ce trimestre',
    },
    {
      cle: 'surface-livree',
      libelle: 'Conçus & livrés (cumul)',
      valeur: 45_000,
      format: 'surface',
      variation: 3.2,
      uniteVariation: 'pourcent',
      tendance: 'hausse',
    },
    {
      cle: 'encaissements',
      libelle: 'Encaissements en cours',
      valeur: 84_500_000,
      format: 'montant_compact',
      variation: 6.4,
      uniteVariation: 'pourcent',
      tendance: 'hausse',
    },
  ],
  projetsSignesParPeriode: {
    titre: 'Nouveaux projets signés',
    unite: 'projets par mois',
    points: [
      { libelle: 'Avr', valeur: 1 },
      { libelle: 'Mai', valeur: 2 },
      { libelle: 'Juin', valeur: 1 },
      { libelle: 'Juil', valeur: 3 },
      { libelle: 'Août', valeur: 0 },
      { libelle: 'Sept', valeur: 2, actif: true },
    ],
  },
  avancementMoyen: { pourcentage: 62, variation: 5, tendance: 'hausse' },
  jalons: JALONS,
  projets: PROJETS,
};

const JOUR: TableauBordSociete = {
  ...MOIS,
  periode: 'jour',
  libellePeriode: 'Jeudi 19 septembre 2026',
  kpis: MOIS.kpis.map((kpi) =>
    kpi.cle === 'projets-actifs' ? { ...kpi, variation: 0, tendance: 'stable' } : kpi,
  ),
  projetsSignesParPeriode: {
    titre: 'Nouveaux projets signés',
    unite: 'projets par jour',
    points: [
      { libelle: 'Lun', valeur: 0 },
      { libelle: 'Mar', valeur: 1 },
      { libelle: 'Mer', valeur: 0 },
      { libelle: 'Jeu', valeur: 1, actif: true },
      { libelle: 'Ven', valeur: 0 },
    ],
  },
};

const SEMAINE: TableauBordSociete = {
  ...MOIS,
  periode: 'semaine',
  libellePeriode: 'Semaine du 15 au 21 septembre 2026',
  projetsSignesParPeriode: {
    titre: 'Nouveaux projets signés',
    unite: 'projets par semaine',
    points: [
      { libelle: 'S34', valeur: 0 },
      { libelle: 'S35', valeur: 1 },
      { libelle: 'S36', valeur: 0 },
      { libelle: 'S37', valeur: 2 },
      { libelle: 'S38', valeur: 1, actif: true },
    ],
  },
};

const ANNEE: TableauBordSociete = {
  ...MOIS,
  periode: 'annee',
  libellePeriode: 'Année 2026',
  kpis: [
    { ...MOIS.kpis[0], variation: 3 },
    { ...MOIS.kpis[1], variation: 9, detail: 'objectif annuel : 12' },
    { ...MOIS.kpis[2], variation: 14 },
    { ...MOIS.kpis[3], variation: 22 },
  ],
  projetsSignesParPeriode: {
    titre: 'Nouveaux projets signés',
    unite: 'projets par an',
    points: [
      { libelle: '2022', valeur: 7 },
      { libelle: '2023', valeur: 9 },
      { libelle: '2024', valeur: 11 },
      { libelle: '2025', valeur: 13 },
      { libelle: '2026', valeur: 9, actif: true },
    ],
  },
  avancementMoyen: { pourcentage: 62, variation: 8, tendance: 'hausse' },
};

const PAR_PERIODE: Record<PeriodeTableauBord, TableauBordSociete> = {
  jour: JOUR,
  semaine: SEMAINE,
  mois: MOIS,
  annee: ANNEE,
};

export async function getTableauBordSociete(
  _slug: string,
  periode: PeriodeTableauBord = 'mois',
): Promise<TableauBordSociete> {
  // Latence simulée pour que les états de chargement de l'UI soient réels
  // dès maintenant (et pas seulement une fois l'API branchée).
  await new Promise((resolve) => setTimeout(resolve, 250));
  return PAR_PERIODE[periode];
}
