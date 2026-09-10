'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getProjetExecution } from '@/lib/projets';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  SECTIONS_PAR_CATEGORIE,
  SECTIONS_PROJET,
  type ProjetExecution,
  type SectionProjet,
  type Session,
  type Societe,
} from '@/lib/types';
import { CollaborateurShell } from '@/components/collab/collab-shell';

// Coquille commune aux pages de section collaborateur (lecture seule) : auth +
// rôle + chargement du projet + garde de disponibilité de la section pour la
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
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);

  const meta = SECTIONS_PROJET.find((s) => s.cle === section);

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== slug) {
      router.replace(`/login/${slug}`);
      return;
    }
    if (current.role !== 'collaborateur') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(slug).then(setSociete).catch(() => setSociete(null));
    getProjetExecution(slug, projetId).then((p) => {
      if (p && !SECTIONS_PAR_CATEGORIE[p.categorie].includes(section)) {
        router.replace(`/collab/${slug}/projets/${projetId}`);
        return;
      }
      setProjet(p);
    });
  }, [slug, projetId, section, router]);

  if (!session) return null;

  return (
    <CollaborateurShell
      societe={societe}
      session={session}
      active="projets"
      titre={meta?.libelle ?? 'Section'}
    >
      <Link href={`/collab/${slug}/projets/${projetId}`} className="lien-retour">
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
    </CollaborateurShell>
  );
}
