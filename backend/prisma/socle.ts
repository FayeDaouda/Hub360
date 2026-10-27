import { NiveauPermission, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CatalogueSource, importerCatalogue } from './catalogue';

// Socle RÉEL du HUB : rôles, modules, société Grey Concrete (pied des
// documents), autres sociétés du groupe annoncées « Bientôt », matrice de permissions validée par le boss, catalogue réel,
// annexes de contrat. Aucune donnée fictive — partagé par le seed de démo
// (seed.ts) et l'amorçage d'une vraie installation (demarrage.ts).
// Idempotent : upserts, rejouable sans rien dupliquer.

// ID figé : un `migrate reset` recrée la société à l'identique, donc un JWT
// déjà émis (societeId dedans) reste valide après un reseed.
export const ID_GREY = '11111111-1111-4111-8111-111111111111';

export async function installerSocle(prisma: PrismaClient) {
  // --- Rôles & modules -------------------------------------------------
  // Rôles socles (societeId null) — rétrocompatibles, pré-créés pour toutes
  // les sociétés ; chacune pourra ensuite définir ses propres rôles.
  // `findFirst` + `create` plutôt que `.upsert()` : Prisma ne sait pas
  // exprimer `null` dans la clé composite d'un `@@unique` portant sur un
  // champ nullable (societeId) — le where-unique généré le type `string`.
  for (const nom of ['holding_admin', 'societe_admin']) {
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
    // Revue COO (22/10/2026) : totaux HT du pipeline, sans le détail des offres.
    { nom: 'CRM — Totaux HT', cle: 'crm_totaux' },
    { nom: 'Projets', cle: 'projets' },
    { nom: 'Finances — Devis', cle: 'finances_devis' },
    { nom: 'Finances — Factures', cle: 'finances_factures' },
    { nom: 'Finances — Marges', cle: 'finances_marges' },
    { nom: 'Finances — Charges', cle: 'finances_charges' },
    { nom: 'Équipe', cle: 'equipe' },
    { nom: 'RH', cle: 'rh' },
    { nom: 'Pilotage', cle: 'pilotage' },
    { nom: 'Documents', cle: 'documents' },
    { nom: 'Communication', cle: 'communication' },
  ]) {
    await prisma.module.upsert({ where: { cle: m.cle }, update: {}, create: m });
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
      // Symbole seul (G recadré, trait renforcé) : lisible en petit à côté du nom.
      logoUrlSombre: '/logos/grey-concrete-symbole.png',
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

  // --- Autres sociétés du groupe, annoncées « Bientôt » sur le portail ------
  // Logos fournis (public/logos) ; Grey Holding n'a pas de symbole carré :
  // sa tuile reprend les tracés de son logo, « GREY » sur « HOLDING ».
  // Secteur pas encore communiqué : vide (rien d'inventé). Extra viendra avec
  // son logo. update vide : une fois ouverte (accesOuvert passé à true), un
  // re-seed ne la referme pas.
  const SOCIETES_BIENTOT = [
    {
      nom: "CODE'D Group",
      slug: 'coded',
      logoUrl: '/logos/coded.jpg',
      logoUrlSombre: '/logos/coded.jpg',
      couleurMarque: '#e84e0e',
    },
    {
      nom: 'Grey Holding',
      slug: 'grey-holding',
      logoUrl: '/logos/grey-holding.svg',
      logoUrlSombre: '/logos/grey-holding-symbole.svg',
      couleurMarque: '#b1b1b1',
    },
  ];
  for (const societe of SOCIETES_BIENTOT) {
    await prisma.societe.upsert({
      where: { slug: societe.slug },
      update: {},
      create: { ...societe, accesOuvert: false },
    });
  }

  // --- Grey Concrete : rôles métier + matrice de permissions (v2, 2026-09-24) --
  // VALIDÉE PAR LE BOSS le 28/09/2026, telle qu'écrite ci-dessous (96 cases,
  // identiques à la base au moment de la validation) — plus de cases « à
  // confirmer ». Une retouche ultérieure se fait dans Paramètres (écran
  // Rôles) ; la reporter ici pour qu'un re-seed ne l'écrase pas.
  // `transverse: true` = rôle socle holding-wide (Role.societeId null,
  // attribution transverse) ; sinon rôle propre à Grey Concrete.
  const MATRICE_GREY: Record<string, { transverse: boolean; permissions: Record<string, NiveauPermission> }> = {
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
        pilotage: 'lecture',
        documents: 'ecriture',
        communication: 'ecriture',
      },
    },
    COO: {
      transverse: false,
      permissions: {
        crm: 'ecriture',
        // lecture (22/10/2026, revue COO) : le pipeline en FCFA HT par étape,
        // sans voir les offres (finances_devis reste à aucun).
        crm_totaux: 'lecture',
        // aucun (06/10/2026, maquette COO validée par le user) : pas de Projets
        // dans son menu ; Pilotage ouvert en lecture (ci-dessous).
        projets: 'aucun',
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        equipe: 'aucun',
        rh: 'aucun',
        pilotage: 'lecture',
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
        pilotage: 'lecture',
        documents: 'lecture',
        // ecriture (22/10/2026, revue CIO) : tous les directeurs écrivent dans le chat.
        communication: 'ecriture',
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
        pilotage: 'lecture',
        documents: 'ecriture',
        communication: 'ecriture',
      },
    },
    Salarié: {
      transverse: false,
      permissions: {
        crm: 'aucun',
        // lecture (06/10/2026, maquette Salarié validée par le user) : limitée
        // aux projets où une tâche lui est assignée (projects/review-rules.ts).
        projets: 'lecture',
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        // aucun (revue Salarié 19/10/2026, user) : Équipes montre la charge
        // des collègues ; son équipe est dans Mon espace › Ma cellule, et
        // l'annuaire passe par la fiche contact (Ctrl+K, chat).
        equipe: 'aucun',
        rh: 'aucun',
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
        // Finances (12/10/2026, décision du boss) : tout voir ; valider les
        // devis et factures des seules affaires au-delà du seuil de
        // contresignature (finances/seuil-ceo.service.ts) ; marges et charges
        // en consultation — la CFO règle les charges.
        finances_devis: 'validation',
        finances_factures: 'validation',
        finances_marges: 'lecture',
        finances_charges: 'lecture',
        equipe: 'lecture',
        rh: 'lecture',
        // ecriture (12/10/2026, décision du boss) : son propre espace (congés,
        // remboursements, documents) et l'onglet « À valider » — il est le
        // N+1 des directeurs (COO, CFO, CTO, CIO ; rh/demandes.service.ts).
        pilotage: 'lecture',
        documents: 'lecture',
        // ecriture (22/10/2026, revue CIO) : tous les directeurs écrivent dans le chat.
        communication: 'ecriture',
      },
    },
    'CTO (transverse)': {
      transverse: true,
      permissions: {
        crm: 'lecture',
        projets: 'validation',
        // lecture (21/10/2026, revue Dir. GC / CTO) : le CTO supervise, il ne
        // prépare ni devis ni factures. Avant : ecriture (maquette Finances).
        finances_devis: 'lecture',
        finances_factures: 'lecture',
        finances_marges: 'lecture',
        finances_charges: 'lecture',
        equipe: 'lecture',
        rh: 'aucun',
        pilotage: 'lecture',
        documents: 'lecture',
        // ecriture (22/10/2026, revue CIO) : tous les directeurs écrivent dans le chat.
        communication: 'ecriture',
      },
    },
    'CIO (transverse)': {
      transverse: true,
      permissions: {
        // lecture (22/10/2026, revue CIO) : limité à la réassignation des
        // dossiers (CrmService.peutReassigner, route en lecture). Avant :
        // ecriture (26/09/2026).
        crm: 'lecture',
        // lecture (22/10/2026, revue CIO) : sans assignation, même en
        // suppléance — le Dir. GC organise. Avant : ecriture (01/10/2026,
        // maquette « Projets » du boss).
        projets: 'lecture',
        // aucun (22/10/2026, revue CIO) : celui qui gère les droits n'a pas la
        // main sur l'argent. Avant : devis et factures en écriture, marges et
        // charges en lecture (maquette Finances, oct. 2026).
        finances_devis: 'aucun',
        finances_factures: 'aucun',
        finances_marges: 'aucun',
        finances_charges: 'aucun',
        // lecture (21/10/2026, revue Dir. GC) : le Dir. GC organise les
        // cellules (il connaît projets, compétences et charge) ; le CIO gère
        // comptes et droits, pas l'organisation du travail. Avant : ecriture
        // (02/10/2026, maquette « Équipes »).
        equipe: 'lecture',
        rh: 'aucun',
        // lecture (05/10/2026, demande du boss) : page Pilotage, comme le CTO ;
        // ses actions vont par fonction (émetteur, CTO / CEO, responsable).
        pilotage: 'lecture',
        documents: 'aucun',
        // ecriture (22/10/2026, revue CIO) : tous les directeurs écrivent dans
        // le chat, CIO compris. Avant : aucun.
        communication: 'ecriture',
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
  // Sauf les marges et la RH (décision 12 du 21/10/2026, revue CFO) : le
  // compte de secours ne voit ni salaires ni rentabilité.
  const SANS_ACCES_ADMIN = new Set(['finances_marges', 'rh']);
  for (const mod of modules) {
    const niveau = SANS_ACCES_ADMIN.has(mod.cle) ? 'aucun' : 'validation';
    await prisma.rolePermission.upsert({
      where: { roleId_moduleId: { roleId: roleAdmin.id, moduleId: mod.id } },
      update: { niveau },
      create: { roleId: roleAdmin.id, moduleId: mod.id, niveau },
    });
  }

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
    JSON.parse(readFileSync(join(__dirname, 'data', 'catalogue-grey-concrete.json'), 'utf8')) as CatalogueSource,
  );

  return { grey, modules, roleAdmin };
}
