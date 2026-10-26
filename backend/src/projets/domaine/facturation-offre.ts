import { JalonFacture } from '@prisma/client';
import { JALONS_FACTURE, type PartsFactures } from './config';
import { plural } from '../../shared/text';

// Plan de facturation d'une offre acceptée (étape H2, CGV Grey Concrete 2026,
// décisions du 27/09/2026) — pur, sans I/O : ligne d'offre → factures à
// préparer en brouillon au passage du dossier à « onboard ».
//
//   · CO (conception) → échéancier F1 / F2 / F3 (CGV art. 7, parts figées sur
//     l'offre à sa soumission — 40 / 40 / 20 par défaut) — la conception
//     SEULE, pas les images ;
//   · DPC, SPC (permis) → 50 / 50 chacun, avance à la commande / solde à la
//     remise du livrable (CGV art. 6) ;
//   · IM (images intérieures) → une facture à part (« en supplément à la
//     pièce », CGV art. 4), par taux de TVA ;
//   · SU, EX (au mois) → rien ici : facturation mensuelle manuelle ;
//   · toute autre ligne (hors catalogue…) → « autres prestations », par taux —
//     aucune ligne de l'offre ne doit disparaître de la facturation.
//
// Montants en FCFA entiers : chaque part est arrondie, la DERNIÈRE absorbe
// l'écart d'arrondi pour que la somme retombe exactement sur le HT de la ligne.

export type LigneOffre = {
  code: string | null; // code catalogue (CO2, DPC…), null = hors catalogue
  famille: string | null;
  designation: string;
  montantHt: number;
  tauxTva: number;
  quantite?: number; // mois facturés d'une ligne SU / EX (échéancier affiché)
};

// Lignes d'un devis (Prisma) → lignes d'offre du plan. HT = quantité × prix,
// arrondi au franc (même calcul que le devis).
type Nombre = { toNumber(): number };
export function lignesOffreDepuisDevis(
  lignes: {
    designation: string;
    quantite: Nombre;
    prixUnitaire: Nombre;
    tauxTva: Nombre;
    produitService: { code: string | null; famille: string | null } | null;
  }[],
): LigneOffre[] {
  return lignes.map((l) => ({
    code: l.produitService?.code ?? null,
    famille: l.produitService?.famille ?? null,
    designation: l.designation,
    montantHt: Math.round(l.quantite.toNumber() * l.prixUnitaire.toNumber()),
    tauxTva: l.tauxTva.toNumber(),
    quantite: l.quantite.toNumber(),
  }));
}

export type FacturePrevue = {
  jalon: JalonFacture | null;
  libelle: string;
  montantHt: number;
  tauxTva: number;
  // Échéancier de l'offre (maquette Finances) : clé stable du délai saisi,
  // famille, échéance, part (%) et déclencheur (catalogue « echeanciers »).
  cle: string;
  famille: string;
  echeance: string;
  part: number;
  declencheur: string | null;
};

export const FAMILLES_MENSUELLES = ['SU', 'EX'];

// Déclencheurs de l'échéancier de conception (catalogue « echeanciers » :
// SIGNATURE_CONTRAT, FIN_APD, LIVRAISON_PLANS_EXECUTION).
const DECLENCHEURS_CONCEPTION: Record<JalonFacture, string> = {
  signature: 'Signature du contrat',
  avant_projet: 'Fin de l’APD',
  livraison: 'Livraison des plans d’exécution',
};

// Répartit `total` selon des parts en % (somme 100), écart d'arrondi sur la
// dernière part.
export function repartir(total: number, parts: number[]): number[] {
  const montants = parts.map((p) => Math.round((total * p) / 100));
  const ecart = total - montants.reduce((s, m) => s + m, 0);
  montants[montants.length - 1] += ecart;
  return montants;
}

function parTaux(lignes: LigneOffre[]): Map<number, LigneOffre[]> {
  const groupes = new Map<number, LigneOffre[]>();
  for (const l of lignes) groupes.set(l.tauxTva, [...(groupes.get(l.tauxTva) ?? []), l]);
  return groupes;
}

const nomLigne = (l: LigneOffre) => l.code ?? l.designation;

