'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture } from '@/components/collab/lecture';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="documents">
      {(projet) => (
        <Vue slug={params.slug} projetId={params.projetId} projet={projet} />
      )}
    </SectionCollabShell>
  );
}

function telecharger(f: FichierProjet) {
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function Vue({
  slug,
  projetId,
  projet,
}: {
  slug: string;
  projetId: string;
  projet: ProjetExecution;
}) {
  const [fichiers, setFichiers] = useState<FichierProjet[] | null>(null);
  const [corbeille, setCorbeille] = useState<FichierProjet[]>([]);
  const [vueCorbeille, setVueCorbeille] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const phases = PHASES_PAR_CATEGORIE[projet.categorie];

  useEffect(() => {
    getFichiers(slug, projetId).then(setFichiers).catch(() => setFichiers([]));
    getFichiersSupprimes(slug, projetId).then(setCorbeille).catch(() => {});
  }, [slug, projetId]);

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
      const crees = await ajouterFichiers(slug, projetId, lus);
      setFichiers((f) => [...crees, ...(f ?? [])]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    } finally {
      setEnvoi(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function patch(id: string, p: { type?: TypeFichier; phase?: Phase | null }) {
    const maj = await majFichier(slug, projetId, id, p);
    setFichiers((f) => (f ? f.map((x) => (x.id === id ? maj : x)) : f));
  }

  async function supprimer(id: string) {
    await supprimerFichiers(slug, projetId, [id]);
    const partant = fichiers?.find((x) => x.id === id);
    setFichiers((f) => (f ? f.filter((x) => x.id !== id) : f));
    if (partant) setCorbeille((c) => [{ ...partant, supprimee: true }, ...c]);
  }

  async function restaurer(id: string) {
    await restaurerFichier(slug, projetId, id);
    setCorbeille((c) => c.filter((x) => x.id !== id));
    getFichiers(slug, projetId).then(setFichiers).catch(() => {});
  }

  if (fichiers === null) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  const liste = vueCorbeille ? corbeille : fichiers;

  return (
    <BlocLecture
      titre={vueCorbeille ? 'Corbeille' : 'Documents'}
      aside={
        <div className="doc-tete-actions">
          <span className="pill pill--info">{liste.length}</span>
          {corbeille.length > 0 && (
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => setVueCorbeille((v) => !v)}
            >
              {vueCorbeille ? 'Documents' : `Corbeille (${corbeille.length})`}
            </button>
          )}
          {!vueCorbeille && (
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
      }
    >
      {erreur && <p className="field-erreur">{erreur}</p>}
      {liste.length === 0 ? (
        <p className="empty-state">
          {vueCorbeille ? 'Corbeille vide.' : 'Aucun document. Ajoute un PDF, un plan CAO…'}
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
                    : `${f.ajoutePar} · ${formatDateCourte(f.ajouteLe)}`}
                </span>
              </div>
              {!vueCorbeille && (
                <>
                  <select
                    className="field-input doc-select"
                    value={f.type}
                    onChange={(e) => patch(f.id, { type: e.target.value as TypeFichier })}
                    aria-label="Type"
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
                {vueCorbeille ? (
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
    </BlocLecture>
  );
}
