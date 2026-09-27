import { ModeCalculProduit, PrismaClient } from '@prisma/client';

// Import du catalogue réel Grey Concrete (prisma/data/catalogue-grey-concrete.json,
// fourni par la société le 26/09/2026 — copie conforme, ne pas retoucher à la
// main : un changement de tarif se fait dans ce fichier puis on réimporte).
//
// Idempotent : upsert par (société, code). Un produit déjà importé est
// resynchronisé sur la source (prix compris) ; les produits ajoutés à la main
// par l'admin (sans code) ne sont jamais touchés.
//
// Produits importés = ceux dont le mode de calcul est connu. ET n'est pas un
// produit de devis : sa refacturation part des blocs Études (étape H3). TS
// (étape H4) porte un mode PAR PRODUIT (famille « MIXTE ») : TS-MIN au forfait
// figé, TS-MAJ au tarif CO du projet.

type ProduitSource = {
  code: string;
  libelle: string;
  description: string;
  unite: string;
  prix_ht: number | null;
  mode_calcul?: string; // famille MIXTE : mode propre au produit
  prix_modifiable?: boolean;
  co_associe?: string;
  livrable?: string;
};
type FamilleSource = {
  code: string;
  libelle: string;
  mode_calcul: string;
  prix_modifiable?: boolean;
  produits: ProduitSource[];
};
export type CatalogueSource = {
  meta: { tva_taux_pct: number };
  familles: FamilleSource[];
};

const MODES: Record<string, ModeCalculProduit> = {
  TARIF_X_SURFACE_X_PLANCHES: 'surface_planches',
  PRIX_X_QUANTITE: 'quantite',
  FORFAIT_VARIABLE: 'forfait',
  FORFAIT: 'quantite', // TS-MIN : prix figé × nombre de reprises
  TARIF_CO_X_SURFACE_X_PLANCHES: 'tarif_co_surface_planches', // TS-MAJ
};

export async function importerCatalogue(
  prisma: PrismaClient,
  societeId: string,
  source: CatalogueSource,
): Promise<{ importes: string[]; ignorees: string[] }> {
  const importes: string[] = [];
  const ignorees: string[] = [];
  for (const famille of source.familles) {
    for (const p of famille.produits) {
      const modeCalcul = MODES[p.mode_calcul ?? famille.mode_calcul];
      if (!modeCalcul) {
        if (!ignorees.includes(famille.code)) ignorees.push(famille.code);
        continue;
      }
      const donnees = {
        famille: famille.code,
        unite: p.unite,
        modeCalcul,
        prixModifiable: p.prix_modifiable ?? famille.prix_modifiable ?? true,
        coAssocie: p.co_associe ?? null,
        designation: `${p.code} — ${p.libelle}`,
        prixUnitaire: p.prix_ht,
        tauxTva: source.meta.tva_taux_pct,
        description: p.livrable ? `${p.description} Livrable : ${p.livrable}.` : p.description,
        supprime: false,
        supprimeLe: null,
      };
      await prisma.produitService.upsert({
        where: { societeId_code: { societeId, code: p.code } },
        update: donnees,
        create: { societeId, code: p.code, ...donnees },
      });
      importes.push(p.code);
    }
  }
  return { importes, ignorees };
}
