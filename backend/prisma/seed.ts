import {
  Categorie,
  Gamme,
  NatureDossier,
  NiveauCollaborateur,
  Phase,
  PrismaClient,
  Standing,
  StatutCrm,
  StatutProjet,
  TypeBien,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { codeAvecVariante, genererCodeDossier } from '../src/crm/nomenclature';
import {
  FICHE_VIDE,
  normaliserFiche,
  planchesCalculees,
  resume,
  type FicheProgramme,
} from '../src/crm/fiche-programme';
import { COMPTES_DEMO, creerComptesDemo } from './comptes-demo';
import { creerFinancesDemo } from './finances-demo';
import { organiserEquipesDemo } from './equipes-demo';
import { creerPilotageDemo } from './pilotage-demo';
import { ouvrirDossiersManquants } from './rh-dossiers-init';
import { verifierEnvironnementDemo } from './garde-demo';
import { installerSocle } from './socle';

const prisma = new PrismaClient();

// IDs figés : un `migrate reset` recrée ces lignes à l'identique, donc un JWT
// déjà émis (societeId / userId dedans) reste valide après un reseed.
const ID_ADMIN_HUB = '00000000-0000-4000-8000-000000000001';
const ID_BOSS = '00000000-0000-4000-8000-000000000002';
const ID_COLLAB = '00000000-0000-4000-8000-000000000003';

async function main() {
  verifierEnvironnementDemo();
  const { grey, roleAdmin } = await installerSocle(prisma);

  const mdp = await bcrypt.hash('changeme123', 12); // COUT_BCRYPT

  // --- Compte admin holding ----------------------------------------------
  const adminHub = await prisma.utilisateur.upsert({
    where: { email: 'admin@hub.group' },
    update: {},
    create: {
      id: ID_ADMIN_HUB,
      email: 'admin@hub.group',
      motDePasseHash: mdp,
      nom: 'Admin',
      prenom: 'HUB',
    },
  });
  const holdingAdmin = await prisma.role.findFirstOrThrow({
    where: { societeId: null, nom: 'holding_admin' },
  });
  if (
    !(await prisma.utilisateurSocieteRole.findFirst({
      where: { utilisateurId: adminHub.id, societeId: null, roleId: holdingAdmin.id },
    }))
  ) {
    await prisma.utilisateurSocieteRole.create({
      data: { utilisateurId: adminHub.id, societeId: null, roleId: holdingAdmin.id },
    });
  }

  // Comptes de démo « salariés » : rôle Salarié de la société (le rôle socle
  // collaborateur a été fondu dans Salarié, phase 1, 14/10/2026).
  const roleCollab = await prisma.role.findFirstOrThrow({
    where: { societeId: grey.id, nom: 'Salarié' },
  });

  const boss = await prisma.utilisateur.upsert({
    where: { email: 'admin.greyconcrete@hub.group' },
    update: {},
    create: {
      id: ID_BOSS,
      email: 'admin.greyconcrete@hub.group',
      motDePasseHash: mdp,
      nom: 'Diop',
      prenom: 'Awa',
    },
  });
  const collab = await prisma.utilisateur.upsert({
    where: { email: 'collab.greyconcrete@hub.group' },
    update: {},
    create: {
      id: ID_COLLAB,
      email: 'collab.greyconcrete@hub.group',
      motDePasseHash: mdp,
      nom: 'Ndiaye',
      prenom: 'Moussa',
    },
  });
  for (const [u, r] of [
    [boss, roleAdmin],
    [collab, roleCollab],
  ] as const) {
    if (
      !(await prisma.utilisateurSocieteRole.findFirst({
        where: { utilisateurId: u.id, societeId: grey.id, roleId: r.id },
      }))
    ) {
      await prisma.utilisateurSocieteRole.create({
        data: { utilisateurId: u.id, societeId: grey.id, roleId: r.id },
      });
    }
  }

  // Comptes fictifs, un par rôle de la matrice (démonstration et recette des
  // droits) — module partagé avec `npm run comptes-demo`, cf. comptes-demo.ts.
  const comptesDemo = await creerComptesDemo(prisma, grey.id, mdp);
  const dirGc = comptesDemo['Dir. GC'];
  const cfo = comptesDemo.CFO;

  // --- On repart propre sur les données métier -------------------------
  // Ordre des FK : canaux (→ messages / lectures en cascade) puis factures
  // (→ paiements, en cascade — AVANT devis : Facture.devisOrigineId n'a pas
  // de cascade, cf. cadrage Devis) puis devis (→ lignes de devis, en cascade
  // — projetId/clientId n'ont pas de cascade non plus : un « devis libre »
  // doit pouvoir survivre à son projet, donc il ne disparaît jamais tout
  // seul) puis dossiers (→ projet → sections aval, en cascade) puis
  // collaborateurs (celluleId = SetNull, pas de cascade) puis cellules puis
  // clients. Rend `prisma db seed` rejouable sans reset.
  await prisma.canal.deleteMany({ where: { societeId: grey.id } });
  await prisma.facture.deleteMany({ where: { societeId: grey.id } });
  await prisma.devis.deleteMany({ where: { societeId: grey.id } });
  await prisma.dossierCrm.deleteMany({ where: { societeId: grey.id } });
  await prisma.collaborateur.deleteMany({ where: { societeId: grey.id } });
  await prisma.cellule.deleteMany({ where: { societeId: grey.id } });
  await prisma.client.deleteMany({ where: { societeId: grey.id } });

  // --- Clients ------------------------------------------------------
  const clients = await Promise.all(
    [
      // Données fictives (oct. 2026) : personnes physiques puis morales — le
      // segment CLIENT du code se tire du nom ou de la raison sociale.
      { nom: 'M. et Mme Diouf', type: 'particulier' as const, contact: 'Awa Diouf', telephone: '+221 77 123 45 67' },
      { nom: 'Cheikh Mbaye', type: 'particulier' as const, email: 'c.mbaye@example.sn' },
      { nom: 'Fatou Sarr', type: 'particulier' as const, telephone: '+221 78 456 78 90' },
      { nom: 'SCI Ndiaye Frères', type: 'sci' as const, contact: 'Ibrahima Ndiaye', email: 'contact@ndiaye-freres.sn' },
      {
        nom: 'Teranga Capital SA',
        type: 'entreprise' as const,
        contact: 'Directrice immobilier',
        telephone: '+221 33 869 45 00',
      },
      { nom: 'Awa Ba', type: 'particulier' as const, telephone: '+221 76 210 33 44' },
      {
        nom: 'Résidences Atlantique SARL',
        type: 'entreprise' as const,
        contact: 'Moustapha Gaye',
        email: 'contact@residences-atlantique.sn',
      },
      { nom: 'Grey Holding', type: 'entreprise' as const, contact: 'Direction générale' },
    ].map((c, i) => prisma.client.create({ data: { societeId: grey.id, numero: i + 1, ...c } })),
  );
  const cli = (i: number) => clients[i].id;

  // --- Cellules (6, cross-fonctionnelles) + collaborateurs -----------
  type M = [string, string, string, NiveauCollaborateur]; // prenom, nom, role, niveau
  const cellulesSeed: [string, M[]][] = [
    [
      'Cellule Archi 1',
      [
        ['Aïssatou', 'Faye', 'Architecte', 'senior'],
        ['Lamine', 'Diallo', 'Designer', 'confirme'],
        ['Modou', 'Gueye', 'Conducteur de travaux', 'confirme'],
      ],
    ],
    [
      'Cellule Archi 2',
      [
        ['Ousmane', 'Bâ', 'Architecte', 'confirme'],
        ['Bineta', 'Ndour', 'Designer', 'junior'],
        ['Khadija', 'Sow', 'Conductrice de travaux', 'senior'],
      ],
    ],
    [
      'Cellule Archi 3',
      [
        ['Mariama', 'Cissé', 'Architecte', 'senior'],
        ['Serigne', 'Top', 'Designer', 'confirme'],
        ['Aliou', 'Ndiaye', 'Conducteur de travaux', 'junior'],
      ],
    ],
    [
      'Cellule Archi 4',
      [
        ['Cheikh', 'Sarr', 'Architecte', 'lead'],
        ['Fatoumata', 'Bâ', 'Dessinateur', 'confirme'],
        ['Ibrahima', 'Kane', 'Conducteur de travaux', 'confirme'],
      ],
    ],
    [
      'Cellule Intérieur',
      [
        ['Ndèye', 'Diagne', 'Designer', 'senior'],
        ['Pape', 'Mbengue', 'Designer', 'junior'],
        ['Aminata', 'Thiam', 'Décoratrice', 'confirme'],
      ],
    ],
    [
      'Cellule Études',
      [
        ['Malick', 'Sy', 'Ingénieur structure', 'senior'],
        ['Rokhaya', 'Ndoye', 'Responsable 3D', 'confirme'],
        ['Souleymane', 'Fall', 'Dessinateur', 'junior'],
      ],
    ],
  ];

  // Collaborateurs créés ici, puis organisés en cellules selon la maquette
  // « Équipes » (codes ISO 9001, pilotes, postes) — cf. equipes-demo.ts, qui
  // rend la clé de chaque groupe ci-dessus (rattachement des projets).
  await prisma.collaborateur.createMany({
    data: cellulesSeed.flatMap(([, membres]) =>
      membres.map(([prenom, n, role, niveau]) => ({ societeId: grey.id, prenom, nom: n, role, niveau })),
    ),
  });
  const cellules = await organiserEquipesDemo(prisma, grey.id);

  // 2 collaborateurs sans cellule (retirés, pas encore réaffectés) — exerce le
  // bloc « Sans cellule » de la page Équipe.
  await prisma.collaborateur.createMany({
    data: [
      { societeId: grey.id, prenom: 'Awa', nom: 'Diouf', role: 'Architecte', niveau: 'junior' },
      { societeId: grey.id, prenom: 'Moussa', nom: 'Camara', role: 'Dessinateur', niveau: 'stagiaire' },
    ],
  });

  // Le responsable 3D reçoit le compte de démo de Rokhaya (ci-dessous).
  const resp3d = await prisma.collaborateur.findFirstOrThrow({
    where: { societeId: grey.id, role: 'Responsable 3D' },
  });

  // --- Comptes collaborateurs : un actif, un invité (pour voir les 3 statuts) ---
  // Rokhaya Ndoye (resp. 3D) : compte activé, peut se connecter.
  const uRokhaya = await prisma.utilisateur.upsert({
    where: { email: 'rokhaya.ndoye@greyconcrete.hub' },
    update: {},
    create: {
      email: 'rokhaya.ndoye@greyconcrete.hub',
      prenom: 'Rokhaya',
      nom: 'Ndoye',
      motDePasseHash: mdp,
      actif: true,
    },
  });
  await prisma.utilisateurSocieteRole.upsert({
    where: {
      utilisateurId_societeId_roleId: {
        utilisateurId: uRokhaya.id,
        societeId: grey.id,
        roleId: roleCollab.id,
      },
    },
    update: {},
    create: { utilisateurId: uRokhaya.id, societeId: grey.id, roleId: roleCollab.id },
  });
  await prisma.collaborateur.update({
    where: { id: resp3d.id },
    // dateArrivee : entrée dans le studio (alimente l'ancienneté de « Mes
    // indicateurs »). Distinct de createdAt (création de la fiche au seed).
    data: { utilisateurId: uRokhaya.id, dateArrivee: '2023-03-06' },
  });

  // Souleymane Fall (dessinateur, cellule Études) : invité, pas encore activé.
  const souley = await prisma.collaborateur.findFirstOrThrow({
    where: { societeId: grey.id, prenom: 'Souleymane', nom: 'Fall' },
  });
  const uSouley = await prisma.utilisateur.upsert({
    where: { email: 'souleymane.fall@greyconcrete.hub' },
    update: {},
    create: {
      email: 'souleymane.fall@greyconcrete.hub',
      prenom: 'Souleymane',
      nom: 'Fall',
      motDePasseHash: null,
      actif: false,
    },
  });
  await prisma.utilisateurSocieteRole.upsert({
    where: {
      utilisateurId_societeId_roleId: {
        utilisateurId: uSouley.id,
        societeId: grey.id,
        roleId: roleCollab.id,
      },
    },
    update: {},
    create: { utilisateurId: uSouley.id, societeId: grey.id, roleId: roleCollab.id },
  });
  await prisma.collaborateur.update({
    where: { id: souley.id },
    data: { utilisateurId: uSouley.id },
  });
  await prisma.invitation.upsert({
    where: { tokenHash: 'seed-invite-souleymane' }, // jeton fictif — juste pour le statut « invité »
    update: { expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), usedAt: null },
    create: {
      tokenHash: 'seed-invite-souleymane',
      type: 'invitation',
      email: uSouley.email,
      utilisateurId: uSouley.id,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  });

  // --- Dossiers CRM + projets ------------------------------------------

  // Dossiers fictifs au format du doc « Création de projet côté CRM » (oct.
  // 2026) : catégorie (dont Développement), types, standing, gamme, Fiche
  // Programme dynamique (programme et planches en sont déduits), apporteur
  // « affaire directe » (null) ou externe avec structure ; quelques leads
  // incomplets, l'un d'eux en attente depuis plus de 72 h, et un archivé.
  type Apporteur = { nom: string; structure?: string; telephone?: string; email?: string; commission?: number };
  type Cfg = {
    nom: string; // libellé de démo (légendes, repérage dans le seed)
    nature: NatureDossier;
    categorie: Categorie | null;
    statut: StatutCrm;
    // Code de la localité du référentiel (importé par migration) — sert aussi
    // au segment LOC du code dossier ; le libellé vient du référentiel.
    localiteCode: string;
    localisation: string;
    apporteur: Apporteur | null; // null = aucun apporteur (affaire directe)
    lat: number;
    lng: number;
    type: TypeBien | null;
    surface: number; // 0 = à renseigner
    standing: Standing | null;
    gamme: Gamme | null;
    fiche: Partial<FicheProgramme> | null; // null = Fiche Programme pas commencée
    planchesSaisies?: number; // quand elles ne se calculent pas encore
    clientId: string;
    creeIlYaJours?: number; // ancienneté (relance 72 h)
    archive?: boolean;
    // si le dossier est validé :
    phase?: Phase;
    equipe?: string;
  };

  const NOTAIRE: Apporteur = {
    nom: 'Me Aliou Ndiaye',
    structure: 'Notaire',
    telephone: '+221 77 555 12 34',
    email: 'etude.ndiaye@example.sn',
    commission: 4,
  };
  const villa = (o: Partial<FicheProgramme>): Partial<FicheProgramme> => ({
    typeProjet: 'residentiel',
    usage: 'maisons_individuelles',
    forme: 'villa',
    ...o,
  });
  const immeuble = (o: Partial<FicheProgramme>): Partial<FicheProgramme> => ({ forme: 'immeuble', ...o });

  const cfgs: Cfg[] = [
    {
      nom: 'Villa Cap Vert',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'onboard',
      phase: 'avant_projet',
      localiteCode: 'NGO',
      localisation: 'Ngor, Dakar',
      lat: 14.747,
      lng: -17.514,
      apporteur: null,
      clientId: cli(0),
      type: 'villa',
      surface: 400,
      standing: 'moyen',
      gamme: 'economique',
      fiche: villa({
        gabarit: 1,
        typologieVilla: 'F5',
        suiteParentale: true,
        annexes: ['bureau', 'buanderie'],
        commodites: [
          'parking_exterieur',
          'portail_motorise',
          'videosurveillance',
          'interphone',
          'groupe_electrogene',
          'bache_surpresseur',
          'climatisation',
          'fibre',
        ],
      }),
    },
    {
      nom: 'Duplex Sacré-Cœur',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'onboard',
      phase: 'permis',
      equipe: 'Cellule Archi 1',
      localiteCode: 'SAC',
      localisation: 'Sacré-Cœur 3, Dakar',
      lat: 14.705,
      lng: -17.462,
      apporteur: { nom: 'Khady Seck', structure: 'Partenaire', telephone: '+221 70 412 18 80', commission: 3 },
      clientId: cli(1),
      type: 'villa',
      surface: 300,
      standing: 'grand',
      gamme: 'moyen',
      fiche: villa({
        gabarit: 2,
        toitureTerrasse: true,
        typologieVilla: 'F6',
        suiteParentale: true,
        annexes: ['chambre_service', 'buanderie'],
        commodites: [
          'garage_box',
          'portail_motorise',
          'videosurveillance',
          'detection_incendie',
          'groupe_electrogene',
          'panneaux_solaires',
          'climatisation',
          'fibre',
          'domotique',
          'piscine',
          'jardin',
        ],
      }),
    },
    {
      nom: 'Résidence Point E',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'onboard',
      phase: 'etudes',
      equipe: 'Cellule Archi 2',
      localiteCode: 'POI',
      localisation: 'Point E, Dakar',
      lat: 14.692,
      lng: -17.46,
      apporteur: null,
      clientId: cli(2),
      type: 'immeuble_residentiel',
      surface: 600,
      standing: 'moyen',
      gamme: 'economique',
      fiche: immeuble({
        typeProjet: 'residentiel',
        usage: 'immeubles_habitation',
        gabarit: 4,
        sousSols: 1,
        composition: [
          { de: -1, a: -1, usage: 'parking', typologie: '', nb: 1 },
          { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 2 },
          { de: 1, a: 4, usage: 'logements', typologie: 'F3', nb: 4 },
        ],
        commodites: [
          'parking_sous_sol',
          'ascenseur',
          'interphone',
          'detection_incendie',
          'groupe_electrogene',
          'bache_surpresseur',
          'local_poubelles',
          'local_technique',
        ],
      }),
    },
    {
      nom: 'Villas Cap Ouest',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'onboard',
      phase: 'chantier',
      equipe: 'Cellule Archi 3',
      localiteCode: 'ALM',
      localisation: 'Almadies, Dakar',
      lat: 14.744,
      lng: -17.523,
      apporteur: NOTAIRE,
      clientId: cli(3),
      type: 'villa',
      surface: 1000,
      standing: 'grand',
      gamme: 'grand',
      fiche: villa({
        gabarit: 1,
        sousSols: 1,
        typologieVilla: 'F7+',
        suiteParentale: true,
        annexes: ['bureau', 'chambre_service', 'buanderie', 'dependance'],
        commodites: [
          'garage_box',
          'bornes_recharge',
          'portail_motorise',
          'gardiennage',
          'guerite',
          'videosurveillance',
          'cloture',
          'groupe_electrogene',
          'panneaux_solaires',
          'forage',
          'climatisation',
          'domotique',
          'piscine',
          'salle_sport',
          'spa',
          'jardin',
        ],
      }),
    },
    {
      nom: 'Villa Fann',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'onboard',
      phase: 'livre',
      equipe: 'Cellule Archi 1',
      localiteCode: 'FPE',
      localisation: 'Fann Résidence, Dakar',
      lat: 14.687,
      lng: -17.464,
      apporteur: null,
      clientId: cli(0),
      type: 'villa',
      surface: 250,
      standing: 'economique',
      gamme: 'economique',
      fiche: villa({ gabarit: 0, typologieVilla: 'F4' }),
    },
    {
      nom: 'Les Terrasses de Ouakam',
      nature: 'promotion_interne',
      categorie: 'developpement',
      statut: 'onboard',
      phase: 'avant_projet',
      equipe: 'Cellule Archi 4',
      localiteCode: 'OUA',
      localisation: 'Ouakam, Dakar',
      lat: 14.723,
      lng: -17.498,
      apporteur: null,
      clientId: cli(7),
      type: 'immeuble_mixte',
      surface: 1500,
      standing: 'grand',
      gamme: 'moyen',
      fiche: immeuble({
        typeProjet: 'mixte',
        usage: 'Logements, commerces et bureaux',
        gabarit: 6,
        sousSols: 2,
        toitureTerrasse: true,
        composition: [
          { de: -2, a: -1, usage: 'parking', typologie: '', nb: 1 },
          { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 3 },
          { de: 1, a: 1, usage: 'bureaux', typologie: '', nb: 2 },
          { de: 2, a: 5, usage: 'logements', typologie: 'F3', nb: 2 },
          { de: 6, a: 6, usage: 'logements', typologie: 'F5', nb: 1 },
        ],
        commodites: [
          'parking_sous_sol',
          'acces_badge',
          'ascenseur',
          'monte_charge',
          'escalier_secours',
          'gardiennage',
          'videosurveillance',
          'detection_incendie',
          'groupe_electrogene',
          'panneaux_solaires',
          'bache_surpresseur',
          'fibre',
          'rooftop',
          'hall_accueil',
          'local_poubelles',
          'local_technique',
        ],
      }),
    },
    {
      nom: 'Bureaux Almadies Business',
      nature: 'mandat_client',
      categorie: 'amenagement',
      statut: 'onboard',
      phase: 'chantier',
      equipe: 'Cellule Intérieur',
      localiteCode: 'ALM',
      localisation: 'Almadies, Dakar',
      lat: 14.746,
      lng: -17.5195,
      apporteur: null,
      clientId: cli(4),
      type: 'immeuble_bureaux',
      surface: 800,
      standing: 'moyen',
      gamme: 'moyen',
      fiche: immeuble({
        typeProjet: 'commercial',
        usage: 'bureaux',
        gabarit: 3,
        composition: [
          { de: 0, a: 0, usage: 'commerce', typologie: '', nb: 1 },
          { de: 1, a: 3, usage: 'bureaux', typologie: '', nb: 4 },
        ],
        commodites: [
          'parking_exterieur',
          'ascenseur',
          'acces_badge',
          'videosurveillance',
          'detection_incendie',
          'climatisation',
          'fibre',
          'hall_accueil',
        ],
      }),
    },
    // Leads en cours de qualification (« Nouveau projet ») :
    {
      nom: 'Lead Yoff (3/10)',
      nature: 'mandat_client',
      categorie: null,
      statut: 'nouveau_projet',
      creeIlYaJours: 4,
      localiteCode: 'YOF',
      localisation: 'Yoff, Dakar',
      lat: 14.753,
      lng: -17.489,
      apporteur: null,
      clientId: cli(5),
      type: null,
      surface: 0,
      standing: null,
      gamme: null,
      fiche: null,
    },
    {
      nom: 'Résidence VDN (en cours)',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'nouveau_projet',
      creeIlYaJours: 1,
      localiteCode: 'VDN',
      localisation: 'VDN, Dakar',
      lat: 14.728,
      lng: -17.46,
      apporteur: NOTAIRE,
      clientId: cli(6),
      type: 'immeuble_residentiel',
      surface: 2000,
      standing: 'moyen',
      gamme: null,
      fiche: immeuble({
        typeProjet: 'residentiel',
        usage: 'immeubles_habitation',
        gabarit: 8,
        sousSols: 1,
        composition: [{ de: 0, a: 0, usage: 'commerce', typologie: '', nb: 4 }],
      }),
    },
    {
      nom: 'Villa Ngor (complète)',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'nouveau_projet',
      localiteCode: 'NGO',
      localisation: 'Ngor, Dakar',
      lat: 14.749,
      lng: -17.512,
      apporteur: null,
      clientId: cli(2),
      type: 'villa',
      surface: 500,
      standing: 'moyen',
      gamme: 'economique',
      fiche: villa({
        gabarit: 1,
        typologieVilla: 'F5',
        annexes: ['buanderie'],
        commodites: [
          'parking_exterieur',
          'portail_motorise',
          'interphone',
          'bache_surpresseur',
          'chauffe_eau_solaire',
          'climatisation',
        ],
      }),
    },
    {
      nom: 'Résidence Ouakam',
      nature: 'mandat_client',
      categorie: 'conception',
      statut: 'offre_envoyee',
      localiteCode: 'OUA',
      localisation: 'Ouakam, Dakar',
      lat: 14.724,
      lng: -17.497,
      apporteur: { nom: 'Khady Seck', structure: 'Partenaire', commission: 3 },
      clientId: cli(3),
      type: 'immeuble_residentiel',
      surface: 1000,
      standing: 'grand',
      gamme: 'moyen',
      fiche: immeuble({
        typeProjet: 'residentiel',
        usage: 'immeubles_habitation',
        gabarit: 5,
        composition: [
          { de: 0, a: 0, usage: 'logements', typologie: 'F3', nb: 2 },
          { de: 1, a: 5, usage: 'logements', typologie: 'F4', nb: 3 },
        ],
        commodites: [
          'parking_exterieur',
          'ascenseur',
          'gardiennage',
          'videosurveillance',
          'groupe_electrogene',
          'piscine',
          'jardin',
        ],
      }),
    },
    {
      nom: 'Showroom VDN',
      nature: 'mandat_client',
      categorie: 'amenagement',
      statut: 'perdu',
      localiteCode: 'VDN',
      localisation: 'VDN, Dakar',
      lat: 14.729,
      lng: -17.4595,
      apporteur: null,
      clientId: cli(4),
      type: 'local_commercial',
      surface: 300,
      standing: 'moyen',
      gamme: 'moyen',
      fiche: immeuble({
        forme: 'local_commercial',
        typeProjet: 'commercial',
        usage: 'commerces',
        gabarit: 0,
        composition: [{ de: 0, a: 0, usage: 'commerce', typologie: '', nb: 1 }],
      }),
    },
    {
      nom: 'Lead Sacré-Cœur (archivé)',
      nature: 'mandat_client',
      categorie: null,
      statut: 'nouveau_projet',
      creeIlYaJours: 9,
      archive: true,
      localiteCode: 'SAC',
      localisation: 'Sacré-Cœur 3, Dakar',
      lat: 14.706,
      lng: -17.461,
      apporteur: null,
      clientId: cli(5),
      type: null,
      surface: 0,
      standing: null,
      gamme: null,
      fiche: null,
    },
  ];

  const localiteParCode = new Map(
    (await prisma.localite.findMany({ select: { id: true, code: true } })).map((l) => [l.code, l.id]),
  );

  // Code selon la nomenclature réelle (CLIENT_LOC.AA, -2 si doublon), comme
  // le fait CrmService à la création.
  const codesPris = new Set<string>();
  const codeDossier = (cfg: Cfg) => {
    const client = clients.find((c) => c.id === cfg.clientId)!;
    const code = codeAvecVariante(genererCodeDossier(client, cfg.localiteCode), codesPris);
    codesPris.add(code);
    return code;
  };

  const dossierParNom = new Map<string, string>(); // libellé de démo → id du dossier
  for (const cfg of cfgs) {
    // Fiche Programme : programme (résumé) et planches déduits comme le fait
    // CrmService.modifierFiche.
    // Normalisée comme une saisie : une valeur inconnue (ancien usage…) fait
    // échouer le seed au lieu de s'écrire en base.
    const fiche: FicheProgramme | null = cfg.fiche ? normaliserFiche({ ...FICHE_VIDE, ...cfg.fiche }) : null;
    const creeLe = new Date(Date.now() - (cfg.creeIlYaJours ?? 30) * 86_400_000);
    const ap = cfg.apporteur;
    const dossier = await prisma.dossierCrm.create({
      data: {
        societeId: grey.id,
        code: codeDossier(cfg),
        nature: cfg.nature,
        categorie: cfg.categorie,
        localisation: cfg.localisation,
        localiteId: localiteParCode.get(cfg.localiteCode) ?? null,
        type: cfg.type,
        latitude: cfg.lat,
        longitude: cfg.lng,
        nbPlanches: (fiche && planchesCalculees(fiche)) ?? cfg.planchesSaisies ?? 0,
        surfaceTerrain: cfg.surface,
        standing: cfg.standing,
        gamme: cfg.gamme,
        ficheProgramme: fiche ?? undefined,
        programme: fiche ? resume(fiche) : '',
        statut: cfg.statut,
        clientId: cfg.clientId,
        createdAt: creeLe,
        // « Qui » : saisis par le compte admin, suivis par le Dir. GC de test
        // (seul titulaire du rôle → propriétaire d'office).
        creeParId: boss.id,
        // Fiche apporteur (maquette « Nouveau projet ») : null = affaire directe.
        apporteurType: ap ? 'externe' : null,
        apporteurNom: ap?.nom ?? null,
        apporteurStructure: ap?.structure ?? null,
        apporteurTelephone: ap?.telephone ?? null,
        apporteurEmail: ap?.email ?? null,
        commissionApporteur: ap?.commission ?? null,
        proprietaireId: dirGc.id,
        ...(cfg.archive && { archiveLe: new Date(creeLe.getTime() + 2 * 86_400_000), archiveParId: dirGc.id }),
      },
    });

    // Journal du cycle (étape E) : le chemin réellement parcouru jusqu'au
    // statut de démo — saisi par l'admin, validé par la CFO de test.
    dossierParNom.set(cfg.nom, dossier.id);
    const apporteurResume = ap ? (ap.structure ? `${ap.nom} (${ap.structure})` : ap.nom) : 'affaire directe';
    const chemin: { de: StatutCrm | null; vers: StatutCrm; par: string; commentaire?: string }[] = [
      {
        de: null,
        vers: 'nouveau_projet',
        par: boss.id,
        commentaire: `Fiche apporteur : ${apporteurResume}, validée et verrouillée`,
      },
    ];
    if (['offre_envoyee', 'onboard'].includes(cfg.statut)) {
      chemin.push(
        { de: 'nouveau_projet', vers: 'en_validation', par: boss.id },
        { de: 'en_validation', vers: 'offre_envoyee', par: cfo.id },
      );
    }
    if (cfg.statut === 'onboard') chemin.push({ de: 'offre_envoyee', vers: 'onboard', par: boss.id });
    if (cfg.statut === 'perdu') {
      chemin.push({
        de: 'nouveau_projet',
        vers: 'perdu',
        par: boss.id,
        commentaire: 'Le client a reporté son projet à une date indéterminée (démo).',
      });
    }
    await prisma.dossierCrmTransition.createMany({
      data: chemin.map((t, i) => ({
        dossierId: dossier.id,
        // Horodatages espacés : l'historique se lit dans l'ordre (tri par date).
        creeLe: new Date(dossier.createdAt.getTime() + i * 3_600_000),
        de: t.de,
        vers: t.vers,
        parId: t.par,
        commentaire: t.commentaire ?? null,
      })),
    });

    if (cfg.statut !== 'onboard' || !cfg.categorie || !cfg.type) continue;

    const phase = cfg.phase ?? 'avant_projet';
    const statut: StatutProjet = cfg.equipe ? (phase === 'avant_projet' ? 'assigne' : 'en_cours') : 'a_assigner';

    await prisma.projet.create({
      data: {
        societeId: grey.id,
        dossierCrmId: dossier.id,
        code: dossier.code,
        nature: dossier.nature,
        categorie: cfg.categorie,
        programme: dossier.programme,
        localisation: dossier.localisation,
        // Pin posé une fois le projet lancé ; ceux encore en avant-projet
        // affichent « Localiser » (carte centrée sur Dakar) tant qu'on n'a pas
        // l'adresse du site.
        latitude: phase === 'avant_projet' ? null : dossier.latitude,
        longitude: phase === 'avant_projet' ? null : dossier.longitude,
        type: cfg.type,
        clientId: dossier.clientId,
        cellules: cfg.equipe ? { create: [{ celluleId: cellules[cfg.equipe] }] } : undefined,
        statut,
        phase,
      },
    });
  }

  // --- Devis et factures fictifs (onglets Finances) — cf. finances-demo.ts ---
  await creerFinancesDemo(prisma, grey.id);

  // --- Décisions fictives au registre (Pilotage) — cf. pilotage-demo.ts -----
  await creerPilotageDemo(prisma, grey.id);

  // --- Notifications de démo pour Rokhaya (compte collaborateur actif) ------
  // Les alertes d'échéance sont dérivées à la lecture (pas stockées) ; ici on
  // ne pose que les événements discrets.
  const [pAssigne, pPhase] = await Promise.all(
    ['Résidence Point E', 'Duplex Sacré-Cœur'].map((nom) =>
      prisma.projet.findFirst({ where: { societeId: grey.id, dossierCrmId: dossierParNom.get(nom) } }),
    ),
  );
  if (pAssigne && pPhase) {
    await prisma.notification.createMany({
      data: [
        {
          destinataireId: uRokhaya.id,
          societeId: grey.id,
          type: 'projet_assigne',
          projetId: pAssigne.id,
          titre: `${pAssigne.code} · assigné à ta cellule`,
          parId: boss.id,
          createdAt: new Date('2026-09-05T09:12:00'),
        },
        {
          destinataireId: uRokhaya.id,
          societeId: grey.id,
          type: 'phase_changee',
          projetId: pPhase.id,
          titre: `${pPhase.code} · passe en phase Permis`,
          parId: boss.id,
          luLe: new Date('2026-09-04T18:00:00'),
          createdAt: new Date('2026-09-04T15:40:00'),
        },
      ],
    });
  }

  // --- Chat multi-canaux : canaux + messages de démo ------------------
  // Général + un fil par cellule (créés en coquille par ChatService en prod ;
  // posés ici pour la démo), une conversation d'équipe, un fil de cellule, et
  // un DM d'onboarding vers un compte encore en attente d'activation.
  const canalGeneral = await prisma.canal.create({
    data: { societeId: grey.id, type: 'general' },
  });
  const canauxCellule: Record<string, string> = {};
  for (const [nom, id] of Object.entries(cellules)) {
    const c = await prisma.canal.create({
      data: { societeId: grey.id, type: 'cellule', celluleId: id },
    });
    canauxCellule[nom] = c.id;
  }

  await prisma.message.createMany({
    data: [
      {
        canalId: canalGeneral.id,
        auteurId: boss.id,
        texte: 'Point équipe demain 10h en salle projet.',
        createdAt: new Date('2026-09-06T17:02:00'),
      },
      { canalId: canalGeneral.id, auteurId: uRokhaya.id, texte: 'Noté 👍', createdAt: new Date('2026-09-06T17:05:00') },
      {
        canalId: canalGeneral.id,
        auteurId: boss.id,
        texte: 'Les plaquettes GH_PE.24 sont à finaliser cette semaine.',
        createdAt: new Date('2026-09-07T09:20:00'),
      },
      {
        canalId: canalGeneral.id,
        auteurId: boss.id,
        texte: 'Rokhaya, tu peux passer les rendus façade avant la réunion ?',
        createdAt: new Date('2026-09-08T08:15:00'),
      },
      {
        canalId: canauxCellule['Cellule Études'],
        auteurId: uRokhaya.id,
        texte: 'Je dépose les fichiers source 3D ici au fur et à mesure.',
        createdAt: new Date('2026-09-07T11:40:00'),
      },
      {
        canalId: canauxCellule['Cellule Études'],
        auteurId: uRokhaya.id,
        texte: 'Première passe Twin Flame dispo, retours bienvenus.',
        createdAt: new Date('2026-09-07T16:10:00'),
      },
    ],
  });

  const [dmP1, dmP2] = [uRokhaya.id, uSouley.id].sort();
  const dm = await prisma.canal.create({
    data: { societeId: grey.id, type: 'direct', participant1Id: dmP1, participant2Id: dmP2 },
  });
  await prisma.message.create({
    data: {
      canalId: dm.id,
      auteurId: uRokhaya.id,
      texte: 'Salut Souleymane, bienvenue dans la cellule ! Dès que ton accès est actif on cale un point.',
      createdAt: new Date('2026-09-07T18:30:00'),
    },
  });

  // Rokhaya a lu le Général jusqu'à hier soir → le message du boss de ce matin
  // reste non lu (badge chat = 1). Les autres fils : elle est seule à parler,
  // et ses propres messages ne comptent pas comme non lus.
  await prisma.lectureCanal.create({
    data: {
      utilisateurId: uRokhaya.id,
      canalId: canalGeneral.id,
      dernierLuLe: new Date('2026-09-07T20:00:00'),
    },
  });

  // --- Dossiers RH de chaque collaborateur — cf. rh-dossiers-init.ts --------
  // Sans eux, les écrans RH et Mon espace restent vides.
  const nbDossiersRh = await ouvrirDossiersManquants(prisma);

  console.log('Seed terminé.');
  console.log('  Comptes (mdp : changeme123)');
  console.log('   · admin@hub.group                 holding_admin');
  console.log('   · admin.greyconcrete@hub.group    societe_admin  → /admin/grey-concrete');
  console.log('   · collab.greyconcrete@hub.group   Salarié');
  for (const c of COMPTES_DEMO) console.log(`   · ${c.email.padEnd(32)} ${c.role}`);
  const nbP = await prisma.projet.count({ where: { societeId: grey.id } });
  const nbD = await prisma.dossierCrm.count({ where: { societeId: grey.id } });
  const nbCel = await prisma.cellule.count({ where: { societeId: grey.id } });
  const nbCollab = await prisma.collaborateur.count({ where: { societeId: grey.id } });
  console.log(`  Grey Concrete : ${nbD} dossiers CRM, ${nbP} projets`);
  console.log(`  Équipe : ${nbCel} cellules, ${nbCollab} collaborateurs`);
  console.log(`  RH : ${nbDossiersRh} dossier(s) du personnel ouvert(s)`);
  const nbCanaux = await prisma.canal.count({ where: { societeId: grey.id } });
  const nbMsg = await prisma.message.count({
    where: { canal: { societeId: grey.id } },
  });
  console.log(`  Chat : ${nbCanaux} canaux, ${nbMsg} messages`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
