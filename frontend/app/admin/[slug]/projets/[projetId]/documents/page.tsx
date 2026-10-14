'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { getProjetExecution } from '@/lib/projets';
import {
  ajouterFichiers,
  formatTaille,
  getFichiers,
  getFichiersSupprimes,
  lireFichier,
  majFichier,
  restaurerFichier,
  supprimerFichiers,
  typeParDefaut,
} from '@/lib/fichiers';
import { useDroitsProjet, useTitrePage } from '@/lib/layout-contexte';
import {
  PHASES,
  PHASES_PAR_CATEGORIE,
  TYPES_FICHIER,
  type FichierProjet,
  type Phase,
  type ProjetExecution,
  type TypeFichier,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';

type Props = { params: { slug: string; projetId: string } };

function telecharger(f: FichierProjet) {
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function DocumentsPage({ params }: Props) {
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [fichiers, setFichiers] = useState<FichierProjet[] | null>(null);
  const [corbeille, setCorbeille] = useState<FichierProjet[]>([]);
  const [vueCorbeille, setVueCorbeille] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ecriture = useDroitsProjet().documentsEcriture;

  useTitrePage(vueCorbeille ? 'Corbeille' : 'Documents');

  useEffect(() => {
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      if (p) {
        getFichiers(params.slug, params.projetId).then(setFichiers).catch(() => setFichiers([]));
        getFichiersSupprimes(params.slug, params.projetId).then(setCorbeille).catch(() => {});
      }
    });
  }, [params.slug, params.projetId]);
  const retour = `/admin/${params.slug}/projets/${params.projetId}`;
  const phases = projet ? PHASES_PAR_CATEGORIE[projet.categorie] : [];

  async function surFichiers(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const lus = await Promise.all(
        Array.from(liste).map(async (file) => {
          const { nom, url, taille } = await lireFichier(file);
          return { nom, url, taille, type: typeParDefaut(nom) };
        }),
      );
      const crees = await ajouterFichiers(params.slug, params.projetId, lus);
      setFichiers((f) => [...crees, ...(f ?? [])]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    } finally {
      setEnvoi(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function patch(id: string, p: { type?: TypeFichier; phase?: Phase | null; note?: string }) {
    const maj = await majFichier(params.slug, params.projetId, id, p);
    setFichiers((f) => (f ? f.map((x) => (x.id === id ? maj : x)) : f));
  }

  async function supprimer(id: string) {
    await supprimerFichiers(params.slug, params.projetId, [id]);
    const partant = fichiers?.find((x) => x.id === id);
    setFichiers((f) => (f ? f.filter((x) => x.id !== id) : f));
    if (partant) {
      setCorbeille((c) => [{ ...partant, supprimee: true }, ...c]);
    }
  }

  async function restaurer(id: string) {
    await restaurerFichier(params.slug, params.projetId, id);
    setCorbeille((c) => c.filter((x) => x.id !== id));
    getFichiers(params.slug, params.projetId).then(setFichiers).catch(() => {});
  }

  const liste = vueCorbeille ? corbeille : fichiers ?? [];

  return (
    <>
      <Link href={retour} className="lien-retour lien-retour--documents">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
      ) : projet === undefined || fichiers === null ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : (
        <section className="panel">
          <div className="doc-tete">
            <h3 className="panel-title" style={{ margin: 0 }}>
              {vueCorbeille ? 'Corbeille' : 'Documents'}
              <span className="pill pill--info">{liste.length}</span>
            </h3>
            <div className="doc-tete-actions">
              {corbeille.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  onClick={() => setVueCorbeille((v) => !v)}
                >
                  {vueCorbeille ? 'Documents' : `Corbeille (${corbeille.length})`}
                </button>
              )}
              {!vueCorbeille && ecriture && (
                <>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => surFichiers(e.target.files)}
                  />
                  <button
                    type="button"
                    className="btn-primary btn-ghost--sm"
                    onClick={() => inputRef.current?.click()}
                    disabled={envoi}
                  >
                    <Plus size={15} strokeWidth={2} aria-hidden />
                    {envoi ? 'Ajout…' : 'Ajouter'}
                  </button>
                </>
              )}
            </div>
          </div>

          {erreur && <p className="field-erreur">{erreur}</p>}

          {liste.length === 0 ? (
            <p className="empty-state">
              {vueCorbeille
                ? 'Corbeille vide.'
                : ecriture
                  ? 'Aucun document. Ajoute un PDF, un plan CAO, un devis…'
                  : 'Aucun document.'}
            </p>
          ) : (
            <div className="doc-liste">
              {liste.map((f) => (
                <div className="doc-ligne" key={f.id}>
                  <div className="doc-ligne-nom">
                    <span className="doc-nom" title={f.nom}>
                      {f.nom}
                    </span>
                    <span className="doc-meta">
                      {formatTaille(f.taille)}
                      {f.taille ? ' · ' : ''}
                      {vueCorbeille
                        ? `supprimé le ${formatDateCourte(f.supprimeLe ?? f.ajouteLe)} · ${f.supprimePar ?? ''}`
                        : `ajouté le ${formatDateCourte(f.ajouteLe)} · ${f.ajoutePar}`}
                    </span>
                  </div>

                  {!vueCorbeille && (
                    <>
                      <select
                        className="field-input doc-select"
                        value={f.type}
                        disabled={!ecriture}
                        onChange={(e) => patch(f.id, { type: e.target.value as TypeFichier })}
                        aria-label="Type de document"
                      >
                        {(Object.keys(TYPES_FICHIER) as TypeFichier[]).map((t) => (
                          <option key={t} value={t}>
                            {TYPES_FICHIER[t]}
                          </option>
                        ))}
                      </select>
                      <select
                        className="field-input doc-select"
                        value={f.phase ?? ''}
                        disabled={!ecriture}
                        onChange={(e) =>
                          patch(f.id, { phase: (e.target.value || null) as Phase | null })
                        }
                        aria-label="Phase"
                      >
                        <option value="">Phase —</option>
                        {phases.map((ph) => (
                          <option key={ph} value={ph}>
                            {PHASES[ph]}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <div className="doc-ligne-actions">
                    <button
                      type="button"
                      className="doc-icone"
                      onClick={() => telecharger(f)}
                      aria-label="Télécharger"
                      title="Télécharger"
                    >
                      <Download size={15} strokeWidth={2} />
                    </button>
                    {!ecriture ? null : vueCorbeille ? (
                      <button
                        type="button"
                        className="doc-icone"
                        onClick={() => restaurer(f.id)}
                        aria-label="Restaurer"
                        title="Restaurer"
                      >
                        <RotateCcw size={15} strokeWidth={2} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="doc-icone doc-icone--danger"
                        onClick={() => supprimer(f.id)}
                        aria-label="Supprimer"
                        title="Supprimer"
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
