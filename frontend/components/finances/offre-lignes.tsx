'use client';

import { Lock, Plus, X } from 'lucide-react';
import { ligneVide, synchroniserCategorie, type LigneForm } from '@/components/admin/lignes-devis-editeur';
import type { LigneDevisSaisie } from '@/lib/devis';
import { formatAmount } from '@hub/domain';
import type { ProduitService } from '@/lib/types';

// Familles proposées dans une offre de lead, dans l'ordre (les TS ne passent
// que par un devis complémentaire de projet, CGV art. 8).
const FAMILLES: { code: string; libelle: string }[] = [
  { code: 'CO', libelle: 'Conception' },
  { code: 'IM', libelle: 'Images intérieures' },
  { code: 'SU', libelle: 'Suivi de chantier' },
  { code: 'EX', libelle: 'Extras' },
  { code: 'PC', libelle: 'Permis de construire' },
];
const UNITES: Record<string, string> = {
  piece: 'pièce(s)',
  mois: 'mois',
  forfait: 'forfait',
  reprise: 'reprise(s)',
  m2: 'm²',
};
const PAR_UNITE: Record<string, string> = { m2: '/ m²', piece: '/ pièce', mois: '/ mois', reprise: '/ reprise' };

// « CO1 — Conception — … » → « CO1 · Conception — … » (maquette).
export const libelleProduit = (p: Pick<ProduitService, 'code' | 'designation'>) =>
  p.code ? p.designation.replace(new RegExp(`^${p.code}\\s*—\\s*`), `${p.code} · `) : p.designation;

const entier = (v: string) => {
  const n = Math.round(Number(v));
  return n >= 1 ? n : undefined;
};

// Formulaire → lignes du brouillon. Tolérant : une ligne choisie mais pas
// encore chiffrée part telle quelle (le serveur l'enregistre à 0, la
// soumission au CFO l'exige complète).
export function lignesBrouillon(lignes: LigneForm[], catalogue: ProduitService[]): LigneDevisSaisie[] {
  return lignes.flatMap((l) => {
    const p = catalogue.find((c) => c.id === l.produitServiceId);
    if (!p) return [];
    const base = {
      produitServiceId: p.id,
      designation: p.designation,
      prixUnitaire: Math.max(0, Number(l.prixUnitaire) || 0),
      tauxTva: Number(l.tauxTva),
    };
    if (p.modeCalcul === 'surface_planches') {
      return [{ ...base, quantite: 1, surfaceM2: entier(l.surfaceM2), planches: entier(l.planches) }];
    }
    return [{ ...base, quantite: Math.max(0, Number(l.quantite) || 0) }];
  });
}

type Props = {
  lignes: LigneForm[];
  onChange: (lignes: LigneForm[]) => void;
  catalogue: ProduitService[];
  categorieCo: string | null;
  fiche: { surface: number; planches: number }; // 0 = non renseigné sur la fiche
};

