import { NiveauPermission, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CatalogueSource, importerCatalogue } from './catalogue';

// Socle RÉEL du HUB : rôles, modules, société Grey Concrete (pied des
// documents), matrice de permissions validée par le boss, catalogue réel,
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
        pilotage: 'lecture',
        documents: 'ecriture',
        communication: 'ecriture',
      },
    },
    COO: {
      transverse: false,
      permissions: {
        crm: 'ecriture',
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
        // aux projets où une tâche lui est assignée (projets/gabarit/validation.ts).
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
        communication: 'lecture',
      },
    },
    'CTO (transverse)': {
      transverse: true,
      permissions: {
        crm: 'lecture',
        projets: 'validation',
        // Finances ouvertes, comme le CIO (maquette Finances, oct. 2026).
        finances_devis: 'ecriture',
        finances_factures: 'ecriture',
        finances_marges: 'lecture',
        finances_charges: 'lecture',
        equipe: 'lecture',
        rh: 'aucun',
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
        // ecriture (01/10/2026) : maquette « Projets » du boss — le CIO lit
        // tous les projets ouverts et assigne (« Lecture et assignation ·
        // accès complet ») ; la validation reste au chef de team / DPLG.
        projets: 'ecriture',
        // Finances ouvertes (maquette Finances, oct. 2026 : « CFO, CEO, CTO,
        // CIO : tout, y compris tableau de bord et rentabilité ») : préparer
        // devis et factures, lire marges et charges ; la validation (émission,
        // offres) reste au CFO.
        finances_devis: 'ecriture',
        finances_factures: 'ecriture',
        finances_marges: 'lecture',
        finances_charges: 'lecture',
        // ecriture (02/10/2026, décision du boss) : maquette « Équipes » — le
        // CIO crée les cellules et réaffecte ; CTO et CEO restent en lecture.
        equipe: 'ecriture',
        rh: 'aucun',
        // lecture (05/10/2026, demande du boss) : page Pilotage, comme le CTO ;
        // ses actions vont par fonction (émetteur, CTO / CEO, responsable).
        pilotage: 'lecture',
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

  return { grey, modules, roleAdmin };
}
