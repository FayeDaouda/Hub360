'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  creerBlocGabaritEtude,
  creerLigneGabaritEtude,
  getGabaritEtudes,
  renommerBlocGabaritEtude,
  renommerLigneGabaritEtude,
  reordonnerBlocsGabaritEtude,
  reordonnerLignesGabaritEtude,
  supprimerBlocGabaritEtude,
  supprimerLigneGabaritEtude,
} from '@/lib/etudes';
import type { BlocGabaritEtude } from '@/lib/types';

// Configuration société du gabarit Études (societe_admin ou CIO,
// SocieteAdminOuCioGuard côté backend) — deux niveaux : les BLOCS (types
// d'étude — géotechnique, structure…) et, dans chacun, ses livrables. Amorce
// chaque NOUVEAU projet ET se resynchronise sur les projets déjà en cours à
// chaque GET (EtudesService.assurerBlocs) ; retirer un bloc/item ici ne
// touche jamais les projets déjà en cours (même garantie que Foncier).
export function GabaritEtudesPanel({ slug }: { slug: string }) {
  const [blocs, setBlocs] = useState<BlocGabaritEtude[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [nouveauBloc, setNouveauBloc] = useState('');
  const [nouveauxItems, setNouveauxItems] = useState<Record<string, string>>({});

  useEffect(() => {
    let annule = false;
    setBlocs(null);
    setErreur(null);
    getGabaritEtudes(slug)
      .then((d) => {
        if (!annule) setBlocs(d);
      })
      .catch((e) => {
        if (!annule) {
          setErreur(e instanceof ApiError ? e.message : 'Impossible de charger le gabarit.');
        }
      });
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  async function ajouterBloc() {
    const libelle = nouveauBloc.trim();
    if (!libelle) return;
    setErreur(null);
    try {
      const cree = await creerBlocGabaritEtude(slug, libelle);
      setBlocs((b) => (b ? [...b, cree] : [cree]));
      setNouveauBloc('');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'ajout a échoué.");
    }
  }

  async function renommerBloc(bloc: BlocGabaritEtude) {
    const libelle = window.prompt('Nouveau libellé du bloc', bloc.libelle);
    if (!libelle || !libelle.trim() || libelle.trim() === bloc.libelle) return;
    setErreur(null);
    try {
      const maj = await renommerBlocGabaritEtude(slug, bloc.id, libelle.trim());
      setBlocs((bs) => (bs ? bs.map((b) => (b.id === bloc.id ? maj : b)) : bs));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le renommage a échoué.');
    }
  }

  async function supprimerBloc(bloc: BlocGabaritEtude) {
    const confirme = window.confirm(
      `Retirer le bloc « ${bloc.libelle} » du gabarit ? Les projets déjà en cours gardent ce bloc, ses livrables et ses fichiers — seuls les nouveaux projets ne le verront plus.`,
    );
    if (!confirme) return;
    setErreur(null);
    try {
      await supprimerBlocGabaritEtude(slug, bloc.id);
      setBlocs((bs) => (bs ? bs.filter((b) => b.id !== bloc.id) : bs));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La suppression a échoué.');
    }
  }

  async function deplacerBloc(index: number, direction: -1 | 1) {
    if (!blocs || enCours) return;
    const cible = index + direction;
    if (cible < 0 || cible >= blocs.length) return;
    const reordonnes = [...blocs];
    [reordonnes[index], reordonnes[cible]] = [reordonnes[cible], reordonnes[index]];
    setEnCours(true);
    setErreur(null);
    try {
      const ids = reordonnes.map((b) => b.id);
      const majBlocs = await reordonnerBlocsGabaritEtude(slug, ids);
      // reordonnerBlocsGabaritEtude renvoie les items à jour aussi (lister
      // complet côté service) — pas besoin de les refusionner à la main.
      setBlocs(majBlocs);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le réordonnancement a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  async function ajouterItem(bloc: BlocGabaritEtude) {
    const libelle = (nouveauxItems[bloc.id] ?? '').trim();
    if (!libelle) return;
    setErreur(null);
    try {
      const cree = await creerLigneGabaritEtude(slug, bloc.id, libelle);
      setBlocs((bs) =>
        bs
          ? bs.map((b) => (b.id === bloc.id ? { ...b, items: [...b.items, cree] } : b))
          : bs,
      );
      setNouveauxItems((n) => ({ ...n, [bloc.id]: '' }));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'ajout a échoué.");
    }
  }

  async function renommerItem(bloc: BlocGabaritEtude, itemId: string, libelleActuel: string) {
    const libelle = window.prompt('Nouveau libellé', libelleActuel);
    if (!libelle || !libelle.trim() || libelle.trim() === libelleActuel) return;
    setErreur(null);
    try {
      const maj = await renommerLigneGabaritEtude(slug, itemId, libelle.trim());
      setBlocs((bs) =>
        bs
          ? bs.map((b) =>
              b.id === bloc.id
                ? { ...b, items: b.items.map((it) => (it.id === itemId ? maj : it)) }
                : b,
            )
          : bs,
      );
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le renommage a échoué.');
    }
  }

  async function supprimerItem(bloc: BlocGabaritEtude, itemId: string, libelle: string) {
    const confirme = window.confirm(
      `Retirer « ${libelle} » du bloc « ${bloc.libelle} » ? Les projets déjà en cours gardent cet item et ses fichiers — seuls les nouveaux projets ne le verront plus.`,
    );
    if (!confirme) return;
    setErreur(null);
    try {
      await supprimerLigneGabaritEtude(slug, itemId);
      setBlocs((bs) =>
        bs
          ? bs.map((b) =>
              b.id === bloc.id ? { ...b, items: b.items.filter((it) => it.id !== itemId) } : b,
            )
          : bs,
      );
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La suppression a échoué.');
    }
  }

  async function deplacerItem(bloc: BlocGabaritEtude, index: number, direction: -1 | 1) {
    if (enCours) return;
    const cible = index + direction;
    if (cible < 0 || cible >= bloc.items.length) return;
    const reordonnes = [...bloc.items];
    [reordonnes[index], reordonnes[cible]] = [reordonnes[cible], reordonnes[index]];
    setEnCours(true);
    setErreur(null);
    try {
      const ids = reordonnes.map((it) => it.id);
      const majItems = await reordonnerLignesGabaritEtude(slug, bloc.id, ids);
      setBlocs((bs) => (bs ? bs.map((b) => (b.id === bloc.id ? { ...b, items: majItems } : b)) : bs));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le réordonnancement a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  if (erreur && !blocs) {
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
  if (!blocs) {
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
      {blocs.map((bloc, i) => (
        <section className="panel" key={bloc.id}>
          <div className="ap-souscheck-tete">
            <span className="ap-souscheck-tete-txt">
              <h4>{bloc.libelle}</h4>
            </span>
            <span className="ap-souscheck-actions">
              <button
                type="button"
                className="doc-icone"
                disabled={i === 0 || enCours}
                onClick={() => deplacerBloc(i, -1)}
                aria-label={`Monter « ${bloc.libelle} »`}
                title="Monter"
              >
                <ArrowUp size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="doc-icone"
                disabled={i === blocs.length - 1 || enCours}
                onClick={() => deplacerBloc(i, 1)}
                aria-label={`Descendre « ${bloc.libelle} »`}
                title="Descendre"
              >
                <ArrowDown size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="doc-icone"
                onClick={() => renommerBloc(bloc)}
                aria-label={`Renommer « ${bloc.libelle} »`}
                title="Renommer"
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="doc-icone doc-icone--danger"
                onClick={() => supprimerBloc(bloc)}
                aria-label={`Retirer « ${bloc.libelle} »`}
                title="Retirer"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </span>
          </div>

          <ul>
            {bloc.items.map((item, j) => (
              <li key={item.id} className="ap-souscheck-item ap-souscheck-item--permis">
                <span>{item.libelle}</span>
                <span className="ap-souscheck-actions">
                  <button
                    type="button"
                    className="doc-icone"
                    disabled={j === 0 || enCours}
                    onClick={() => deplacerItem(bloc, j, -1)}
                    aria-label={`Monter « ${item.libelle} »`}
                    title="Monter"
                  >
                    <ArrowUp size={14} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="doc-icone"
                    disabled={j === bloc.items.length - 1 || enCours}
                    onClick={() => deplacerItem(bloc, j, 1)}
                    aria-label={`Descendre « ${item.libelle} »`}
                    title="Descendre"
                  >
                    <ArrowDown size={14} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="doc-icone"
                    onClick={() => renommerItem(bloc, item.id, item.libelle)}
                    aria-label={`Renommer « ${item.libelle} »`}
                    title="Renommer"
                  >
                    <Pencil size={14} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="doc-icone doc-icone--danger"
                    onClick={() => supprimerItem(bloc, item.id, item.libelle)}
                    aria-label={`Retirer « ${item.libelle} »`}
                    title="Retirer"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </span>
              </li>
            ))}
            {bloc.items.length === 0 && <p className="empty-state">Aucun livrable dans ce bloc.</p>}
          </ul>
          <div className="foncier-item-actions" style={{ marginTop: '0.8rem' }}>
            <input
              type="text"
              className="field-input"
              placeholder="Nouveau livrable…"
              value={nouveauxItems[bloc.id] ?? ''}
              onChange={(e) => setNouveauxItems((n) => ({ ...n, [bloc.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ajouterItem(bloc);
              }}
            />
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => ajouterItem(bloc)}>
              <Plus size={14} strokeWidth={2} aria-hidden />
              Ajouter
            </button>
          </div>
        </section>
      ))}

      <section className="panel">
        <h4 style={{ marginTop: 0 }}>Ajouter un bloc</h4>
        <div className="foncier-item-actions">
          <input
            type="text"
            className="field-input"
            placeholder="ex : Acoustique"
            value={nouveauBloc}
            onChange={(e) => setNouveauBloc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ajouterBloc();
            }}
          />
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={ajouterBloc}>
            <Plus size={14} strokeWidth={2} aria-hidden />
            Ajouter
          </button>
        </div>
      </section>
    </>
  );
}
