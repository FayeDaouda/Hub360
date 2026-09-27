import { JalonFacture } from '@prisma/client';
import { JALONS_FACTURE } from './config';

// Plan de facturation d'une offre acceptée (étape H2, CGV Grey Concrete 2026,
// décisions du 27/09/2026) — pur, sans I/O : ligne d'offre → factures à
// préparer en brouillon au passage du dossier à « onboard ».
//
//   · CO (conception) → échéancier 40 / 40 / 20 (CGV art. 7) — la conception
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
};

export type FacturePrevue = {
  jalon: JalonFacture | null;
  libelle: string;
  montantHt: number;
  tauxTva: number;
};

export const FAMILLES_MENSUELLES = ['SU', 'EX'];

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

export function planFacturationOffre(lignes: LigneOffre[]): FacturePrevue[] {
  const prevues: FacturePrevue[] = [];

  for (const co of lignes.filter((l) => l.famille === 'CO')) {
    const montants = repartir(
      co.montantHt,
      JALONS_FACTURE.map((j) => j.part),
    );
    JALONS_FACTURE.forEach((j, i) =>
      prevues.push({
        jalon: j.cle,
        libelle: `${co.code} — ${j.libelle} (${j.part} %)`,
        montantHt: montants[i],
        tauxTva: co.tauxTva,
      }),
    );
  }

  for (const pc of lignes.filter((l) => l.famille === 'PC')) {
    const [avance, solde] = repartir(pc.montantHt, [50, 50]);
    prevues.push(
      { jalon: null, libelle: `${nomLigne(pc)} — Avance à la commande (50 %)`, montantHt: avance, tauxTva: pc.tauxTva },
      { jalon: null, libelle: `${nomLigne(pc)} — Solde à la remise du livrable (50 %)`, montantHt: solde, tauxTva: pc.tauxTva },
    );
  }

  const groupes: [string, LigneOffre[]][] = [
    ['Images intérieures', lignes.filter((l) => l.famille === 'IM')],
    [
      'Autres prestations de l’offre',
      lignes.filter(
        (l) => !['CO', 'PC', 'IM', ...FAMILLES_MENSUELLES].includes(l.famille ?? ''),
      ),
    ],
  ];
  for (const [titre, ls] of groupes) {
    for (const [taux, groupe] of parTaux(ls)) {
      prevues.push({
        jalon: null,
        libelle: `${titre} — ${groupe.map(nomLigne).join(', ')}`,
        montantHt: groupe.reduce((s, l) => s + l.montantHt, 0),
        tauxTva: taux,
      });
    }
  }

  return prevues;
}
