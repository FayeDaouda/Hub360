'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getDossierProjet, getMentionnables, type DossierProjetOuvert } from '@/lib/projets-ouverts';
import { PanneauLateral } from '@/components/projets-ouverts/panneau-lateral';
import { TachePanneau } from '@/components/projets-ouverts/tache-panneau';

// Tâche ouverte en panneau latéral depuis « Mes tâches » (revue Salarié
// 19/10/2026) : le panneau de Projets tel quel — descriptif, remise,
// prolongation, versions, fil de discussion, historique — sans quitter la
// liste. Lecture seule pour l'assignation (le Salarié n'assigne pas).
// En-tête : une ligne fine projet · client (le titre est celui de la tâche,
// dans le panneau). J / K : tâche précédente / suivante sans fermer.
export function TacheDrawer({
  slug,
  projetId,
  tacheId,
  moiId,
  prolongation,
  onMaj,
  onClose,
  onVoisine,
}: {
  slug: string;
  projetId: string;
  tacheId: string;
  moiId: string;
  prolongation: boolean;
  onMaj: () => void;
  onClose: () => void;
  // J / K : ouvrir la tâche précédente (-1) ou suivante (+1) de la liste.
  onVoisine?: (sens: -1 | 1) => void;
}) {
  const [dossier, setDossier] = useState<DossierProjetOuvert | null>(null);
  const [mentionnables, setMentionnables] = useState<{ id: string; nom: string }[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(
    () =>
      getDossierProjet(slug, projetId)
        .then(setDossier)
        .catch((e) => setErreur(e instanceof Error && e.message ? e.message : 'Tâche indisponible.')),
    [slug, projetId],
  );
  useEffect(() => {
    setDossier(null);
    void charger();
  }, [charger]);
  useEffect(() => {
    getMentionnables(slug)
      .then(setMentionnables)
      .catch(() => setMentionnables(null));
  }, [slug]);

  useEffect(() => {
    if (!onVoisine) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'j' && e.key !== 'k')) return;
      const cible = e.target as HTMLElement | null;
      if (cible?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal-backdrop')) return;
      e.preventDefault();
      onVoisine(e.key === 'j' ? 1 : -1);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onVoisine]);

  const carte = dossier?.cartes.find((c) => c.taches.some((t) => t.id === tacheId));
  const tache = carte?.taches.find((t) => t.id === tacheId);

  return (
    <PanneauLateral
      titre="Tâche"
      onClose={onClose}
      entete={
        <p className="tp-fil">
          <span className="tp-fil-code">{dossier?.code ?? '…'}</span>
          {dossier && (
            <>
              {' · '}
              {dossier.client.nom} ·{' '}
              <Link className="lien-inline" href={`/admin/${slug}/projets?projet=${projetId}`}>
                Ouvrir le projet
              </Link>
            </>
          )}
        </p>
      }
    >
      {erreur && <p className="field-erreur">{erreur}</p>}
      {!dossier && !erreur && <div className="skeleton admin-skeleton-panel" aria-hidden />}
      {dossier && carte && tache ? (
        <TachePanneau
          slug={slug}
          projetId={projetId}
          code={dossier.code}
          carte={carte}
          tache={tache}
          assignables={null}
          moiId={moiId}
          mentionnables={mentionnables}
          prolongationOuverte={prolongation}
          onMaj={async () => {
            await charger();
            onMaj();
          }}
        />
      ) : (
        dossier && <p className="dmd-note">Cette tâche n’est plus dans le projet.</p>
      )}
    </PanneauLateral>
  );
}
