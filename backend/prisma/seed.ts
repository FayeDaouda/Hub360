import {
  Categorie,
  EtapePreBilan,
  Gamme,
  NatureDossier,
  NiveauCollaborateur,
  Phase,
  PrismaClient,
  Standing,
  StatutCrm,
  StatutProjet,
  TypeBien,
  TypeLot,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CHECKLISTS_AVANT_PROJET } from '../src/projets/domaine/config';

const prisma = new PrismaClient();

// Séquences de sous-étapes / lignes de coût, alignées sur
// src/projets/domaine/config.ts et frontend/lib/types.ts.
const ETAPES: Record<Categorie, EtapePreBilan[]> = {
  conception: ['esq', 'aps', 'apd'],
  amenagement: ['estimation', 'definitif'],
};
const LIGNES: Record<Categorie, string[]> = {
  conception: ['charges_foncieres', 'travaux', 'honoraires', 'frais_divers', 'aleas'],
  amenagement: [
    'fournitures_mobilier',
    'travaux_amenagement',
    'honoraires',
    'frais_divers',
    'aleas',
  ],
};

// Phase 2 — catalogue de lots par catégorie (miroir de domaine/config.ts).
const LOTS_PAR_CAT: Record<Categorie, TypeLot[]> = {
  conception: ['gros_oeuvre', 'second_oeuvre', 'lots_techniques', 'vrd'],
  amenagement: ['fournitures_mobilier', 'travaux_amenagement'],
};

// IDs figés : un `migrate reset` recrée ces lignes à l'identique, donc un JWT
// déjà émis (societeId / userId dedans) reste valide après un reseed.
const ID_GREY = '11111111-1111-4111-8111-111111111111';
const ID_ADMIN_HUB = '00000000-0000-4000-8000-000000000001';
const ID_BOSS = '00000000-0000-4000-8000-000000000002';
const ID_COLLAB = '00000000-0000-4000-8000-000000000003';

