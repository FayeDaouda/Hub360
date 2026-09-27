'use client';

import { useEffect, useState } from 'react';
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

type Props = {
  params: { slug: string; projetId: string; section: string };
};

export default function SectionProjetPage({ params }: Props) {
  const router = useRouter();
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);

  const section = SECTIONS_PROJET.find((s) => s.cle === (params.section as SectionProjet));
  useTitrePage(section?.libelle ?? 'Section');

  useEffect(() => {
    if (!section) {
      router.replace(`/admin/${params.slug}/projets/${params.projetId}`);
      return;
    }
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

  if (!section) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;

  return (
    <>
      <Link href={retour} className={`lien-retour lien-retour--${COULEUR_SECTION[section.cle]}`}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      <section className="panel">
        <h2 className="panel-title">{section.libelle}</h2>
        <p className="empty-state">
          {section.description}. Contenu à venir dans une prochaine étape.
        </p>
      </section>
    </>
  );
}
