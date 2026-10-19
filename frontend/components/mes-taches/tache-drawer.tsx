'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { getDossierProjet, getMentionnables, type DossierProjetOuvert } from '@/lib/projets-ouverts';
import { TachePanneau } from '@/components/projets-ouverts/tache-panneau';

// Tâche ouverte en panneau latéral depuis « Mes tâches » (revue Salarié
// 19/10/2026) : le panneau de Projets tel quel — descriptif, remise,
// prolongation, versions, fil de discussion, historique — sans quitter la
// liste. Lecture seule pour l'assignation (le Salarié n'assigne pas).
export function TacheDrawer({
  slug,
  projetId,
  tacheId,
  moiId,
  prolongation,
  onMaj,
  onClose,
}: {
  slug: string;
  projetId: string;
  tacheId: string;
  moiId: string;
  prolongation: boolean;
  onMaj: () => void;
  onClose: () => void;
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const carte = dossier?.cartes.find((c) => c.taches.some((t) => t.id === tacheId));
  const tache = carte?.taches.find((t) => t.id === tacheId);

  return (
    <div className="fiche-crm-fond" onClick={onClose}>
      <div className="fiche-crm mt-tiroir" role="dialog" aria-modal="true" aria-label="Tâche" onClick={(e) => e.stopPropagation()}>
        <div className="fiche-crm-entete">
          <div>
            <p className="fiche-crm-code">{dossier?.code ?? '…'}</p>
            {dossier && (
              <p className="fiche-crm-meta">
                <Link className="lien-inline" href={`/admin/${slug}/projets?projet=${projetId}`}>
                  Ouvrir le projet
                </Link>
              </p>
            )}
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
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
      </div>
    </div>
  );
}
