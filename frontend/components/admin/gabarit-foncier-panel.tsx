'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  getGabaritFoncier,
  creerLigneGabaritFoncier,
  renommerLigneGabaritFoncier,
  reordonnerGabaritFoncier,
  supprimerLigneGabaritFoncier,
} from '@/lib/foncier';
import { GROUPES_FONCIER, type GroupeFoncierCle, type LigneGabaritFoncier } from '@/lib/types';

// Configuration société du gabarit Foncier (Unbord) — societe_admin ou CIO
// (SocieteAdminOuCioGuard, cf. backend). Amorce chaque NOUVEAU projet ;
// retirer un item ici ne touche jamais les projets déjà en cours (voir
// confirmation utilisateur, cf. mémoire unbord-gabarit-societe).
export function GabaritFoncierPanel({ slug }: { slug: string }) {
  const [lignes, setLignes] = useState<LigneGabaritFoncier[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [nouveaux, setNouveaux] = useState<Record<GroupeFoncierCle, string>>({
    documents: '',
    releve_existant: '',
  });

  useEffect(() => {
    let annule = false;
    setLignes(null);
    setErreur(null);
    getGabaritFoncier(slug)
      .then((d) => {
        if (!annule) setLignes(d);
      })
      .catch((e) => {
        if (!annule) {
          setErreur(
            e instanceof ApiError ? e.message : 'Impossible de charger le gabarit.',
          );
        }
      });
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  async function ajouter(groupe: GroupeFoncierCle) {
    const libelle = nouveaux[groupe].trim();
    if (!libelle) return;
    setErreur(null);
    try {
      const creee = await creerLigneGabaritFoncier(slug, groupe, libelle);
      setLignes((l) => (l ? [...l, creee] : [creee]));
      setNouveaux((n) => ({ ...n, [groupe]: '' }));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'ajout a échoué.");
    }
  }

  async function renommer(item: LigneGabaritFoncier) {
    const libelle = window.prompt('Nouveau libellé', item.libelle);
    if (!libelle || !libelle.trim() || libelle.trim() === item.libelle) return;
    setErreur(null);
    try {
      const maj = await renommerLigneGabaritFoncier(slug, item.id, libelle.trim());
      setLignes((l) => (l ? l.map((x) => (x.id === item.id ? maj : x)) : l));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le renommage a échoué.');
    }
  }

  async function supprimer(item: LigneGabaritFoncier) {
    const confirme = window.confirm(
      `Retirer « ${item.libelle} » du gabarit ? Les projets déjà en cours gardent cet item et ses fichiers — seuls les nouveaux projets ne le verront plus.`,
    );
    if (!confirme) return;
    setErreur(null);
    try {
      await supprimerLigneGabaritFoncier(slug, item.id);
      setLignes((l) => (l ? l.filter((x) => x.id !== item.id) : l));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La suppression a échoué.');
    }
  }

  // Réordonne DANS le groupe cliqué ; l'autre groupe garde son ordre relatif
  // tel quel — reordonnerGabaritFoncier attend la liste COMPLÈTE des ids
  // dans le nouvel ordre, donc on reconstruit les deux blocs bout à bout.
  async function deplacer(groupe: GroupeFoncierCle, index: number, direction: -1 | 1) {
    if (!lignes || enCours) return;
    const dansLeGroupe = lignes.filter((l) => l.groupe === groupe);
    const cible = index + direction;
    if (cible < 0 || cible >= dansLeGroupe.length) return;
    const reordonnees = [...dansLeGroupe];
    [reordonnees[index], reordonnees[cible]] = [reordonnees[cible], reordonnees[index]];
    const autres = lignes.filter((l) => l.groupe !== groupe);
    const ids = [...reordonnees, ...autres].map((l) => l.id);

    setEnCours(true);
    setErreur(null);
    try {
      setLignes(await reordonnerGabaritFoncier(slug, ids));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le réordonnancement a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  if (erreur && !lignes) {
    return (
      <div className="dash-erreur" role="alert">
        <p>{erreur}</p>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          onClick={() => setEssai((n) => n + 1)}
        >
          <RefreshCw size={15} strokeWidth={2} aria-hidden />
          <span>Réessayer</span>
        </button>
      </div>
    );
  }
  if (!lignes) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  return (
    <>
      {erreur && (
        <p className="field-erreur" role="alert">
          {erreur}
        </p>
      )}
      {GROUPES_FONCIER.map((g) => {
        const items = lignes.filter((l) => l.groupe === g.cle);
        return (
          <section className="panel glass-panel foncier-groupe" key={g.cle}>
            <h3 className="panel-title">{g.libelle}</h3>
            <ul className="foncier-liste">
              {items.map((item, i) => (
                <li key={item.id} className="foncier-item">
                  <div className="foncier-item-tete">
                    <span className="foncier-item-libelle">{item.libelle}</span>
                  </div>
                  <div className="foncier-item-actions">
                    <button
                      type="button"
                      className="doc-icone"
                      disabled={i === 0 || enCours}
                      onClick={() => deplacer(g.cle, i, -1)}
                      aria-label={`Monter « ${item.libelle} »`}
                      title="Monter"
                    >
                      <ArrowUp size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="doc-icone"
                      disabled={i === items.length - 1 || enCours}
                      onClick={() => deplacer(g.cle, i, 1)}
                      aria-label={`Descendre « ${item.libelle} »`}
                      title="Descendre"
                    >
                      <ArrowDown size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="doc-icone"
                      onClick={() => renommer(item)}
                      aria-label={`Renommer « ${item.libelle} »`}
                      title="Renommer"
                    >
                      <Pencil size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="doc-icone doc-icone--danger"
                      onClick={() => supprimer(item)}
                      aria-label={`Retirer « ${item.libelle} »`}
                      title="Retirer"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </li>
              ))}
              {items.length === 0 && <p className="empty-state">Aucun item dans ce bloc.</p>}
            </ul>
            <div className="foncier-item-actions" style={{ marginTop: '0.8rem' }}>
              <input
                type="text"
                className="field-input"
                placeholder="Nouvel item…"
                value={nouveaux[g.cle]}
                onChange={(e) => setNouveaux((n) => ({ ...n, [g.cle]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ajouter(g.cle);
                }}
              />
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => ajouter(g.cle)}>
                <Plus size={14} strokeWidth={2} aria-hidden />
                Ajouter
              </button>
            </div>
          </section>
        );
      })}
    </>
  );
}
