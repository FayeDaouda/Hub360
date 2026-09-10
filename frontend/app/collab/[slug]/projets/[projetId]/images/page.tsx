'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ajouterImages,
  getImagesProjet,
  majImage,
  supprimerImages,
} from '@/lib/images';
import { estImage, lireImageRedimensionnee } from '@/lib/image-fichier';
import {
  PHASES,
  PHASES_PAR_CATEGORIE,
  USAGES_IMAGE,
  type ImageProjet,
  type Phase,
  type ProjetExecution,
  type UsageImage,
} from '@/lib/types';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture } from '@/components/collab/lecture';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="images">
      {(projet) => (
        <Vue slug={params.slug} projetId={params.projetId} projet={projet} />
      )}
    </SectionCollabShell>
  );
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
  const [images, setImages] = useState<ImageProjet[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const phases = PHASES_PAR_CATEGORIE[projet.categorie];

  useEffect(() => {
    getImagesProjet(slug, projetId).then(setImages).catch(() => setImages([]));
  }, [slug, projetId]);

  async function surFichiers(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const lus = await Promise.all(
        Array.from(liste)
          .filter(estImage)
          .map((f) => lireImageRedimensionnee(f)),
      );
      if (lus.length === 0) throw new Error('Aucune image valide.');
      const crees = await ajouterImages(slug, projetId, lus, '');
      setImages((i) => [...crees, ...(i ?? [])]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    } finally {
      setEnvoi(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function patch(
    id: string,
    p: { usage?: UsageImage; phase?: Phase | null; legende?: string },
  ) {
    const maj = await majImage(slug, projetId, id, p);
    setImages((i) => (i ? i.map((x) => (x.id === id ? maj : x)) : i));
  }

  async function supprimer(id: string) {
    await supprimerImages(slug, projetId, [id], '');
    setImages((i) => (i ? i.filter((x) => x.id !== id) : i));
  }

  if (images === null) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  return (
    <BlocLecture
      titre="Images"
      aside={
        <div className="doc-tete-actions">
          <span className="pill pill--info">{images.length}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
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
        </div>
      }
    >
      {erreur && <p className="field-erreur">{erreur}</p>}
      {images.length === 0 ? (
        <p className="empty-state">Aucune image.</p>
      ) : (
        <ul className="lecture-galerie">
          {images.map((img) => (
            <li key={img.id}>
              <img src={img.url} alt={img.legende || img.nom} loading="lazy" />
              <select
                className="field-input doc-select"
                value={img.usage}
                onChange={(e) => patch(img.id, { usage: e.target.value as UsageImage })}
                aria-label="Usage"
              >
                {(Object.keys(USAGES_IMAGE) as UsageImage[]).map((u) => (
                  <option key={u} value={u}>
                    {USAGES_IMAGE[u]}
                  </option>
                ))}
              </select>
              <select
                className="field-input doc-select"
                value={img.phase ?? ''}
                onChange={(e) =>
                  patch(img.id, { phase: (e.target.value || null) as Phase | null })
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
              <input
                className="field-input doc-select"
                defaultValue={img.legende}
                placeholder="légende…"
                onBlur={(e) => {
                  if (e.target.value !== img.legende) {
                    patch(img.id, { legende: e.target.value });
                  }
                }}
              />
              <button
                type="button"
                className="doc-icone doc-icone--danger"
                onClick={() => supprimer(img.id)}
                aria-label="Supprimer"
                title="Supprimer"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </BlocLecture>
  );
}
