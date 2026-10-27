'use client';

import { stepNumber } from './labels';
import { ThreadView } from './thread';
import type { ProjectCard } from './types';

type Props = {
  slug: string;
  projectId: string;
  card: ProjectCard;
  meId: string;
  mentionable: { id: string; nom: string }[] | null;
  onUpdate: () => Promise<void>;
};

// « Fil de la carte » (maquette « Projets ») : chaque carte a son fil de
// discussion, en plus de celui de chacune de ses tâches.
export function CardThreadPanel({ slug, projectId, card, meId, mentionable, onUpdate }: Props) {
  return (
    <aside className="po-panneau" aria-label={`Fil de la carte ${card.libelle}`}>
      <p className="po-kicker">
        {stepNumber(card.etapeNumero)} {card.etapeLibelle} · Fil de la carte
      </p>
      <h3 className="po-panneau-titre">{card.libelle}</h3>
      <ThreadView
        key={card.id}
        slug={slug}
        projectId={projectId}
        cardId={card.id}
        meId={meId}
        mentionable={mentionable}
        onUpdate={onUpdate}
      />
    </aside>
  );
}
