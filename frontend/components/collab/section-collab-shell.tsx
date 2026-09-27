'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getProjetExecution } from '@/lib/projets';
import { useTitrePage } from '@/lib/layout-contexte';
import {
  COULEUR_SECTION,
  SECTIONS_PAR_CATEGORIE,
  SECTIONS_PROJET,
  type ProjetExecution,
  type SectionProjet,
} from '@/lib/types';

// Coquille commune aux pages de section collaborateur (lecture seule) — auth
// + rôle désormais gérés par app/collab/[slug]/layout.tsx (layout persistant,
// cf. cadrage « layout persistant », sept. 2026) : ne reste ici que le
// chargement du projet + la garde de disponibilité de la section pour sa
// catégorie. `children` reçoit le projet chargé.
export function SectionCollabShell({
  slug,
  projetId,
  section,
  children,
}: {
  slug: string;
  projetId: string;
  section: SectionProjet;
  children: (projet: ProjetExecution) => ReactNode;
}) {
  const router = useRouter();
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);

  const meta = SECTIONS_PROJET.find((s) => s.cle === section);
  useTitrePage(meta?.libelle ?? 'Section');

  useEffect(() => {
    getProjetExecution(slug, projetId).then((p) => {
      if (p && !SECTIONS_PAR_CATEGORIE[p.categorie].includes(section)) {
        router.replace(`/collab/${slug}/projets/${projetId}`);
        return;
      }
      setProjet(p);
    });
  }, [slug, projetId, section, router]);

  return (
    <>
      <Link
        href={`/collab/${slug}/projets/${projetId}`}
        className={`lien-retour lien-retour--${COULEUR_SECTION[section]}`}
      >
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
      ) : projet === undefined ? (
        <div
          className="skeleton admin-skeleton-panel admin-skeleton-panel--sm"
          aria-hidden
        />
      ) : (
        children(projet)
      )}
    </>
  );
}
