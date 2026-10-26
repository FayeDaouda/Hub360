'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { LigneDevisSaisie } from '@/lib/devis';
import { ventilationTva, type LigneDevis, type ProduitService } from '@/lib/types';
import { formatCompactAmount } from '@/lib/format';
import { plural } from '@/lib/text';

// Éditeur des lignes d'un devis — partagé par la modale « Nouveau devis »
// (Facturation) et l'offre d'un dossier CRM (étape F). Contrôlé : l'état vit
// chez le parent.
//
// Catalogue réel Grey Concrete (sept. 2026) : l'écran MONTRE les règles, le
// serveur les GARANTIT (DevisService.appliquerCatalogue) —
//   · prix et TVA verrouillés quand le catalogue les fige ;
//   · CO : tarif × surface × planches, une seule ligne CO — surface terrain
//     du dossier par défaut (décision du boss) ;
//   · SU : jamais choisi — déduit de la catégorie CO, resynchronisé tout seul ;
//   · TS (CGV art. 8) : seulement sur un devis complémentaire de PROJET ;
//     TS-MAJ au tarif CO du projet × surface × planches concernées ;
//   · lignes « hors catalogue » : possibles, mais en second plan et étiquetées
//     (décision F-bis — un vrai imprévu, pas un contournement du catalogue).

export type LigneForm = {
  produitServiceId: string; // '' = prestation pas encore choisie, ou hors catalogue
  horsCatalogue: boolean;
  designation: string;
  quantite: string;
  prixUnitaire: string;
  tauxTva: string;
  surfaceM2: string; // ligne CO
  planches: string; // ligne CO hors dossier (sinon imposées par le dossier)
};

export function ligneVide(horsCatalogue = false): LigneForm {
  return {
    produitServiceId: '',
    horsCatalogue,
    designation: '',
    quantite: '1',
    prixUnitaire: '',
    tauxTva: '18',
    surfaceM2: '',
    planches: '',
  };
}

// Lignes d'un devis existant (brouillon à retravailler) → formulaire.
export function lignesDepuisDevis(lignes: LigneDevis[]): LigneForm[] {
  if (lignes.length === 0) return [ligneVide()];
  return lignes.map((l) => ({
    produitServiceId: l.produitServiceId ?? '',
    horsCatalogue: !l.produitServiceId,
    designation: l.designation,
    quantite: String(l.quantite),
    prixUnitaire: String(l.prixUnitaire),
    tauxTva: String(l.tauxTva),
    surfaceM2: l.surfaceM2 != null ? String(l.surfaceM2) : '',
    planches: l.planches != null ? String(l.planches) : '',
  }));
}

// Formulaire → charge utile de l'API. Les lignes sans désignation (prestation
// pas encore choisie, ligne vide) sont ignorées ; erreur lisible sinon.
export function lignesSaisies(
  lignes: LigneForm[],
  catalogue: ProduitService[],
  planchesImposees?: number,
): { lignes: LigneDevisSaisie[] } | { erreur: string } {
  const valides: LigneDevisSaisie[] = [];
  for (const l of lignes) {
    if (!l.designation.trim()) continue;
    const produit = catalogue.find((p) => p.id === l.produitServiceId);
    const prixUnitaire = Number(l.prixUnitaire);
    if (produit?.modeCalcul === 'tarif_co_surface_planches') {
      const surfaceM2 = Math.round(Number(l.surfaceM2));
      const planches = Math.round(Number(l.planches));
      if (!surfaceM2 || surfaceM2 < 1 || !planches || planches < 1) {
        return { erreur: `« ${l.designation} » : surface et planches concernées requises.` };
      }
      valides.push({
        produitServiceId: produit.id,
        designation: l.designation.trim(),
        quantite: surfaceM2 * planches,
        prixUnitaire,
        surfaceM2,
        planches,
        tauxTva: Number(l.tauxTva),
      });
      continue;
    }
    if (produit?.modeCalcul === 'surface_planches') {
      const surfaceM2 = Math.round(Number(l.surfaceM2));
      const planches = planchesImposees ?? Math.round(Number(l.planches));
      if (!surfaceM2 || surfaceM2 < 1) {
        return { erreur: `« ${l.designation} » : surface (m²) requise.` };
      }
      if (!planches || planches < 1) {
        return {
          erreur:
            planchesImposees !== undefined
              ? 'Le dossier n’a pas de nombre de planches : la ligne de conception ne peut pas se calculer.'
              : `« ${l.designation} » : nombre de planches requis.`,
        };
      }
      valides.push({
        produitServiceId: produit.id,
        designation: l.designation.trim(),
        quantite: surfaceM2 * planches,
        prixUnitaire,
        surfaceM2,
        planches,
        tauxTva: Number(l.tauxTva),
      });
      continue;
    }
    const quantite = Number(l.quantite);
    if (!quantite || prixUnitaire < 0 || Number.isNaN(prixUnitaire)) {
      return { erreur: `Ligne « ${l.designation} » : quantité et prix invalides.` };
    }
    valides.push({
      produitServiceId: l.produitServiceId || undefined,
      designation: l.designation.trim(),
      quantite,
      prixUnitaire,
      tauxTva: l.tauxTva ? Number(l.tauxTva) : undefined,
    });
  }
  if (valides.length === 0) return { erreur: 'Ajoute au moins une ligne.' };
  return { lignes: valides };
}

