import { PrismaClient, type Prisma } from '@prisma/client';
import { planFacturationOffre } from '../src/projets/domaine/facturation-offre';
import { JALONS_FACTURE, typeFactureDepuisNature, type PartsFactures } from '../src/projets/domaine/config';
import { REGLES } from '../src/reglages/definitions';
import { VALIDITE_OFFRE_JOURS, ajouterJours } from '../src/devis/domaine';
import { DELAI_PAIEMENT_DIRECTE_JOURS } from '../src/projets/facturation/facture-directe';

// Devis et factures FICTIFS de démonstration (maquette Finances, oct. 2026) —
// « tarifs et montants fictifs de démonstration ». Les montants viennent du
// catalogue réel (CO × surface × planches) et des règles du code (plan
// F1 / F2 / F3 de l'offre, parts par défaut des Réglages, validité 7 j,
// échéance 15 j) ; seuls les scénarios et les dates sont inventés, étalés sur
// les mois passés pour peupler les onglets et le tableau de bord.
//
// Utilisé par seed.ts ET exécutable seul (npm run finances-demo) : ne crée
// rien si la société a déjà un devis ou une facture (non destructif) ; la
// chronologie des leads, elle, se réaligne à chaque passage.

const PARTS_DEFAUT = REGLES.find((r) => r.cle === 'parts_factures')!.defaut as PartsFactures;

const jour = (d: Date) => d.toISOString().slice(0, 10);
const ilYA = (jours: number) => new Date(Date.now() - jours * 86_400_000);
const plus = (d: Date, jours: number) => new Date(d.getTime() + jours * 86_400_000);

// Avancement de la facturation par phase du projet : nombre de tranches
// F1/F2/F3 émises, et sort de la dernière émise (soldée, en retard, partielle,
// pas encore échue).
type Sort = 'payee' | 'retard' | 'partielle' | 'a_echoir';
const SCENARIO: Record<string, { emises: number; derniere: Sort }> = {
  avant_projet: { emises: 1, derniere: 'payee' },
  permis: { emises: 2, derniere: 'retard' },
  etudes: { emises: 2, derniere: 'partielle' },
  chantier: { emises: 3, derniere: 'a_echoir' },
  livre: { emises: 3, derniere: 'payee' },
};

// Délais prévisionnels de démonstration (jours après le bon pour accord).
const DELAIS_DEMO: Record<string, number> = { 'CO:F1': 0, 'CO:F2': 60, 'CO:F3': 150, 'IM:18': 90 };

export async function creerFinancesDemo(prisma: PrismaClient, societeId: string): Promise<{ devis: number; factures: number }> {
  const deja = (await prisma.devis.count({ where: { societeId } })) + (await prisma.facture.count({ where: { societeId } }));
  if (deja > 0) return { devis: 0, factures: 0 };
  const r = await creer(prisma, societeId);
  await alignerChronologie(prisma, societeId);
  return r;
}

// Chronologie des leads alignée sur leurs offres (Feuille de temps) : lead
// créé 3 j avant l'offre, soumis au CFO le lendemain, offre envoyée, bon pour
// accord, onboard le lendemain (signature du contrat), perdu à la réponse.
// Idempotent : rejouable sur une base déjà peuplée.
export async function alignerChronologie(prisma: PrismaClient, societeId: string) {
  const offres = await prisma.devis.findMany({
    where: { societeId, dossierCrmId: { not: null }, rangDossier: 1 },
    select: { dossierCrmId: true, creeLe: true, dateEnvoi: true, dateReponse: true, statut: true },
  });
  for (const o of offres) {
    const dossierId = o.dossierCrmId!;
    const dates: [string, Date | null][] = [
      ['nouveau_projet', plus(o.creeLe, -3)],
      ['en_validation', plus(o.creeLe, 1)],
      ['offre_envoyee', o.dateEnvoi],
      ['onboard', o.statut === 'accepte' && o.dateReponse ? plus(o.dateReponse, 1) : null],
      ['perdu', o.statut === 'refuse' ? o.dateReponse : null],
    ];
    await prisma.dossierCrm.update({ where: { id: dossierId }, data: { createdAt: plus(o.creeLe, -3) } });
    for (const [vers, le] of dates) {
      if (!le) continue;
      const maj = await prisma.dossierCrmTransition.updateMany({ where: { dossierId, vers: vers as never }, data: { creeLe: le } });
      // Offre soumise par la démo (lead « En validation ») : sa transition.
      if (maj.count === 0 && vers === 'en_validation' && o.statut === 'brouillon') {
        await prisma.dossierCrmTransition.create({ data: { dossierId, de: 'nouveau_projet', vers: 'en_validation', creeLe: le } });
      }
    }
  }
}

