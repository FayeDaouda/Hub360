'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  creerProduitService,
  supprimerProduitService,
  type NouveauProduitService,
} from '@/lib/devis';
import type { ProduitService } from '@/lib/types';
import { formatMontantCompact } from '@/lib/format';

type Props = {
  slug: string;
  produits: ProduitService[];
  onClose: () => void;
  onChange: (produits: ProduitService[]) => void;
};

// Catalogue optionnel (cf. cadrage « Devis ») — démarre vide, l'admin
// l'alimente ici au fil de l'eau. Piocher dedans reste une option à côté de
// la ligne libre sur chaque devis, jamais une contrainte.
export function CatalogueProduitsModal({ slug, produits, onClose, onChange }: Props) {
  const [designation, setDesignation] = useState('');
  const [prixUnitaire, setPrixUnitaire] = useState('');
  const [tauxTva, setTauxTva] = useState('18');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!designation.trim()) return setErreur('La désignation est requise.');

    const body: NouveauProduitService = {
      designation: designation.trim(),
      prixUnitaire: prixUnitaire ? Number(prixUnitaire) : undefined,
      tauxTva: tauxTva ? Number(tauxTva) : undefined,
    };
    setBusy(true);
    try {
      const nouveau = await creerProduitService(slug, body);
      onChange([...produits, nouveau].sort((a, b) => a.designation.localeCompare(b.designation)));
      setDesignation('');
      setPrixUnitaire('');
      setTauxTva('18');
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : "L'ajout a échoué. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  async function retirer(id: string) {
    if (!window.confirm('Retirer cet item du catalogue ? Les devis existants qui le référencent ne sont pas affectés.')) {
      return;
    }
    setBusy(true);
    try {
      await supprimerProduitService(slug, id);
      onChange(produits.filter((p) => p.id !== id));
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La suppression a échoué.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titre-catalogue"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="modal-titre-catalogue">Catalogue produits / services</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          {produits.length === 0 ? (
            <p className="images-vide">Catalogue vide — ajoute une première entrée ci-dessous.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th>Prix unitaire</th>
                    <th>TVA</th>
                    <th aria-label="Retirer" />
                  </tr>
                </thead>
                <tbody>
                  {produits.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Désignation">{p.designation}</td>
                      <td data-label="Prix unitaire">
                        {p.prixUnitaire != null ? formatMontantCompact(p.prixUnitaire) : '—'}
                      </td>
                      <td data-label="TVA">{p.tauxTva} %</td>
                      <td data-label="">
                        <button
                          type="button"
                          className="lien-inline"
                          aria-label="Retirer"
                          disabled={busy}
                          onClick={() => retirer(p.id)}
                        >
                          <Trash2 size={12} strokeWidth={2} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 className="exec-sous-titre">Ajouter une entrée</h4>
          <form onSubmit={ajouter}>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Désignation</span>
                <input
                  className="field-input"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="ex : Honoraires de conception"
                />
              </label>
              <label className="field">
                <span className="field-label">Prix unitaire (facultatif)</span>
                <input
                  type="number"
                  min="0"
                  className="field-input"
                  value={prixUnitaire}
                  onChange={(e) => setPrixUnitaire(e.target.value)}
                  placeholder="variable selon le projet"
                />
              </label>
              <label className="field" style={{ maxWidth: 120 }}>
                <span className="field-label">TVA %</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="field-input"
                  value={tauxTva}
                  onChange={(e) => setTauxTva(e.target.value)}
                />
              </label>
            </div>
            {erreur && <p className="field-erreur">{erreur}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose}>
                Fermer
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                <Plus size={15} strokeWidth={2} aria-hidden /> Ajouter au catalogue
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