// Les lignes SU suivent la catégorie CO (le suivi de chantier se déduit, il
// ne se choisit pas) et TS-MAJ prend le tarif de cette catégorie. `categorieCo`
// : catégorie connue hors des lignes (dossier, projet).
export function synchroniserCategorie(
  ls: LigneForm[],
  catalogue: ProduitService[],
  categorieCo: string | null,
): LigneForm[] {
  const produitDe = (l: LigneForm) => catalogue.find((p) => p.id === l.produitServiceId);
  const cat = ls.map(produitDe).find((p) => p?.modeCalcul === 'surface_planches')?.code ?? categorieCo;
  const su = catalogue.find((p) => p.coAssocie && p.coAssocie === cat);
  const tarifCo = catalogue.find((c) => c.code === cat)?.prixUnitaire ?? null;
  return ls.map((l) => {
    const p = produitDe(l);
    if (p?.modeCalcul === 'tarif_co_surface_planches') {
      return { ...l, prixUnitaire: tarifCo != null ? String(tarifCo) : '' };
    }
    if (!p?.coAssocie || !su || p.id === su.id) return l;
    return {
      ...l,
      produitServiceId: su.id,
      designation: su.designation,
      prixUnitaire: su.prixUnitaire != null ? String(su.prixUnitaire) : '',
      tauxTva: String(su.tauxTva),
    };
  });
}

// Familles du catalogue réel, dans l'ordre d'une offre.
const FAMILLES: { code: string; libelle: string }[] = [
  { code: 'CO', libelle: 'Conception' },
  { code: 'IM', libelle: 'Images intérieures' },
  { code: 'SU', libelle: 'Suivi de chantier' },
  { code: 'EX', libelle: 'Extras' },
  { code: 'PC', libelle: 'Permis de construire' },
  { code: 'TS', libelle: 'Travaux supplémentaires' },
];

const UNITES: Record<string, string> = { piece: 'pièce(s)', mois: 'mois', forfait: 'forfait' };

type Props = {
  lignes: LigneForm[];
  onChange: (lignes: LigneForm[]) => void;
  catalogue: ProduitService[];
  // Offre d'un dossier : planches imposées par la fiche (jamais ressaisies)
  // et catégorie CO déjà figée par une offre précédente, s'il y en a une.
  planchesImposees?: number;
  categorieCo?: string | null;
  // Devis complémentaire rattaché à un projet : seul contexte des TS.
  devisProjet?: boolean;
  // Surface proposée à l'ajout d'une ligne CO : la surface terrain du dossier
  // (décision du boss, maintenue malgré le libellé « surface à concevoir »
  // des CGV art. 4). Pré-remplie, reste modifiable.
  surfaceParDefaut?: number;
};

