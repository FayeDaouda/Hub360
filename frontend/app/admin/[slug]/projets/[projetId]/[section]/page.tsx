'use client';

import { useEffect, useState } from 'react';
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
import { AdminShell } from '@/components/admin/admin-shell';

type Props = {
  params: { slug: string; projetId: string; section: string };
};

export default function SectionProjetPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);

  const section = SECTIONS_PROJET.find((s) => s.cle === (params.section as SectionProjet));

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'societe_admin') {
      router.replace(destinationForSession(current));
      return;
    }
    if (!section) {
      router.replace(`/admin/${params.slug}/projets/${params.projetId}`);
      return;
    }
    setSession(current);
    getSociete(params.slug)
      .then(setSociete)
      .catch(() => setSociete(null));
    getProjetExecution(params.slug, params.projetId).then((p) => {
      // Section non disponible pour la catégorie du projet (ex : « permis »
      // sur un projet aménagement) -> retour à la fiche.
      if (p && section && !SECTIONS_PAR_CATEGORIE[p.categorie].includes(section.cle)) {
        router.replace(`/admin/${params.slug}/projets/${params.projetId}`);
        return;
      }
      setProjet(p);
    });
  }, [params.slug, params.projetId, section, router]);

  if (!session || !section) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;

  return (
    <AdminShell
      societe={societe}
      session={session}
      active="projets"
      titre={section.libelle}
    >
      <Link href={retour} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      <section className="panel">
        <h2 className="panel-title">{section.libelle}</h2>
        <p className="empty-state">
          {section.description}. Contenu à venir dans une prochaine étape.
        </p>
      </section>
    </AdminShell>
  );
}
