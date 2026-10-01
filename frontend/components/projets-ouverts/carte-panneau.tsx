'use client';

import { numeroEtape, type CarteOuverte } from '@/lib/projets-ouverts';
import { FilDiscussion } from './fil-discussion';

type Props = {
  slug: string;
  projetId: string;
  carte: CarteOuverte;
  moiId: string;
  mentionnables: { id: string; nom: string }[] | null;
  onMaj: () => Promise<void>;
};

// « Fil de la carte » (maquette « Projets ») : chaque carte a son fil de
// discussion, en plus de celui de chacune de ses tâches.
export function CartePanneau({ slug, projetId, carte, moiId, mentionnables, onMaj }: Props) {
  return (
    <aside className="po-panneau" aria-label={`Fil de la carte ${carte.libelle}`}>
      <p className="po-kicker">
        {numeroEtape(carte.etapeNumero)} {carte.etapeLibelle} · Fil de la carte
      </p>
      <h3 className="po-panneau-titre">{carte.libelle}</h3>
      <FilDiscussion slug={slug} projetId={projetId} carteId={carte.id} moiId={moiId} mentionnables={mentionnables} onMaj={onMaj} />
    </aside>
  );
}