async function main() {
  // --- Rôles & modules -------------------------------------------------
  for (const nom of ['holding_admin', 'societe_admin', 'collaborateur']) {
    await prisma.role.upsert({ where: { nom }, update: {}, create: { nom } });
  }
  for (const m of [
    { nom: 'Projets', cle: 'projets' },
    { nom: 'Finances', cle: 'finances' },
    { nom: 'Documents', cle: 'documents' },
    { nom: 'Communication', cle: 'communication' },
  ]) {
    await prisma.module.upsert({ where: { cle: m.cle }, update: {}, create: m });
  }

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
  const holdingAdmin = await prisma.role.findUniqueOrThrow({ where: { nom: 'holding_admin' } });
  if (
    !(await prisma.utilisateurSocieteRole.findFirst({
      where: { utilisateurId: adminHub.id, societeId: null, roleId: holdingAdmin.id },
    }))
  ) {
    await prisma.utilisateurSocieteRole.create({
      data: { utilisateurId: adminHub.id, societeId: null, roleId: holdingAdmin.id },
    });
  }

  // --- Grey Concrete : société, modules, comptes ------------------------
  const grey = await prisma.societe.upsert({
    where: { slug: 'grey-concrete' },
    update: {},
    create: {
      id: ID_GREY,
      nom: 'Grey Concrete',
      slug: 'grey-concrete',
      logoUrl: '/logos/grey-concrete.jpg',
      logoUrlSombre: '/logos/grey-concrete.jpg',
      couleurMarque: '#c4c4c0',
      icone: 'building-2',
      secteur: 'Promotion immobilière',
    },
  });

  const modules = await prisma.module.findMany();
  for (const mod of modules) {
    await prisma.societeModule.upsert({
      where: { societeId_moduleId: { societeId: grey.id, moduleId: mod.id } },
      update: {},
      create: { societeId: grey.id, moduleId: mod.id, actif: true },
    });
  }

  const roleAdmin = await prisma.role.findUniqueOrThrow({ where: { nom: 'societe_admin' } });
  const roleCollab = await prisma.role.findUniqueOrThrow({ where: { nom: 'collaborateur' } });

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

  // --- On repart propre sur les données métier -------------------------
  // Ordre des FK : canaux (→ messages / lectures en cascade) puis dossiers
  // (→ projet → sections aval, en cascade) puis collaborateurs (celluleId =
  // SetNull, pas de cascade) puis cellules puis clients. Rend `prisma db seed`
  // rejouable sans reset.
  await prisma.canal.deleteMany({ where: { societeId: grey.id } });
  await prisma.dossierCrm.deleteMany({ where: { societeId: grey.id } });
  await prisma.collaborateur.deleteMany({ where: { societeId: grey.id } });
  await prisma.cellule.deleteMany({ where: { societeId: grey.id } });
  await prisma.client.deleteMany({ where: { societeId: grey.id } });

  // --- Clients ------------------------------------------------------
  const clients = await Promise.all(
    [
      { nom: 'M. et Mme Diouf', type: 'particulier' as const, contact: 'Awa Diouf', telephone: '+221 77 123 45 67' },
      { nom: 'Cheikh Mbaye', type: 'particulier' as const, email: 'c.mbaye@example.sn' },
      { nom: 'Fatou Sarr', type: 'particulier' as const, telephone: '+221 78 456 78 90' },
      { nom: 'SCI Ndiaye Frères', type: 'sci' as const, contact: 'Ibrahima Ndiaye', email: 'contact@ndiaye-freres.sn' },
      { nom: 'Teranga Capital', type: 'entreprise' as const, contact: 'Directrice immobilier', telephone: '+221 33 869 45 00' },
    ].map((c) => prisma.client.create({ data: { societeId: grey.id, ...c } })),
  );
  const cli = (i: number) => clients[i].id;

  // --- Cellules (6, cross-fonctionnelles) + collaborateurs -----------
  type M = [string, string, string, NiveauCollaborateur]; // prenom, nom, role, niveau
  const cellulesSeed: [string, M[]][] = [
    ['Cellule Archi 1', [
      ['Aïssatou', 'Faye', 'Architecte', 'senior'],
      ['Lamine', 'Diallo', 'Designer', 'confirme'],
      ['Modou', 'Gueye', 'Conducteur de travaux', 'confirme'],
    ]],
    ['Cellule Archi 2', [
      ['Ousmane', 'Bâ', 'Architecte', 'confirme'],
      ['Bineta', 'Ndour', 'Designer', 'junior'],
      ['Khadija', 'Sow', 'Conductrice de travaux', 'senior'],
    ]],
    ['Cellule Archi 3', [
      ['Mariama', 'Cissé', 'Architecte', 'senior'],
      ['Serigne', 'Top', 'Designer', 'confirme'],
      ['Aliou', 'Ndiaye', 'Conducteur de travaux', 'junior'],
    ]],
    ['Cellule Archi 4', [
      ['Cheikh', 'Sarr', 'Architecte', 'lead'],
      ['Fatoumata', 'Bâ', 'Dessinateur', 'confirme'],
      ['Ibrahima', 'Kane', 'Conducteur de travaux', 'confirme'],
    ]],
    ['Cellule Intérieur', [
      ['Ndèye', 'Diagne', 'Designer', 'senior'],
      ['Pape', 'Mbengue', 'Designer', 'junior'],
      ['Aminata', 'Thiam', 'Décoratrice', 'confirme'],
    ]],
    ['Cellule Études', [
      ['Malick', 'Sy', 'Ingénieur structure', 'senior'],
      ['Rokhaya', 'Ndoye', 'Responsable 3D', 'confirme'],
      ['Souleymane', 'Fall', 'Dessinateur', 'junior'],
    ]],
  ];

  const cellules: Record<string, string> = {};
  for (const [nom, membres] of cellulesSeed) {
    const cel = await prisma.cellule.create({
      data: {
        societeId: grey.id,
        nom,
        membres: {
          create: membres.map(([prenom, n, role, niveau]) => ({
            societeId: grey.id,
            prenom,
            nom: n,
            role,
            niveau,
          })),
        },
      },
    });
    cellules[nom] = cel.id;
  }

  // 2 collaborateurs sans cellule (retirés, pas encore réaffectés) — exerce le
  // bloc « Sans cellule » de la page Équipe.
  await prisma.collaborateur.createMany({
    data: [
      { societeId: grey.id, prenom: 'Awa', nom: 'Diouf', role: 'Architecte', niveau: 'junior' },
      { societeId: grey.id, prenom: 'Moussa', nom: 'Camara', role: 'Dessinateur', niveau: 'stagiaire' },
    ],
  });

  // Un dessinateur + un responsable 3D pour peupler les FK d'avant-projet.
  const dessinateur = await prisma.collaborateur.findFirstOrThrow({
    where: { societeId: grey.id, role: 'Dessinateur' },
  });
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
  let seq = 0;
  const code = () => `PRJ-2026-${String(++seq).padStart(3, '0')}`;

  type Cfg = {
    nature: NatureDossier;
    categorie: Categorie;
    statut: StatutCrm;
    localisation: string;
    lat: number;
    lng: number;
    programme: string;
    type: TypeBien;
    standing: Standing;
    gamme: Gamme;
    clientId: string;
    // si le dossier est validé :
    phase?: Phase;
    equipe?: string;
    avantProjetValide?: boolean;
  };

  const cfgs: Cfg[] = [
    { nature: 'mandat_client', categorie: 'conception', statut: 'valide', phase: 'avant_projet',
      localisation: 'Ngor, Dakar', lat: 14.7470, lng: -17.5140, programme: 'Villa Cap Vert', type: 'villa', standing: 'haut', gamme: 'premium', clientId: cli(0) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'valide', phase: 'permis', equipe: 'Cellule Archi 1', avantProjetValide: true,
      localisation: 'Sacré-Cœur 3, Dakar', lat: 14.7050, lng: -17.4620, programme: 'Duplex Sacré-Cœur', type: 'villa', standing: 'moyen', gamme: 'milieu', clientId: cli(1) },
    { nature: 'promotion_interne', categorie: 'conception', statut: 'valide', phase: 'etudes', equipe: 'Cellule Archi 2', avantProjetValide: true,
      localisation: 'Point E, Dakar', lat: 14.6920, lng: -17.4600, programme: 'Résidence Point E', type: 'immeuble', standing: 'haut', gamme: 'premium', clientId: cli(2) },
    { nature: 'promotion_interne', categorie: 'conception', statut: 'valide', phase: 'chantier', equipe: 'Cellule Archi 3', avantProjetValide: true,
      localisation: 'Almadies, Dakar', lat: 14.7440, lng: -17.5230, programme: 'Villas Cap Ouest', type: 'villa', standing: 'grand', gamme: 'luxe', clientId: cli(3) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'valide', phase: 'livre', equipe: 'Cellule Archi 1', avantProjetValide: true,
      localisation: 'Fann Résidence, Dakar', lat: 14.6870, lng: -17.4640, programme: 'Villa Fann', type: 'villa', standing: 'haut', gamme: 'premium', clientId: cli(0) },
    { nature: 'mandat_client', categorie: 'amenagement', statut: 'valide', phase: 'avant_projet',
      localisation: 'Point E, Dakar', lat: 14.6935, lng: -17.4585, programme: 'Appartement Point E', type: 'bureaux', standing: 'moyen', gamme: 'milieu', clientId: cli(2) },
    { nature: 'promotion_interne', categorie: 'amenagement', statut: 'valide', phase: 'chantier', equipe: 'Cellule Intérieur', avantProjetValide: true,
      localisation: 'Almadies, Dakar', lat: 14.7460, lng: -17.5195, programme: 'Bureaux Almadies Business', type: 'bureaux', standing: 'grand', gamme: 'luxe', clientId: cli(4) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'nouveau',
      localisation: 'Yoff, Dakar', lat: 14.7530, lng: -17.4890, programme: 'Villa Yoff', type: 'villa', standing: 'moyen', gamme: 'milieu', clientId: cli(1) },
    { nature: 'promotion_interne', categorie: 'conception', statut: 'devis_contrat',
      localisation: 'Ouakam, Dakar', lat: 14.7230, lng: -17.4980, programme: 'Résidence Ouakam', type: 'immeuble', standing: 'haut', gamme: 'premium', clientId: cli(3) },
    { nature: 'mandat_client', categorie: 'amenagement', statut: 'annule',
      localisation: 'VDN, Dakar', lat: 14.7280, lng: -17.4600, programme: 'Showroom VDN', type: 'commerce', standing: 'moyen', gamme: 'milieu', clientId: cli(4) },
  ];

  for (const cfg of cfgs) {
    const dossier = await prisma.dossierCrm.create({
      data: {
        societeId: grey.id,
        code: code(),
        nature: cfg.nature,
        categorie: cfg.categorie,
        localisation: cfg.localisation,
        type: cfg.type,
        latitude: cfg.lat,
        longitude: cfg.lng,
        nbPlanches: cfg.categorie === 'conception' ? 3 : 0,
        surfaceTerrain: cfg.categorie === 'conception' ? 350 : 600,
        standing: cfg.standing,
        gamme: cfg.gamme,
        programme: cfg.programme,
        statut: cfg.statut,
        clientId: cfg.clientId,
      },
    });

    if (cfg.statut !== 'valide') continue;

    const phase = cfg.phase ?? 'avant_projet';
    const statut: StatutProjet = cfg.equipe
      ? phase === 'avant_projet'
        ? 'assigne'
        : 'en_cours'
      : 'a_assigner';

    const projet = await prisma.projet.create({
      data: {
        societeId: grey.id,
        dossierCrmId: dossier.id,
        code: dossier.code,
        nature: dossier.nature,
        categorie: dossier.categorie,
        programme: dossier.programme,
        localisation: dossier.localisation,
        // Pin posé une fois le projet lancé ; ceux encore en avant-projet
        // affichent « Localiser » (carte centrée sur Dakar) tant qu'on n'a pas
        // l'adresse du site.
        latitude: phase === 'avant_projet' ? null : dossier.latitude,
        longitude: phase === 'avant_projet' ? null : dossier.longitude,
        type: dossier.type,
        clientId: dossier.clientId,
        celluleId: cfg.equipe ? cellules[cfg.equipe] : null,
        statut,
        phase,
        avantProjet: {
          create: {
            besoinSurface: cfg.categorie === 'conception' ? 320 : 480,
            nbLots: cfg.categorie === 'conception' ? 4 : 12,
            usages: cfg.categorie === 'conception' ? 'Habitation' : 'Bureaux',
            niveauFinition: 'soigne',
            budgetCibleClient: 620_000_000,
            delaiSouhaite: 'Livraison T3 2027',
            dateDebut: cfg.equipe ? '2026-06-01' : null,
            dateFin: cfg.equipe ? '2026-08-31' : null,
            dessinateurId: cfg.equipe ? dessinateur.id : null,
            responsable3dId: cfg.equipe ? resp3d.id : null,
            programmeValide: !!cfg.avantProjetValide,
            budgetValide: !!cfg.avantProjetValide,
            esquisseValidee: !!cfg.avantProjetValide,
            engagementValide: !!cfg.avantProjetValide,
            valideLe: cfg.avantProjetValide ? new Date('2026-08-15') : null,
            validePar: cfg.avantProjetValide ? boss.id : null,
          },
        },
      },
    });

    // Pré-bilan : complet si l'avant-projet est validé, sinon une seule version.
    const etapes = ETAPES[cfg.categorie];
    const lignes = LIGNES[cfg.categorie];
    const nbVersions = cfg.avantProjetValide ? etapes.length : 1;
    const montantsBase = Object.fromEntries(
      lignes.map((l, i) => [l, (i + 1) * 40_000_000]),
    );

    for (let v = 0; v < nbVersions; v++) {
      const couts = Object.fromEntries(
        lignes.map((l) => [l, montantsBase[l] * (1 + v * 0.05)]),
      );
      await prisma.versionPreBilan.create({
        data: {
          projetId: projet.id,
          etape: etapes[v],
          couts,
          prixVenteEstime:
            cfg.nature === 'promotion_interne' ? 2_100_000_000 : null,
          figeeLe: v < nbVersions - 1 ? new Date('2026-08-10') : null,
        },
      });
    }

    // Sous-checklists opérationnelles : 100 % cochées si l'avant-projet est
    // validé, ~50 % sinon (démo — montre l'avancement partiel sur la carte).
    await prisma.ligneChecklistAvp.createMany({
      data: CHECKLISTS_AVANT_PROJET.flatMap((g) =>
        g.items.map((item, ordre) => ({
          avantProjetId: projet.id,
          groupe: g.groupe,
          libelle: item.libelle,
          ordre,
          fait: cfg.avantProjetValide ? true : ordre % 2 === 0,
        })),
      ),
    });

    // -- Phase 2 : permis / études / exécution selon la phase du projet ----
    const phasesPermisEtPlus: Phase[] = ['permis', 'etudes', 'chantier', 'livre'];
    const phasesEtudesEtPlus: Phase[] = ['etudes', 'chantier', 'livre'];
    const phasesChantierEtPlus: Phase[] = ['chantier', 'livre'];

    // Permis — conception uniquement, dès la phase « permis ».
    if (cfg.categorie === 'conception' && phasesPermisEtPlus.includes(phase)) {
      const permisEnMain = phasesEtudesEtPlus.includes(phase);
      await prisma.permis.create({
        data: {
          projetId: projet.id,
          nicad: 'obtenu',
          nicadNumero: `NICAD-DK-2026-0${4000 + seq}`,
          planBornage: true,
          titrePropriete: true,
          planCadastralVise: true,
          plansApd: true,
          devis: true,
          timbreFiscal: true,
          statut: permisEnMain ? 'obtenu' : 'instruction',
          voie: 'teledac',
          dateDepot: new Date('2026-06-01'),
          numeroRecepisse: `TLD-2026-0${700 + seq}`,
          dateObtention: permisEnMain ? new Date('2026-07-15') : null,
          certificatConformite: phase === 'livre',
          dateCertificat: phase === 'livre' ? new Date('2026-09-10') : null,
        },
      });
      await prisma.entreeJournal.createMany({
        data: [
          {
            projetId: projet.id,
            contexte: 'permis',
            date: new Date('2026-06-01'),
            texte: 'Dossier déposé sur TeleDAC.',
            auteurId: boss.id,
          },
          permisEnMain
            ? {
                projetId: projet.id,
                contexte: 'permis',
                date: new Date('2026-07-15'),
                texte: 'Permis accordé — arrêté municipal reçu.',
                auteurId: boss.id,
              }
            : {
                projetId: projet.id,
                contexte: 'permis',
                date: new Date('2026-07-01'),
                texte: 'Passage en instruction technique confirmé par la mairie.',
                auteurId: boss.id,
              },
        ],
      });
    }

    // Études — conception uniquement, dès la phase « études ».
    if (cfg.categorie === 'conception' && phasesEtudesEtPlus.includes(phase)) {
      const enCours = phase === 'etudes'; // toutes les études pas encore bouclées
      await prisma.etudes.create({
        data: {
          projetId: projet.id,
          dceConstitue: !enCours,
          dceLe: enCours ? null : new Date('2026-07-25'),
          lignes: {
            create: [
              { type: 'geotechnique', statut: 'validee', bet: 'Géotech Sénégal', dateRemisePrevue: '2026-05-05', dateRemiseReelle: '2026-05-02' },
              { type: 'topographie', statut: 'validee', bet: 'Cabinet Bâ Géomètre', dateRemisePrevue: '2026-05-05', dateRemiseReelle: '2026-05-04' },
              {
                type: 'structure',
                statut: enCours ? 'remise' : 'validee',
                bet: 'BET Structure Diallo',
                dateRemisePrevue: '2026-06-15',
                dateRemiseReelle: '2026-06-12',
                note: enCours ? 'Rendu reçu, vérification MOE en cours.' : '',
              },
              {
                type: 'fluides',
                statut: enCours ? 'en_cours' : 'validee',
                bet: 'Fluitec',
                dateRemisePrevue: '2026-06-25',
                dateRemiseReelle: enCours ? null : '2026-06-22',
              },
              {
                type: 'electricite',
                statut: enCours ? 'a_lancer' : 'validee',
                bet: enCours ? '' : 'Fluitec',
                dateRemisePrevue: enCours ? null : '2026-06-25',
                dateRemiseReelle: enCours ? null : '2026-06-24',
              },
              { type: 'vrd', statut: 'non_requise', bet: '', note: 'Parcelle déjà viabilisée.' },
            ],
          },
        },
      });
    }

    // Exécution — les deux catégories, dès la phase « chantier ».
    if (phasesChantierEtPlus.includes(phase)) {
      const livre = phase === 'livre';
      const lots = LOTS_PAR_CAT[cfg.categorie];
      const execution = await prisma.execution.create({
        data: {
          projetId: projet.id,
          receptionProvisoire: livre ? '2026-08-20' : null,
          leveeReserves: livre && cfg.categorie === 'conception' ? '2026-09-05' : null,
          receptionDefinitive: livre ? '2026-09-12' : null,
          validationClient: livre && cfg.categorie === 'amenagement',
          dateValidationClient:
            livre && cfg.categorie === 'amenagement' ? '2026-09-08' : null,
          lots: {
            create: lots.map((type, i) => {
              const enConsultation = i === lots.length - 1 && !livre;
              return {
                type,
                statut: livre
                  ? 'termine'
                  : enConsultation
                    ? 'a_consulter'
                    : i === 0
                      ? 'en_cours'
                      : 'attribue',
                entreprisesConsultees: enConsultation
                  ? []
                  : ['SETUBAT', 'Entreprise Fall & Fils'],
                entrepriseRetenue: enConsultation ? '' : 'SETUBAT',
                montantMarche: enConsultation ? 0 : 220_000_000 - i * 40_000_000,
                dateAttribution: enConsultation ? null : '2026-07-28',
                avancement: livre ? 100 : i === 0 ? 55 : 0,
                dateDebut: livre || i === 0 ? '2026-08-01' : null,
                dateFinPrevue: livre || i === 0 ? '2026-12-15' : null,
              };
            }),
          },
          reserves:
            livre && cfg.categorie === 'conception'
              ? {
                  create: [
                    { description: "Reprise peinture cage d'escalier", statut: 'levee', dateLevee: '2026-09-03' },
                    { description: 'Réglage de la porte de garage', statut: 'levee', dateLevee: '2026-09-03' },
                  ],
                }
              : undefined,
        },
        include: { lots: { orderBy: { type: 'asc' } } },
      });

      const premierLot = execution.lots.find((l) => l.montantMarche.gt(0));
      if (premierLot) {
        await prisma.offreEntreprise.createMany({
          data: [
            { lotId: premierLot.id, entreprise: 'SETUBAT', montant: 220_000_000, delaiJours: 210 },
            { lotId: premierLot.id, entreprise: 'Entreprise Fall & Fils', montant: 238_000_000, delaiJours: 240 },
          ],
        });
        const sits: [number, string, number, number, number][] = livre
          ? [
              [1, '2026-08-15', 30, 66_000_000, 3_300_000],
              [2, '2026-09-01', 70, 96_000_000, 4_800_000],
              [3, '2026-09-12', 100, 58_000_000, 2_900_000],
            ]
          : [
              [1, '2026-08-20', 25, 55_000_000, 2_750_000],
              [2, '2026-09-05', 55, 66_000_000, 3_300_000],
            ];
        await prisma.situationPaiement.createMany({
          data: sits.map(([numero, date, avct, montant, retenue]) => ({
            lotId: premierLot.id,
            numero,
            date,
            avancementCumule: avct,
            montantSituation: montant,
            retenueGarantie: retenue,
            montantVerse: montant - retenue,
          })),
        });
      }

      await prisma.entreeJournal.createMany({
        data: [
          {
            projetId: projet.id,
            contexte: 'chantier',
            date: new Date('2026-08-25'),
            texte:
              'Visite hebdo — coulage dalle R+1 conforme. Point sécurité échafaudage.',
            auteurId: boss.id,
          },
          {
            projetId: projet.id,
            contexte: 'chantier',
            date: new Date('2026-09-02'),
            texte: 'Réunion de chantier — validation du calepinage carrelage.',
            auteurId: boss.id,
          },
        ],
      });
    }

    // Quelques images sur les projets les plus avancés (démo galerie/portfolio).
    if (phasesChantierEtPlus.includes(phase)) {
      const px = (label: string, de: string, vers: string) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${vers}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="40" y="560" font-family="Georgia, serif" font-size="34" fill="rgba(255,255,255,0.9)">${label}</text></svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      };
      await prisma.imageProjet.createMany({
        data: [
          {
            projetId: projet.id,
            cle: px('chantier-gros-oeuvre.jpg', '#8c7b5b', '#bfae87'),
            nom: 'chantier-gros-oeuvre.jpg',
            typeMime: 'image/svg+xml',
            usage: 'travail',
            phase: 'chantier',
            ajouteParId: collab.id,
            ajouteLe: new Date('2026-08-26'),
          },
          {
            projetId: projet.id,
            cle: px('facade-livree.jpg', '#4a4f5b', '#9aa1b3'),
            nom: 'facade-livree.jpg',
            typeMime: 'image/svg+xml',
            usage: phase === 'livre' ? 'portfolio' : 'travail',
            phase: phase === 'livre' ? 'livre' : 'chantier',
            legende: phase === 'livre' ? `${cfg.programme} — façade principale` : '',
            ordre: 0,
            ajouteParId: boss.id,
            ajouteLe: new Date('2026-09-13'),
          },
        ],
      });
    }
  }

  // --- Notifications de démo pour Rokhaya (compte collaborateur actif) ------
  // Les alertes d'échéance sont dérivées à la lecture (pas stockées) ; ici on
  // ne pose que les événements discrets.
  const [pAssigne, pPhase] = await Promise.all([
    prisma.projet.findFirst({ where: { societeId: grey.id, code: 'PRJ-2026-003' } }),
    prisma.projet.findFirst({ where: { societeId: grey.id, code: 'PRJ-2026-002' } }),
  ]);
  if (pAssigne && pPhase) {
    await prisma.notification.createMany({
      data: [
        {
          destinataireId: uRokhaya.id,
          societeId: grey.id,
          type: 'projet_assigne',
          projetId: pAssigne.id,
          titre: `${pAssigne.programme} · assigné à ta cellule`,
          parId: boss.id,
          createdAt: new Date('2026-09-05T09:12:00'),
        },
        {
          destinataireId: uRokhaya.id,
          societeId: grey.id,
          type: 'phase_changee',
          projetId: pPhase.id,
          titre: `${pPhase.programme} · passe en phase Permis`,
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
      { canalId: canalGeneral.id, auteurId: boss.id, texte: 'Point équipe demain 10h en salle projet.', createdAt: new Date('2026-09-06T17:02:00') },
      { canalId: canalGeneral.id, auteurId: uRokhaya.id, texte: 'Noté 👍', createdAt: new Date('2026-09-06T17:05:00') },
      { canalId: canalGeneral.id, auteurId: boss.id, texte: 'Les plaquettes GH_PE.24 sont à finaliser cette semaine.', createdAt: new Date('2026-09-07T09:20:00') },
      { canalId: canalGeneral.id, auteurId: boss.id, texte: 'Rokhaya, tu peux passer les rendus façade avant la réunion ?', createdAt: new Date('2026-09-08T08:15:00') },
      { canalId: canauxCellule['Cellule Études'], auteurId: uRokhaya.id, texte: 'Je dépose les fichiers source 3D ici au fur et à mesure.', createdAt: new Date('2026-09-07T11:40:00') },
      { canalId: canauxCellule['Cellule Études'], auteurId: uRokhaya.id, texte: 'Première passe Twin Flame dispo, retours bienvenus.', createdAt: new Date('2026-09-07T16:10:00') },
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

  console.log('Seed terminé.');
  console.log('  Comptes (mdp : changeme123)');
  console.log('   · admin@hub.group                 holding_admin');
  console.log('   · admin.greyconcrete@hub.group    societe_admin  → /admin/grey-concrete');
  console.log('   · collab.greyconcrete@hub.group   collaborateur');
  const nbP = await prisma.projet.count({ where: { societeId: grey.id } });
  const nbD = await prisma.dossierCrm.count({ where: { societeId: grey.id } });
  const nbPermis = await prisma.permis.count();
  const nbEtudes = await prisma.etudes.count();
  const nbExec = await prisma.execution.count();
  const nbCel = await prisma.cellule.count({ where: { societeId: grey.id } });
  const nbCollab = await prisma.collaborateur.count({ where: { societeId: grey.id } });
  console.log(`  Grey Concrete : ${nbD} dossiers CRM, ${nbP} projets`);
  console.log(`  Phase 2 : ${nbPermis} permis, ${nbEtudes} études, ${nbExec} exécutions`);
  console.log(`  Équipe : ${nbCel} cellules, ${nbCollab} collaborateurs`);
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