// 2 · Prestations (maquette Finances) : désignation au catalogue, quantité
// (planches pour la conception), unité, surface, prix figé, total HT.
// Surface et planches reprises de la fiche du lead ; un écart est signalé en ambre.
export function OffreLignes({ lignes, onChange, catalogue, categorieCo, fiche }: Props) {
  const produitDe = (l: LigneForm) => catalogue.find((p) => p.id === l.produitServiceId);
  const changer = (ls: LigneForm[]) => onChange(synchroniserCategorie(ls, catalogue, categorieCo));
  const maj = (i: number, patch: Partial<LigneForm>) =>
    changer(lignes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const categorie = lignes.map(produitDe).find((p) => p?.modeCalcul === 'surface_planches')?.code ?? categorieCo;

  function choisir(i: number, id: string) {
    const p = catalogue.find((c) => c.id === id);
    if (!p) return maj(i, { produitServiceId: '', designation: '' });
    const co = p.modeCalcul === 'surface_planches';
    maj(i, {
      produitServiceId: p.id,
      designation: p.designation,
      prixUnitaire: p.prixUnitaire != null ? String(p.prixUnitaire) : '',
      tauxTva: String(p.tauxTva),
      ...(co && !lignes[i].surfaceM2 && fiche.surface > 0 && { surfaceM2: String(fiche.surface) }),
      ...(co && !lignes[i].planches && fiche.planches > 0 && { planches: String(fiche.planches) }),
    });
  }

  return (
    <section className="offre-section">
      <h3 className="offre-titre-section">2 · Prestations</h3>
      <div className="offre-lignes" role="table" aria-label="Prestations">
        <div className="offre-ligne offre-ligne--tete" role="row">
          <span role="columnheader">Désignation</span>
          <span role="columnheader">Quantité</span>
          <span role="columnheader">Unité</span>
          <span role="columnheader">Surface (m²)</span>
          <span role="columnheader">Prix unitaire</span>
          <span role="columnheader" className="offre-num">
            Total HT
          </span>
          <span aria-hidden />
        </div>
        {lignes.map((l, i) => {
          const p = produitDe(l);
          const co = p?.modeCalcul === 'surface_planches';
          const autreCo = lignes.some((x, idx) => idx !== i && produitDe(x)?.modeCalcul === 'surface_planches');
          const quantite = co ? (Number(l.surfaceM2) || 0) * (Number(l.planches) || 0) : Number(l.quantite) || 0;
          const total = Math.round(quantite * (Number(l.prixUnitaire) || 0));
          const ecartPlanches = co && fiche.planches > 0 && !!l.planches && Number(l.planches) !== fiche.planches;
          const ecartSurface = co && fiche.surface > 0 && !!l.surfaceM2 && Number(l.surfaceM2) !== fiche.surface;
          return (
            <div className="offre-ligne" role="row" key={i}>
              <span role="cell" data-label="Désignation" className="offre-designation">
                <select
                  className="field-input"
                  value={l.produitServiceId}
                  onChange={(e) => choisir(i, e.target.value)}
                  aria-label="Désignation"
                >
                  <option value="">Choisir une prestation…</option>
                  {FAMILLES.map((f) => {
                    const produits = catalogue.filter(
                      (c) => c.famille === f.code && (!c.coAssocie || c.coAssocie === categorie),
                    );
                    if (produits.length === 0) return null;
                    return (
                      <optgroup key={f.code} label={f.libelle}>
                        {produits.map((c) => (
                          <option key={c.id} value={c.id} disabled={c.modeCalcul === 'surface_planches' && autreCo}>
                            {libelleProduit(c)}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                {co && <small>repris de la fiche projet</small>}
              </span>
              <span role="cell" data-label="Quantité">
                <input
                  type="number"
                  min="0"
                  step={co ? 1 : 0.5}
                  className={`field-input${ecartPlanches ? ' offre-ecart' : ''}`}
                  value={co ? l.planches : l.quantite}
                  placeholder={co ? 'Planches' : 'Qté'}
                  aria-label={co ? 'Nombre de planches' : 'Quantité'}
                  title={ecartPlanches ? `Écart avec la fiche projet (${fiche.planches} planche(s))` : undefined}
                  disabled={!p}
                  onChange={(e) => maj(i, co ? { planches: e.target.value } : { quantite: e.target.value })}
                />
              </span>
              <span role="cell" data-label="Unité" className="offre-unite">
                {co ? 'planche(s)' : p?.unite ? (UNITES[p.unite] ?? p.unite) : '—'}
              </span>
              <span role="cell" data-label="Surface (m²)">
                {co && (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`field-input${ecartSurface ? ' offre-ecart' : ''}`}
                    value={l.surfaceM2}
                    placeholder="m²"
                    aria-label="Surface (m²)"
                    title={ecartSurface ? `Écart avec la fiche projet (${fiche.surface} m²)` : undefined}
                    onChange={(e) => maj(i, { surfaceM2: e.target.value })}
                  />
                )}
              </span>
              <span role="cell" data-label="Prix unitaire" className="offre-prix">
                {p && !p.prixModifiable ? (
                  <>
                    <Lock size={12} aria-label="Prix du catalogue figé" />
                    {formatAmount(Number(l.prixUnitaire) || 0)}
                    {p.unite && PAR_UNITE[p.unite] && <small>{PAR_UNITE[p.unite]}</small>}
                  </>
                ) : (
                  <input
                    type="number"
                    min="0"
                    className="field-input"
                    value={l.prixUnitaire}
                    placeholder={p ? 'Forfait' : ''}
                    aria-label="Prix unitaire"
                    disabled={!p}
                    onChange={(e) => maj(i, { prixUnitaire: e.target.value })}
                  />
                )}
              </span>
              <strong role="cell" data-label="Total HT" className="offre-num">
                {formatAmount(total)}
              </strong>
              <span role="cell">
                <button
                  type="button"
                  className="offre-retirer"
                  aria-label="Retirer la prestation"
                  disabled={lignes.length === 1}
                  onClick={() => changer(lignes.filter((_, idx) => idx !== i))}
                >
                  <X size={14} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" className="offre-ajouter" onClick={() => changer([...lignes, ligneVide()])}>
        <Plus size={14} aria-hidden /> Ajouter une prestation
      </button>
      <p className="offre-aide">
        Calcul automatique : total HT = prix unitaire × surface du terrain (m²) × quantité (planches) pour la conception
        ; prix × quantité pour les autres produits. Surface et planches sont reprises de la fiche projet ; un écart est
        signalé en ambre. Prix du catalogue figés. Saisie libre : forfait DPC/SPC.
      </p>
    </section>
  );
}