export function LignesDevisEditeur({
  lignes,
  onChange,
  catalogue,
  planchesImposees,
  categorieCo = null,
  devisProjet = false,
  surfaceParDefaut,
}: Props) {
  const produitDe = (l: LigneForm) => catalogue.find((p) => p.id === l.produitServiceId);
  // Lignes « surface × planches » : conception (planches du dossier dans une
  // offre) et reprise majeure TS-MAJ (planches concernées, toujours saisies).
  const surfacePlanches = (p?: ProduitService) =>
    p?.modeCalcul === 'surface_planches' || p?.modeCalcul === 'tarif_co_surface_planches';
  const planchesImposeesPour = (p?: ProduitService) =>
    p?.modeCalcul === 'surface_planches' ? planchesImposees : undefined;
  // Tarif de la catégorie CO (TS-MAJ) — lu au catalogue, jamais saisi.
  const tarifCo = (cat: string | null) => catalogue.find((c) => c.code === cat)?.prixUnitaire ?? null;

  // Catégorie CO courante : la ligne CO de ce devis, sinon celle du dossier.
  function categorieDe(ls: LigneForm[]): string | null {
    const co = ls.map(produitDe).find((p) => p?.modeCalcul === 'surface_planches');
    return co?.code ?? categorieCo;
  }
  const categorie = categorieDe(lignes);

  // Toute modification passe ici : les lignes SU (et TS-MAJ) suivent la catégorie CO.
  function changer(ls: LigneForm[]) {
    onChange(synchroniserCategorie(ls, catalogue, categorieCo));
  }

  function majLigne(i: number, patch: Partial<LigneForm>) {
    changer(lignes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function choisirProduit(i: number, produitServiceId: string) {
    const p = catalogue.find((c) => c.id === produitServiceId);
    if (!p) {
      majLigne(i, { produitServiceId: '' });
      return;
    }
    const ligne = lignes[i];
    const prix = p.modeCalcul === 'tarif_co_surface_planches' ? tarifCo(categorie) : p.prixUnitaire;
    majLigne(i, {
      produitServiceId,
      designation: p.designation,
      prixUnitaire: prix != null ? String(prix) : '',
      tauxTva: String(p.tauxTva),
      ...(p.modeCalcul === 'surface_planches' &&
        !ligne.surfaceM2 &&
        surfaceParDefaut &&
        surfaceParDefaut > 0 && { surfaceM2: String(surfaceParDefaut) }),
    });
  }

  function retirerLigne(i: number) {
    if (lignes.length > 1) changer(lignes.filter((_, idx) => idx !== i));
  }

  const quantiteDe = (l: LigneForm): number => {
    const p = produitDe(l);
    if (surfacePlanches(p)) {
      return (Number(l.surfaceM2) || 0) * (planchesImposeesPour(p) ?? (Number(l.planches) || 0));
    }
    return Number(l.quantite) || 0;
  };

  const totaux = lignes.reduce(
    (acc, l) => {
      const montantHt = Math.round(quantiteDe(l) * (Number(l.prixUnitaire) || 0));
      const { montantTva, montantTtc } = ventilationTva(montantHt, Number(l.tauxTva) || 0);
      return {
        ht: acc.ht + montantHt,
        tva: acc.tva + montantTva,
        ttc: acc.ttc + montantTtc,
      };
    },
    { ht: 0, tva: 0, ttc: 0 },
  );

  const autres = catalogue.filter((p) => !FAMILLES.some((f) => f.code === p.famille));
  // Lignes renseignées mais sans prix (forfait « à fixer » laissé vide…) —
  // rappel, l'enregistrement reste libre.
  const aZero = lignes.filter(
    (l) => (l.produitServiceId || (l.horsCatalogue && l.designation.trim())) && !(Number(l.prixUnitaire) > 0),
  ).length;

  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '20%' }}>Prestation</th>
              <th>Désignation</th>
              <th style={{ width: '16%' }}>Qté</th>
              <th style={{ width: '14%' }}>P.U. HT (FCFA)</th>
              <th style={{ width: '10%' }}>TVA %</th>
              <th style={{ width: '13%' }}>Total TTC</th>
              <th aria-label="Retirer" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const p = produitDe(l);
              const figee = !!p && !p.prixModifiable;
              const autreCo = lignes.some((x, idx) => idx !== i && produitDe(x)?.modeCalcul === 'surface_planches');
              const montantHt = Math.round(quantiteDe(l) * (Number(l.prixUnitaire) || 0));
              const { montantTtc } = ventilationTva(montantHt, Number(l.tauxTva) || 0);
              return (
                <tr key={i}>
                  <td data-label="Prestation">
                    {l.horsCatalogue ? (
                      <span className="pill pill--neutre">Hors catalogue</span>
                    ) : (
                      <select
                        className="field-input"
                        value={l.produitServiceId}
                        onChange={(e) => choisirProduit(i, e.target.value)}
                      >
                        <option value="">Choisir une prestation…</option>
                        {FAMILLES.filter((f) => f.code !== 'TS' || devisProjet).map((f) => {
                          // SU : seul le suivi correspondant à la catégorie CO.
                          const produits = catalogue.filter(
                            (c) => c.famille === f.code && (!c.coAssocie || c.coAssocie === categorie),
                          );
                          if (f.code === 'SU' && produits.length === 0) {
                            return (
                              <optgroup key={f.code} label={f.libelle}>
                                <option disabled>Ajoute d’abord la conception (CO)</option>
                              </optgroup>
                            );
                          }
                          if (produits.length === 0) return null;
                          return (
                            <optgroup key={f.code} label={f.libelle}>
                              {produits.map((c) => (
                                <option
                                  key={c.id}
                                  value={c.id}
                                  disabled={
                                    (c.modeCalcul === 'surface_planches' && autreCo) ||
                                    (c.modeCalcul === 'tarif_co_surface_planches' && !tarifCo(categorie))
                                  }
                                >
                                  {c.designation}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                        {autres.length > 0 && (
                          <optgroup label="Autres (catalogue)">
                            {autres.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.designation}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                  </td>
                  <td data-label="Désignation">
                    <input
                      className="field-input"
                      value={l.designation}
                      onChange={(e) => majLigne(i, { designation: e.target.value })}
                      placeholder="Désignation"
                    />
                  </td>
                  <td data-label="Qté">
                    {surfacePlanches(p) ? (
                      <span className="ligne-co-qte">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="field-input"
                          value={l.surfaceM2}
                          onChange={(e) => majLigne(i, { surfaceM2: e.target.value })}
                          placeholder="m²"
                          aria-label="Surface (m²)"
                          title={
                            surfaceParDefaut ? 'Surface (m²) — surface terrain du dossier par défaut' : 'Surface (m²)'
                          }
                        />
                        <span>m² ×</span>
                        {planchesImposeesPour(p) !== undefined ? (
                          <span title="Nombre de planches de la fiche du dossier">{planchesImposeesPour(p)} pl.</span>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            step="1"
                            className="field-input"
                            value={l.planches}
                            onChange={(e) => majLigne(i, { planches: e.target.value })}
                            placeholder="pl."
                            aria-label="Nombre de planches"
                          />
                        )}
                      </span>
                    ) : (
                      <span className="ligne-co-qte">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="field-input"
                          value={l.quantite}
                          onChange={(e) => majLigne(i, { quantite: e.target.value })}
                        />
                        {p?.unite && UNITES[p.unite] && <span>{UNITES[p.unite]}</span>}
                      </span>
                    )}
                  </td>
                  <td data-label="P.U. HT (FCFA)">
                    <input
                      type="number"
                      min="0"
                      className="field-input"
                      value={l.prixUnitaire}
                      disabled={figee}
                      placeholder={p && p.prixUnitaire == null ? 'À fixer' : undefined}
                      title={figee ? 'Tarif du catalogue — non modifiable' : undefined}
                      onChange={(e) => majLigne(i, { prixUnitaire: e.target.value })}
                    />
                  </td>
                  <td data-label="TVA %">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="field-input"
                      value={l.tauxTva}
                      disabled={figee}
                      onChange={(e) => majLigne(i, { tauxTva: e.target.value })}
                    />
                  </td>
                  <td data-label="Total TTC">{formatCompactAmount(montantTtc)}</td>
                  <td data-label="">
                    <button
                      type="button"
                      className="lien-inline"
                      aria-label="Retirer la ligne"
                      disabled={lignes.length === 1}
                      onClick={() => retirerLigne(i)}
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="lignes-devis-ajouts">
        <button type="button" className="lien-inline" onClick={() => changer([...lignes, ligneVide()])}>
          <Plus size={13} aria-hidden /> Ajouter une prestation
        </button>
        <button
          type="button"
          className="lien-inline lignes-devis-ajout-secondaire"
          onClick={() => changer([...lignes, ligneVide(true)])}
        >
          <Plus size={12} aria-hidden /> Ligne hors catalogue
        </button>
      </div>

      {aZero > 0 && (
        <p className="field-aide" style={{ textAlign: 'right' }} role="note">
          <span className="pill pill--attention">{plural(aZero, 'ligne')} à 0 FCFA</span> vérifie{' '}
          {aZero > 1 ? 'leur' : 'son'} prix.
        </p>
      )}
      <p className="field-aide" style={{ textAlign: 'right' }}>
        HT {formatCompactAmount(totaux.ht)} · TVA {formatCompactAmount(totaux.tva)} ·{' '}
        <strong>TTC {formatCompactAmount(totaux.ttc)}</strong>
      </p>
    </>
  );
}