async function creer(prisma: PrismaClient, societeId: string): Promise<{ devis: number; factures: number }> {

  const catalogue = new Map(
    (await prisma.produitService.findMany({ where: { societeId, supprime: false } })).map((p) => [p.code ?? '', p]),
  );
  const dossiers = await prisma.dossierCrm.findMany({
    where: { societeId, archiveLe: null },
    include: { projet: { select: { id: true, code: true, phase: true, nature: true } } },
    orderBy: { code: 'asc' },
  });

  type Dossier = (typeof dossiers)[number];

  // Lignes d'offre : conception au tarif de la catégorie du dossier, plus deux
  // rendus intérieurs une fois sur deux.
  function lignesOffre(d: Dossier, i: number): Prisma.LigneDevisCreateWithoutDevisInput[] {
    const co = catalogue.get(d.categorieConception ?? 'CO2') ?? catalogue.get('CO2')!;
    const surface = Math.max(d.surfaceTerrain, 150);
    const planches = Math.max(d.nbPlanches, 1);
    const lignes: Prisma.LigneDevisCreateWithoutDevisInput[] = [
      {
        produitService: { connect: { id: co.id } },
        designation: co.designation,
        surfaceM2: surface,
        planches,
        quantite: surface * planches,
        prixUnitaire: co.prixUnitaire!,
        tauxTva: co.tauxTva,
        ordre: 0,
      },
    ];
    const im = catalogue.get('IM2');
    if (im && i % 2 === 0) {
      lignes.push({ produitService: { connect: { id: im.id } }, designation: im.designation, quantite: 2, prixUnitaire: im.prixUnitaire!, tauxTva: im.tauxTva, ordre: 1 });
    }
    return lignes;
  }

  // 1. Offres, créées dans l'ordre chronologique (numéro de société à l'envoi).
  //    Dossiers « onboard » : offre acceptée, un dossier signé toutes les ~5
  //    semaines ; leads en cours : une offre chez le client, une refusée (lead
  //    perdu), une soumise au CFO (lead « En validation »).
  type StatutOffre = 'brouillon' | 'envoye' | 'accepte' | 'refuse';
  const onboard = dossiers.filter((d) => d.statut === 'onboard' && d.projet);
  const autres = dossiers.filter((d) => !d.projet);
  const enValidation = autres.find((d) => d.statut === 'nouveau_projet' && d.nbPlanches > 0 && d.surfaceTerrain > 0);
  const specs: { d: Dossier; i: number; statut: StatutOffre; creeLe: Date }[] = [
    ...onboard.map((d, i) => ({ d, i, statut: 'accepte' as const, creeLe: ilYA(285 - i * 38) })),
    ...autres.filter((d) => d.statut === 'offre_envoyee').slice(0, 1).map((d) => ({ d, i: 1, statut: 'envoye' as const, creeLe: ilYA(5) })),
    ...autres.filter((d) => d.statut === 'perdu').slice(0, 1).map((d) => ({ d, i: 2, statut: 'refuse' as const, creeLe: ilYA(64) })),
    ...(enValidation ? [{ d: enValidation, i: 0, statut: 'brouillon' as const, creeLe: ilYA(2) }] : []),
  ].sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime());

  let numeroDevis = 0;
  const acceptees: { d: Dossier; i: number; debut: Date; offreId: string; plan: ReturnType<typeof planFacturationOffre> }[] = [];
  for (const { d, i, statut, creeLe } of specs) {
    const envoi = statut === 'brouillon' ? null : plus(creeLe, 2);
    const o = await prisma.devis.create({
      data: {
        societeId,
        clientId: d.clientId,
        dossierCrmId: d.id,
        projetId: d.projet?.id ?? null,
        codeDossier: d.code,
        rangDossier: 1,
        numero: envoi ? ++numeroDevis : null,
        statut,
        objet: `Offre de conception · ${d.programme || d.code}`,
        creeLe,
        dateEnvoi: envoi,
        dateValidite: envoi ? ajouterJours(jour(envoi), VALIDITE_OFFRE_JOURS) : null,
        dateReponse: statut === 'accepte' || statut === 'refuse' ? plus(envoi!, 4) : null,
        partsFactures: PARTS_DEFAUT,
        delaisEcheancier: statut === 'accepte' ? DELAIS_DEMO : undefined,
        lignes: { create: lignesOffre(d, i) },
      },
      include: { lignes: { include: { produitService: { select: { code: true, famille: true } } } } },
    });
    if (statut === 'accepte') {
      const plan = planFacturationOffre(
        o.lignes.map((l) => ({
          code: l.produitService?.code ?? null,
          famille: l.produitService?.famille ?? null,
          designation: l.designation,
          montantHt: Math.round(l.quantite.toNumber() * l.prixUnitaire.toNumber()),
          tauxTva: l.tauxTva.toNumber(),
        })),
        PARTS_DEFAUT,
      );
      acceptees.push({ d, i, debut: creeLe, offreId: o.id, plan });
    }
  }
  if (enValidation) await prisma.dossierCrm.update({ where: { id: enValidation.id }, data: { statut: 'en_validation' } });

  // 2. Factures du plan de chaque offre acceptée (comme à l'Onboard), émises et
  //    encaissées selon la phase du projet ; numéros de société et rangs du
  //    dossier attribués dans l'ordre chronologique d'émission.
  const factures: { data: Prisma.FactureUncheckedCreateInput; emiseLe: Date | null; ttc: number; sort: Sort | null; i: number }[] = [];
  for (const { d, i, debut, offreId, plan } of acceptees) {
    const projet = d.projet!;
    const scenario = SCENARIO[projet.phase] ?? { emises: 1, derniere: 'a_echoir' as Sort };
    // Tranches émises étalées entre la signature et aujourd'hui.
    const pas = Math.floor((Date.now() - plus(debut, 8).getTime()) / 86_400_000 / scenario.emises);
    for (const f of plan) {
      const rangJalon = JALONS_FACTURE.findIndex((j) => j.cle === f.jalon);
      const emise = rangJalon >= 0 && rangJalon < scenario.emises;
      const sort: Sort | null = !emise ? null : rangJalon === scenario.emises - 1 ? scenario.derniere : 'payee';
      const prevue = plus(debut, 8 + Math.max(rangJalon, 0) * pas);
      // « À échoir » : émise il y a quelques jours ; « en retard » : échéance passée.
      const emiseLe = !emise ? null : sort === 'a_echoir' ? ilYA(4) : sort === 'retard' && prevue > ilYA(20) ? ilYA(20) : prevue;
      factures.push({
        data: {
          societeId,
          projetId: projet.id,
          type: typeFactureDepuisNature(projet.nature),
          jalon: f.jalon,
          libelle: f.libelle,
          montantHt: f.montantHt,
          tauxTva: f.tauxTva,
          devisEcheancierId: offreId,
          cleEcheance: f.cle,
          creeLe: emiseLe ?? plus(debut, 6),
        },
        emiseLe,
        ttc: Math.round(f.montantHt * (1 + f.tauxTva / 100)),
        sort,
        i,
      });
    }
  }
  let numeroFacture = 0;
  const rangs = new Map<string, number>();
  const ordre = [...factures].sort((a, b) => (a.emiseLe?.getTime() ?? Infinity) - (b.emiseLe?.getTime() ?? Infinity));
  for (const f of ordre) {
    if (f.emiseLe) {
      const code = f.data.projetId ? onboard.find((d) => d.projet!.id === f.data.projetId)!.projet!.code : null;
      const rang = code ? (rangs.get(code) ?? 0) + 1 : null;
      if (code) rangs.set(code, rang!);
      const encaisse = (jours: number) => jour(new Date(Math.min(Date.now(), plus(f.emiseLe!, jours).getTime())));
      const paiements =
        f.sort === 'payee'
          ? [{ date: encaisse(3 + (f.i % 5)), montant: f.ttc, mode: 'virement' as const }]
          : f.sort === 'partielle'
            ? [{ date: encaisse(5), montant: Math.round(f.ttc / 2), mode: 'wave' as const }]
            : [];
      Object.assign(f.data, {
        statut: 'emise',
        numero: ++numeroFacture,
        codeDossier: code,
        rangDossier: rang,
        emiseLe: f.emiseLe,
        echeanceLe: ajouterJours(jour(f.emiseLe), DELAI_PAIEMENT_DIRECTE_JOURS),
        paiements: { create: paiements },
      });
    }
    await prisma.facture.create({ data: f.data });
  }

  // 3. Une facture directe d'un lead, préparée, à valider par le CFO.
  const direct = autres.find((d) => d.statut === 'nouveau_projet' && d.id !== enValidation?.id);
  if (direct) {
    await prisma.facture.create({
      data: {
        societeId,
        dossierCrmId: direct.id,
        type: typeFactureDepuisNature(direct.nature),
        libelle: 'Relevé topographique et diagnostic du terrain',
        montantHt: 250_000,
        creeLe: ilYA(1),
        lignes: { create: [{ designation: 'Relevé topographique et diagnostic du terrain', montantHt: 250_000, ordre: 0 }] },
      },
    });
  }
  return { devis: specs.length, factures: factures.length + (direct ? 1 : 0) };
}

// Exécution autonome : npm run finances-demo (depuis backend/).
if (require.main === module) {
  const prisma = new PrismaClient();
  (async () => {
    const grey = await prisma.societe.findUniqueOrThrow({ where: { slug: 'grey-concrete' } });
    const r = await creerFinancesDemo(prisma, grey.id);
    if (r.devis + r.factures === 0) await alignerChronologie(prisma, grey.id);
    console.log(
      r.devis + r.factures
        ? `Finances de démonstration : ${r.devis} devis, ${r.factures} factures.`
        : 'Devis ou factures déjà présents : rien créé, chronologie des leads réalignée.',
    );
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
