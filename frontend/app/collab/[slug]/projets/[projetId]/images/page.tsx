'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Link2, Plus, Trash2 } from 'lucide-react';
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
  TYPES_PHOTO_IMAGE,
  USAGES_IMAGE,
  type ImageProjet,
  type Phase,
  type ProjetExecution,
  type TypePhotoImage,
  type UsageImage,
} from '@/lib/types';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture } from '@/components/collab/lecture';
import { AjoutImagesModal } from '@/components/ajout-images-modal';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell
      slug={params.slug}
      projetId={params.projetId}
      section="images"
    >
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
  const [erreur, setErreur] = useState<string | null>(null);
  // Fichiers choisis, en attente du type de photo demandé dans la popup
  // avant que l'upload ne parte réellement (obligatoire, cf. échange du
  // 2026-09-17).
  const [fichiersEnAttente, setFichiersEnAttente] = useState<File[] | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const phases = PHASES_PAR_CATEGORIE[projet.categorie];

  useEffect(() => {
    getImagesProjet(slug, projetId)
      .then(setImages)
      .catch(() => setImages([]));
  }, [slug, projetId]);

  function surFichiers(liste: FileList | null) {
    const fichiers = Array.from(liste ?? []).filter(estImage);
    if (fichiers.length) setFichiersEnAttente(fichiers);
  }

  async function confirmerAjout(typePhoto: TypePhotoImage) {
    const fichiers = fichiersEnAttente;
    if (!fichiers) return;
    setErreur(null);
    try {
      const lus = await Promise.all(
        fichiers.map((f) => lireImageRedimensionnee(f)),
      );
      const crees = await ajouterImages(slug, projetId, lus, '', typePhoto);
      setImages((i) => [...crees, ...(i ?? [])]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    } finally {
      setFichiersEnAttente(null);
    }
  }

  async function patch(
    id: string,
    p: {
      usage?: UsageImage;
      phase?: Phase | null;
      typePhoto?: TypePhotoImage | null;
      legende?: string;
    },
  ) {
    const maj = await majImage(slug, projetId, id, p);
    setImages((i) => (i ? i.map((x) => (x.id === id ? maj : x)) : i));
  }

  async function supprimer(id: string) {
    await supprimerImages(slug, projetId, [id], '');
    setImages((i) => (i ? i.filter((x) => x.id !== id) : i));
  }

  if (images === null) {
    return (
      <div
        className="skeleton admin-skeleton-panel admin-skeleton-panel--sm"
        aria-hidden
      />
    );
  }

  return (
    <>
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
              onChange={(e) => {
                surFichiers(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn-primary btn-ghost--sm"
              onClick={() => inputRef.current?.click()}
            >
              <Plus size={15} strokeWidth={2} aria-hidden />
              Ajouter
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
                <img
                  src={img.url}
                  alt={img.legende || img.nom}
                  loading="lazy"
                />
                {img.typePhoto && (
                  <span className="image-type-bande" data-type={img.typePhoto}>
                    {TYPES_PHOTO_IMAGE[img.typePhoto]}
                  </span>
                )}
                {img.provenance && (
                  <Link
                    href={`/collab/${slug}/projets/${projetId}/${img.provenance.route}`}
                    className="image-provenance"
                  >
                    <Link2 size={13} strokeWidth={2} aria-hidden />
                    Depuis : {img.provenance.libelle}
                  </Link>
                )}
                <select
                  className="field-input doc-select"
                  value={img.usage}
                  onChange={(e) =>
                    patch(img.id, { usage: e.target.value as UsageImage })
                  }
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
                    patch(img.id, {
                      phase: (e.target.value || null) as Phase | null,
                    })
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
                <select
                  className="field-input doc-select"
                  value={img.typePhoto ?? ''}
                  onChange={(e) =>
                    patch(img.id, {
                      typePhoto: (e.target.value ||
                        null) as TypePhotoImage | null,
                    })
                  }
                  aria-label="Type de photo"
                >
                  <option value="">Type —</option>
                  {(Object.keys(TYPES_PHOTO_IMAGE) as TypePhotoImage[]).map(
                    (t) => (
                      <option key={t} value={t}>
                        {TYPES_PHOTO_IMAGE[t]}
                      </option>
                    ),
                  )}
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

      {fichiersEnAttente && (
        <AjoutImagesModal
          nbFichiers={fichiersEnAttente.length}
          onConfirmer={confirmerAjout}
          onClose={() => setFichiersEnAttente(null)}
        />
      )}
    </>
  );
}
