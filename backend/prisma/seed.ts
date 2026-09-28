import {
  Categorie,
  EtapePreBilan,
  Gamme,
  NatureDossier,
  NiveauCollaborateur,
  NiveauPermission,
  Phase,
  PrismaClient,
  Standing,
  StatutCrm,
  StatutProjet,
  TypeBien,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CHECKLISTS_AVANT_PROJET } from '../src/projets/domaine/config';
import { codeAvecVariante, genererCodeDossier } from '../src/crm/nomenclature';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CatalogueSource, importerCatalogue } from './catalogue';

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

// IDs figés : un `migrate reset` recrée ces lignes à l'identique, donc un JWT
// déjà émis (societeId / userId dedans) reste valide après un reseed.
const ID_GREY = '11111111-1111-4111-8111-111111111111';
const ID_ADMIN_HUB = '00000000-0000-4000-8000-000000000001';
const ID_BOSS = '00000000-0000-4000-8000-000000000002';
const ID_COLLAB = '00000000-0000-4000-8000-000000000003';
const ID_DIR_GC = '00000000-0000-4000-8000-000000000004';
const ID_CFO = '00000000-0000-4000-8000-000000000005';

async function main() {
  // --- Rôles & modules -------------------------------------------------
  // Rôles socles (societeId null) — rétrocompatibles, pré-créés pour toutes
  // les sociétés ; chacune pourra ensuite définir ses propres rôles.
  // `findFirst` + `create` plutôt que `.upsert()` : Prisma ne sait pas
  // exprimer `null` dans la clé composite d'un `@@unique` portant sur un
  // champ nullable (societeId) — le where-unique généré le type `string`.
  for (const nom of ['holding_admin', 'societe_admin', 'collaborateur']) {
    const existant = await prisma.role.findFirst({ where: { societeId: null, nom } });
    if (!existant) {
      await prisma.role.create({ data: { nom } });
    }
  }
  // 'finances' (bloc unique) a existé un temps mais n'a jamais été lu par
  // aucun guard — remplacé par les 4 sous-modules ci-dessous avant même
  // d'avoir servi, pour ne pas migrer une deuxième fois une fois la matrice
  // de permissions Grey Concrete posée (Dir. GC voit devis+factures mais pas
  // marges, charges réservées CFO — non exprimable sur un module unique).
  await prisma.module.deleteMany({ where: { cle: 'finances' } });
  for (const m of [
    { nom: 'CRM', cle: 'crm' },
    { nom: 'Projets', cle: 'projets' },
    { nom: 'Finances — Devis', cle: 'finances_devis' },
    { nom: 'Finances — Factures', cle: 'finances_factures' },
    { nom: 'Finances — Marges', cle: 'finances_marges' },
    { nom: 'Finances — Charges', cle: 'finances_charges' },
    { nom: 'Équipe', cle: 'equipe' },
    { nom: 'RH', cle: 'rh' },
    { nom: 'Mon espace', cle: 'mon_espace' },
    { nom: 'Pilotage', cle: 'pilotage' },
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

  // --- Grey Concrete : société, modules, comptes ------------------------
  // Pied des documents — valeurs réelles (catalogue JSON + CGV 2026).
  const documentsGrey = {
    mentionsLegales:
      'GREY CONCRETE SARL — NINEA 009429483 — COFI 292 — RCCM SN DKR 2022 B 17567 — Capital 1 000 000 FCFA',
    coordonnees:
      'VDN, Cité CPI, Lot 57, Immeuble Miroir, 3ᵉ étage, Dakar, Sénégal · +221 33 823 61 94 · finances@greyconcrete.group',
    penaliteRetardMensuelle: 1.5,
    // Contrats (étape G) : seuil sur mesure — manuel de procédures, à
    // confirmer. Modèle et signataire VIDES (à fournir par la société).
    contratSeuilSurMesureHt: 50_000_000,
  };
  const grey = await prisma.societe.upsert({
    where: { slug: 'grey-concrete' },
    update: documentsGrey,
    create: {
      ...documentsGrey,
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

  // --- Grey Concrete : rôles métier + matrice de permissions (v2, 2026-09-24) --
  // VALIDÉE PAR LE BOSS le 28/09/2026, telle qu'écrite ci-dessous (96 cases,
  // identiques à la base au moment de la validation) — plus de cases « à
  // confirmer ». Une retouche ultérieure se fait dans Paramètres (écran
  // Rôles) ; la reporter ici pour qu'un re-seed ne l'écrase pas.
  // `transverse: true` = rôle socle holding-wide (Role.societeId null,
  // attribution transverse) ; sinon rôle propre à Grey Concrete.
  const MATRICE_GREY: Record<
    string,
    { transverse: boolean; permissions: Record<string, NiveauPermission> }
  > = {
    'Dir. GC': {
      transverse: false,
      permissions: {
        crm: 'ecriture',
        projets: 'ecriture',
        finances_devis: 'ecriture',
        finances_factures: 'ecriture',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        equipe: 'ecriture',
        rh: 'aucun',
        mon_espace: 'ecriture',
        pilotage: 'lecture',
        documents: 'ecriture',
        communication: 'ecriture',
      },
    },
    COO: {
      transverse: false,
      permissions: {
        crm: 'ecriture',
        projets: 'lecture',
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        equipe: 'aucun',
        rh: 'aucun',
        mon_espace: 'ecriture',
        pilotage: 'aucun',
        documents: 'lecture',
        communication: 'ecriture',
      },
    },
    CFO: {
      transverse: false,
      permissions: {
        crm: 'lecture',
        projets: 'lecture',
        finances_devis: 'validation',
        finances_factures: 'validation',
        finances_marges: 'validation',
        finances_charges: 'validation',
        equipe: 'aucun',
        rh: 'lecture',
        mon_espace: 'aucun',
        pilotage: 'lecture',
        documents: 'lecture',
        communication: 'lecture',
      },
    },
    RH: {
      transverse: false,
      permissions: {
        crm: 'aucun',
        projets: 'aucun',
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        equipe: 'lecture',
        rh: 'ecriture',
        mon_espace: 'validation',
        pilotage: 'lecture',
        documents: 'ecriture',
        communication: 'ecriture',
      },
    },
    Salarié: {
      transverse: false,
      permissions: {
        crm: 'aucun',
        projets: 'aucun',
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        equipe: 'lecture',
        rh: 'aucun',
        mon_espace: 'ecriture',
        pilotage: 'aucun',
        documents: 'lecture',
        communication: 'ecriture',
      },
    },
    'CEO (transverse)': {
      transverse: true,
      permissions: {
        crm: 'lecture',
        projets: 'lecture',
        finances_devis: 'validation',
        finances_factures: 'validation',
        finances_marges: 'validation',
        finances_charges: 'validation',
        equipe: 'lecture',
        rh: 'lecture',
        mon_espace: 'aucun',
        pilotage: 'lecture',
        documents: 'lecture',
        communication: 'lecture',
      },
    },
    'CTO (transverse)': {
      transverse: true,
      permissions: {
        crm: 'lecture',
        projets: 'validation',
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        equipe: 'lecture',
        rh: 'aucun',
        mon_espace: 'ecriture',
        pilotage: 'lecture',
        documents: 'lecture',
        communication: 'lecture',
      },
    },
    'CIO (transverse)': {
      transverse: true,
      permissions: {
        // ecriture (26/09/2026) : le CIO réassigne les dossiers en
        // supervision (CrmService.peutReassigner) — il doit pouvoir entrer
        // dans le CRM et y agir, pas seulement consulter.
        crm: 'ecriture',
        projets: 'aucun',
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        equipe: 'aucun',
        rh: 'aucun',
        mon_espace: 'lecture',
        pilotage: 'aucun',
        documents: 'aucun',
        communication: 'aucun',
      },
    },
  };

  const modulesParCle = new Map(modules.map((m) => [m.cle, m]));

  for (const [nomRole, { transverse, permissions }] of Object.entries(MATRICE_GREY)) {
    const societeIdRole = transverse ? null : grey.id;
    let roleGrey = await prisma.role.findFirst({ where: { societeId: societeIdRole, nom: nomRole } });
    if (!roleGrey) {
      roleGrey = await prisma.role.create({ data: { nom: nomRole, societeId: societeIdRole } });
    }
    for (const [cle, niveau] of Object.entries(permissions)) {
      const mod = modulesParCle.get(cle);
      if (!mod) throw new Error(`Module inconnu dans la matrice Grey Concrete : ${cle}`);
      await prisma.rolePermission.upsert({
        where: { roleId_moduleId: { roleId: roleGrey.id, moduleId: mod.id } },
        update: { niveau },
        create: { roleId: roleGrey.id, moduleId: mod.id, niveau },
      });
    }
  }

  const roleAdmin = await prisma.role.findFirstOrThrow({
    where: { societeId: null, nom: 'societe_admin' },
  });
  // societe_admin = le compte « tout voir » historique de chaque société :
  // lignes EXPLICITES à `validation` sur tous les modules (décision
  // 26/09/2026), plutôt qu'un contournement codé en dur dans PermissionGuard —
  // la matrice reste la seule source de vérité de « qui voit quoi ». Boucle
  // sur le catalogue entier : un module ajouté plus tard est couvert aussi.
  for (const mod of modules) {
    await prisma.rolePermission.upsert({
      where: { roleId_moduleId: { roleId: roleAdmin.id, moduleId: mod.id } },
      update: { niveau: 'validation' },
      create: { roleId: roleAdmin.id, moduleId: mod.id, niveau: 'validation' },
    });
  }
  const roleCollab = await prisma.role.findFirstOrThrow({
    where: { societeId: null, nom: 'collaborateur' },
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

  // Comptes de test pour la matrice de permissions (premier endpoint réel
  // gouverné par elle, cf. pre-bilan.controller.ts) — un rôle qui n'y a pas
  // accès (Dir. GC : finances_marges = aucun) et un qui y a accès (CFO :
  // finances_marges = validation), pour démontrer un vrai 403 vs 200.
  const roleDirGc = await prisma.role.findFirstOrThrow({
    where: { societeId: grey.id, nom: 'Dir. GC' },
  });
  const roleCfo = await prisma.role.findFirstOrThrow({
    where: { societeId: grey.id, nom: 'CFO' },
  });
  const dirGc = await prisma.utilisateur.upsert({
    where: { email: 'dirgc.greyconcrete@hub.group' },
    update: {},
    create: {
      id: ID_DIR_GC,
      email: 'dirgc.greyconcrete@hub.group',
      motDePasseHash: mdp,
      nom: 'Fall',
      prenom: 'Cheikh',
    },
  });
  const cfo = await prisma.utilisateur.upsert({
    where: { email: 'cfo.greyconcrete@hub.group' },
    update: {},
    create: {
      id: ID_CFO,
      email: 'cfo.greyconcrete@hub.group',
      motDePasseHash: mdp,
      nom: 'Sarr',
      prenom: 'Bineta',
    },
  });
  for (const [u, r] of [
    [dirGc, roleDirGc],
    [cfo, roleCfo],
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

  // --- Gabarit Unbord (société) — remplace l'ancien enum TypeUnbord figé.
  // Les 14 items d'origine (cf. historique de src/projets/domaine/config.ts)
  // deviennent les valeurs de départ du gabarit Grey Concrete, pas une page
  // vide : le contenu existe déjà et est en usage sur le terrain.
  const GABARIT_UNBORD_GREY: { groupe: 'documents' | 'releve_existant'; libelle: string }[] = [
    { groupe: 'documents', libelle: 'Plan cadastral' },
    { groupe: 'documents', libelle: 'Droit réel' },
    { groupe: 'documents', libelle: 'Pièce d’identité' },
    { groupe: 'documents', libelle: 'Ninéa' },
    { groupe: 'documents', libelle: 'Plan géomètre' },
    { groupe: 'documents', libelle: 'Rapport d’expertise' },
    { groupe: 'releve_existant', libelle: 'Visite sur site' },
    { groupe: 'releve_existant', libelle: 'Plans (terrain)' },
    { groupe: 'releve_existant', libelle: 'Assainissement' },
    { groupe: 'releve_existant', libelle: 'Eau' },
    { groupe: 'releve_existant', libelle: 'Électricité' },
    { groupe: 'releve_existant', libelle: 'Téléphone' },
    { groupe: 'releve_existant', libelle: 'Photos et vidéos' },
    { groupe: 'releve_existant', libelle: 'Autres informations' },
  ];
  const gabaritExistant = await prisma.ligneUnbordGabarit.findMany({
    where: { societeId: grey.id },
    select: { libelle: true },
  });
  if (gabaritExistant.length === 0) {
    await prisma.ligneUnbordGabarit.createMany({
      data: GABARIT_UNBORD_GREY.map((it, i) => ({
        societeId: grey.id,
        groupe: it.groupe,
        libelle: it.libelle,
        ordre: i,
      })),
    });
  }

  // --- Gabarit Études (société) — restructuration sept. 2026 : les 6 types
  // d'étude fixes (ex-enum TypeEtude) deviennent les 6 blocs de départ du
  // gabarit Grey Concrete. Pas de livrables pré-remplis dans chaque bloc
  // (LigneEtudeGabarit) — contenu métier réel que l'admin ajoutera via
  // Paramètres › Gabarit Études, pas inventé ici (cf. mémoire
  // feedback_dont_invent_business_data).
  const BLOCS_ETUDE_GREY: { cle: string; libelle: string }[] = [
    { cle: 'geotechnique', libelle: 'Étude géotechnique (sol)' },
    { cle: 'topographie', libelle: 'Relevé topographique' },
    { cle: 'structure', libelle: 'Structure / béton armé' },
    { cle: 'fluides', libelle: 'Fluides (plomberie / CVC)' },
    { cle: 'electricite', libelle: 'Électricité (courants forts / faibles)' },
    { cle: 'vrd', libelle: 'VRD (voirie & réseaux divers)' },
  ];
  const blocsEtudeGabaritExistants = await prisma.blocEtudeGabarit.findMany({
    where: { societeId: grey.id },
  });
  const blocEtudeGabaritIdParCle = new Map<string, string>();
  if (blocsEtudeGabaritExistants.length === 0) {
    for (let i = 0; i < BLOCS_ETUDE_GREY.length; i++) {
      const b = BLOCS_ETUDE_GREY[i];
      const cree = await prisma.blocEtudeGabarit.create({
        data: { societeId: grey.id, libelle: b.libelle, ordre: i },
      });
      blocEtudeGabaritIdParCle.set(b.cle, cree.id);
    }
  } else {
    for (const b of blocsEtudeGabaritExistants) {
      const cle = BLOCS_ETUDE_GREY.find((x) => x.libelle === b.libelle)?.cle;
      if (cle) blocEtudeGabaritIdParCle.set(cle, b.id);
    }
  }

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

  // --- Annexes de contrat (étape G) : liste de départ du cadrage ------------
  if ((await prisma.annexeContratGabarit.count({ where: { societeId: grey.id } })) === 0) {
    await prisma.annexeContratGabarit.createMany({
      data: [
        { societeId: grey.id, libelle: 'Offre acceptée', automatique: 'offre', ordre: 0 },
        { societeId: grey.id, libelle: 'Planning', ordre: 1 },
        { societeId: grey.id, libelle: 'Plans du terrain', ordre: 2 },
      ],
    });
  }

  // --- Catalogue réel (prisma/data/catalogue-grey-concrete.json) -----------
  // Upsert par code : rejouable, resynchronise les tarifs sur la source.
  await importerCatalogue(
    prisma,
    grey.id,
    JSON.parse(
      readFileSync(join(__dirname, 'data', 'catalogue-grey-concrete.json'), 'utf8'),
    ) as CatalogueSource,
  );

  // --- Clients ------------------------------------------------------
  const clients = await Promise.all(
    [
      { nom: 'M. et Mme Diouf', type: 'particulier' as const, contact: 'Awa Diouf', telephone: '+221 77 123 45 67' },
      { nom: 'Cheikh Mbaye', type: 'particulier' as const, email: 'c.mbaye@example.sn' },
      { nom: 'Fatou Sarr', type: 'particulier' as const, telephone: '+221 78 456 78 90' },
      { nom: 'SCI Ndiaye Frères', type: 'sci' as const, sigle: 'SNF', contact: 'Ibrahima Ndiaye', email: 'contact@ndiaye-freres.sn' },
      { nom: 'Teranga Capital', type: 'entreprise' as const, sigle: 'TC', contact: 'Directrice immobilier', telephone: '+221 33 869 45 00' },
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

  type Cfg = {
    nature: NatureDossier;
    categorie: Categorie;
    statut: StatutCrm;
    localisation: string;
    // Code de la localité du référentiel (importé par migration) — sert aussi
    // au segment LOC du code dossier.
    localiteCode: string;
    // Apporteur tiers (démo) ; absent = apporteur interne (le créateur).
    apporteurExterne?: { nom: string; telephone?: string; commission?: number };
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
    { nature: 'mandat_client', categorie: 'conception', statut: 'onboard', phase: 'avant_projet',
      localisation: 'Ngor, Dakar', localiteCode: 'NGO', lat: 14.7470, lng: -17.5140, programme: 'Villa Cap Vert', type: 'villa', standing: 'haut', gamme: 'premium', clientId: cli(0) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'onboard', phase: 'permis', equipe: 'Cellule Archi 1', avantProjetValide: true,
      localisation: 'Sacré-Cœur 3, Dakar', localiteCode: 'SAC', lat: 14.7050, lng: -17.4620, programme: 'Duplex Sacré-Cœur', type: 'villa', standing: 'moyen', gamme: 'milieu', clientId: cli(1) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'onboard', phase: 'etudes', equipe: 'Cellule Archi 2', avantProjetValide: true,
      localisation: 'Point E, Dakar', localiteCode: 'POI', lat: 14.6920, lng: -17.4600, programme: 'Résidence Point E', type: 'immeuble', standing: 'haut', gamme: 'premium', clientId: cli(2) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'onboard', phase: 'chantier', equipe: 'Cellule Archi 3', avantProjetValide: true,
      localisation: 'Almadies, Dakar', localiteCode: 'ALM', apporteurExterne: { nom: 'Me Aliou Ndiaye (notaire)', telephone: '+221 77 555 12 34', commission: 4 }, lat: 14.7440, lng: -17.5230, programme: 'Villas Cap Ouest', type: 'villa', standing: 'grand', gamme: 'luxe', clientId: cli(3) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'onboard', phase: 'livre', equipe: 'Cellule Archi 1', avantProjetValide: true,
      localisation: 'Fann Résidence, Dakar', localiteCode: 'FPE', lat: 14.6870, lng: -17.4640, programme: 'Villa Fann', type: 'villa', standing: 'haut', gamme: 'premium', clientId: cli(0) },
    { nature: 'mandat_client', categorie: 'amenagement', statut: 'onboard', phase: 'avant_projet',
      localisation: 'Point E, Dakar', localiteCode: 'POI', lat: 14.6935, lng: -17.4585, programme: 'Appartement Point E', type: 'bureaux', standing: 'moyen', gamme: 'milieu', clientId: cli(2) },
    { nature: 'mandat_client', categorie: 'amenagement', statut: 'onboard', phase: 'chantier', equipe: 'Cellule Intérieur', avantProjetValide: true,
      localisation: 'Almadies, Dakar', localiteCode: 'ALM', lat: 14.7460, lng: -17.5195, programme: 'Bureaux Almadies Business', type: 'bureaux', standing: 'grand', gamme: 'luxe', clientId: cli(4) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'nouveau_projet',
      localisation: 'Yoff, Dakar', localiteCode: 'YOF', lat: 14.7530, lng: -17.4890, programme: 'Villa Yoff', type: 'villa', standing: 'moyen', gamme: 'milieu', clientId: cli(1) },
    { nature: 'mandat_client', categorie: 'conception', statut: 'offre_envoyee',
      localisation: 'Ouakam, Dakar', localiteCode: 'OUA', apporteurExterne: { nom: 'Khady Seck' }, lat: 14.7230, lng: -17.4980, programme: 'Résidence Ouakam', type: 'immeuble', standing: 'haut', gamme: 'premium', clientId: cli(3) },
    { nature: 'mandat_client', categorie: 'amenagement', statut: 'perdu',
      localisation: 'VDN, Dakar', localiteCode: 'VDN', lat: 14.7280, lng: -17.4600, programme: 'Showroom VDN', type: 'commerce', standing: 'moyen', gamme: 'milieu', clientId: cli(4) },
  ];

  const localiteParCode = new Map(
    (await prisma.localite.findMany({ select: { id: true, code: true } })).map((l) => [
      l.code,
      l.id,
    ]),
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

  for (const cfg of cfgs) {
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
        nbPlanches: cfg.categorie === 'conception' ? 3 : 0,
        surfaceTerrain: cfg.categorie === 'conception' ? 350 : 600,
        standing: cfg.standing,
        gamme: cfg.gamme,
        programme: cfg.programme,
        statut: cfg.statut,
        clientId: cfg.clientId,
        // « Qui » (étape C1) : saisis par le compte admin, suivis par le
        // Dir. GC de test (seul titulaire du rôle → propriétaire d'office).
        creeParId: boss.id,
        apporteurType: cfg.apporteurExterne ? 'externe' : 'interne',
        apporteurUtilisateurId: cfg.apporteurExterne ? null : boss.id,
        apporteurNom: cfg.apporteurExterne?.nom ?? null,
        apporteurTelephone: cfg.apporteurExterne?.telephone ?? null,
        commissionApporteur: cfg.apporteurExterne?.commission ?? null,
        proprietaireId: dirGc.id,
      },
    });

    // Journal du cycle (étape E) : le chemin réellement parcouru jusqu'au
    // statut de démo — saisi par l'admin, validé par la CFO de test.
    const chemin: { de: StatutCrm | null; vers: StatutCrm; par: string; commentaire?: string }[] = [
      { de: null, vers: 'nouveau_projet', par: boss.id },
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

    if (cfg.statut !== 'onboard') continue;

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
        cellules: cfg.equipe ? { create: [{ celluleId: cellules[cfg.equipe] }] } : undefined,
        statut,
        phase,
        avantProjet: {
          create: {
            dateDebut: cfg.equipe ? '2026-06-01' : null,
            dateFin: cfg.equipe ? '2026-08-31' : null,
            dessinateurId: cfg.equipe ? dessinateur.id : null,
            responsable3dId: cfg.equipe ? resp3d.id : null,
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

    // Sous-checklists opérationnelles — statut dérivé des fichiers joints
    // (restructuration sept. 2026, cf. schema.prisma) : pas de champ « fait »
    // à seeder ici, les lignes démarrent toutes « en attente ».
    await prisma.ligneChecklistAvp.createMany({
      data: CHECKLISTS_AVANT_PROJET.flatMap((g) =>
        g.items.map((item, ordre) => ({
          avantProjetId: projet.id,
          groupe: g.groupe,
          libelle: item.libelle,
          ordre,
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
          titrePropriete: true,
          planCadastralVise: true,
          plansApd: true,
          devis: true,
          timbreFiscal: true,
          statut: permisEnMain ? 'obtenu' : 'a_deposer',
          dateObtention: permisEnMain ? new Date('2026-07-15') : null,
        },
      });
    }

    // Études — conception uniquement, dès la phase « études ».
    if (cfg.categorie === 'conception' && phasesEtudesEtPlus.includes(phase)) {
      const enCours = phase === 'etudes'; // toutes les études pas encore bouclées
      const idGeotechnique = blocEtudeGabaritIdParCle.get('geotechnique');
      const idTopographie = blocEtudeGabaritIdParCle.get('topographie');
      const idStructure = blocEtudeGabaritIdParCle.get('structure');
      const idFluides = blocEtudeGabaritIdParCle.get('fluides');
      const idElectricite = blocEtudeGabaritIdParCle.get('electricite');
      const idVrd = blocEtudeGabaritIdParCle.get('vrd');
      await prisma.etudes.create({
        data: {
          projetId: projet.id,
          dceConstitue: !enCours,
          dceLe: enCours ? null : new Date('2026-07-25'),
          blocs: {
            create: [
              {
                blocEtudeGabaritId: idGeotechnique,
                libelle: 'Étude géotechnique (sol)',
                statut: 'validee',
                interlocuteur: 'Géotech Sénégal',
                dateRemisePrevue: '2026-05-05',
                dateRemiseReelle: '2026-05-02',
              },
              {
                blocEtudeGabaritId: idTopographie,
                libelle: 'Relevé topographique',
                statut: 'validee',
                interlocuteur: 'Cabinet Bâ Géomètre',
                dateRemisePrevue: '2026-05-05',
                dateRemiseReelle: '2026-05-04',
              },
              {
                blocEtudeGabaritId: idStructure,
                libelle: 'Structure / béton armé',
                statut: enCours ? 'remise' : 'validee',
                interlocuteur: 'BET Structure Diallo',
                dateRemisePrevue: '2026-06-15',
                dateRemiseReelle: '2026-06-12',
                note: enCours ? 'Rendu reçu, vérification MOE en cours.' : '',
              },
              {
                blocEtudeGabaritId: idFluides,
                libelle: 'Fluides (plomberie / CVC)',
                statut: enCours ? 'en_cours' : 'validee',
                interlocuteur: 'Fluitec',
                dateRemisePrevue: '2026-06-25',
                dateRemiseReelle: enCours ? null : '2026-06-22',
              },
              {
                blocEtudeGabaritId: idElectricite,
                libelle: 'Électricité (courants forts / faibles)',
                statut: enCours ? 'a_lancer' : 'validee',
                interlocuteur: enCours ? '' : 'Fluitec',
                dateRemisePrevue: enCours ? null : '2026-06-25',
                dateRemiseReelle: enCours ? null : '2026-06-24',
              },
              {
                blocEtudeGabaritId: idVrd,
                libelle: 'VRD (voirie & réseaux divers)',
                statut: 'non_requise',
                note: 'Parcelle déjà viabilisée.',
              },
            ],
          },
        },
      });
    }

    // Exécution — les deux catégories, dès la phase « chantier ». La
    // checklist (8 blocs) est amorcée à la volée au premier GET, comme celle
    // du Permis (assurerChecklist/assurerBlocs) — rien à seeder ici.

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
    prisma.projet.findFirst({ where: { societeId: grey.id, programme: 'Résidence Point E' } }),
    prisma.projet.findFirst({ where: { societeId: grey.id, programme: 'Duplex Sacré-Cœur' } }),
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
  const nbCel = await prisma.cellule.count({ where: { societeId: grey.id } });
  const nbCollab = await prisma.collaborateur.count({ where: { societeId: grey.id } });
  console.log(`  Grey Concrete : ${nbD} dossiers CRM, ${nbP} projets`);
  console.log(`  Phase 2 : ${nbPermis} permis, ${nbEtudes} études`);
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