export function planFacturationOffre(lignes: LigneOffre[], parts: PartsFactures): FacturePrevue[] {
  const prevues: FacturePrevue[] = [];

  for (const co of lignes.filter((l) => l.famille === 'CO')) {
    const montants = repartir(
      co.montantHt,
      JALONS_FACTURE.map((j) => parts[j.code]),
    );
    JALONS_FACTURE.forEach((j, i) =>
      prevues.push({
        jalon: j.cle,
        // Lisible par le client : le code catalogue seul (« CO2 ») ne lui dit rien.
        libelle: `Honoraires de conception, catégorie ${co.code} · ${j.tranche} (${parts[j.code]} %)`,
        montantHt: montants[i],
        tauxTva: co.tauxTva,
        cle: `CO:${j.code}`, // une seule ligne CO par devis : clé stable si la catégorie change
        famille: `Conception · ${co.code}`,
        echeance: j.code,
        part: parts[j.code],
        declencheur: DECLENCHEURS_CONCEPTION[j.cle],
      }),
    );
  }

  for (const pc of lignes.filter((l) => l.famille === 'PC')) {
    const [avance, solde] = repartir(pc.montantHt, [50, 50]);
    const commun = { jalon: null, tauxTva: pc.tauxTva, famille: `Permis · ${nomLigne(pc)}`, part: 50 };
    prevues.push(
      {
        ...commun,
        libelle: `${nomLigne(pc)} — Avance à la commande (50 %)`,
        montantHt: avance,
        cle: `${nomLigne(pc)}:avance`,
        echeance: 'Avance',
        declencheur: 'Commande',
      },
      {
        ...commun,
        libelle: `${nomLigne(pc)} — Solde à la remise du livrable (50 %)`,
        montantHt: solde,
        cle: `${nomLigne(pc)}:solde`,
        echeance: 'Solde',
        declencheur: 'Remise du livrable',
      },
    );
  }

  const groupes: [string, string, LigneOffre[]][] = [
    ['IM', 'Images intérieures', lignes.filter((l) => l.famille === 'IM')],
    [
      'AUTRES',
      'Autres prestations de l’offre',
      lignes.filter((l) => !['CO', 'PC', 'IM', ...FAMILLES_MENSUELLES].includes(l.famille ?? '')),
    ],
  ];
  for (const [cle, titre, ls] of groupes) {
    for (const [taux, groupe] of parTaux(ls)) {
      prevues.push({
        jalon: null,
        libelle: `${titre} — ${groupe.map(nomLigne).join(', ')}`,
        montantHt: groupe.reduce((s, l) => s + l.montantHt, 0),
        tauxTva: taux,
        cle: `${cle}:${taux}`,
        famille: titre,
        echeance: 'Unique',
        part: 100,
        declencheur: null,
      });
    }
  }

  return prevues;
}

// Échéancier affiché sur l'offre (maquette Finances, oct. 2026) : le plan de
// facturation, chaque échéance avec son délai prévisionnel (jours après la
// signature, saisi sur le brouillon puis figé) et son montant TTC, puis les
// lignes facturées au mois (suivi, extras), sans délai.
export type EcheanceOffre = {
  cle: string | null; // null = facturation au mois
  famille: string;
  echeance: string;
  part: number | null; // %
  declencheur: string;
  delaiJours: number | null;
  montantTtc: number;
};

const ttc = (ht: number, taux: number) => ht + Math.round((ht * taux) / 100);

export function echeancierOffre(
  lignes: LigneOffre[],
  parts: PartsFactures,
  delais: Record<string, number>,
): EcheanceOffre[] {
  const plan = planFacturationOffre(lignes, parts).map((f) => ({
    cle: f.cle,
    famille: f.famille,
    echeance: f.echeance,
    part: f.part,
    declencheur: f.declencheur ?? '—',
    delaiJours: delais[f.cle] ?? null,
    montantTtc: ttc(f.montantHt, f.tauxTva),
  }));
  const mensuelles = lignes
    .filter((l) => FAMILLES_MENSUELLES.includes(l.famille ?? ''))
    .map((l) => ({
      cle: null,
      famille: `${l.famille === 'SU' ? 'Suivi de chantier' : 'Extras'} · ${nomLigne(l)}`,
      echeance: l.quantite ? `${plural(l.quantite, 'mensualité')}` : 'Mensuelle',
      part: null,
      declencheur: 'Chaque mois',
      delaiJours: null,
      montantTtc: ttc(l.montantHt, l.tauxTva),
    }));
  return [...plan, ...mensuelles];
}

// Délais saisis : uniquement des échéances de l'offre, en jours entiers 0–730.
export function delaisValides(delais: Record<string, unknown>, cles: string[]): string | null {
  for (const [cle, v] of Object.entries(delais)) {
    if (!cles.includes(cle)) return `Échéance inconnue : ${cle}.`;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 730) {
      return 'Délai prévisionnel : nombre entier de jours (0 à 730).';
    }
  }
  return null;
}
