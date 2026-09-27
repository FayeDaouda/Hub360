'use client';

import { useEffect, useMemo, useState } from 'react';
import { getProjetsExecution } from '@/lib/projets';
import { useTitrePage } from '@/lib/layout-contexte';
import type { ProjetExecution } from '@/lib/types';
import { DossierProjet } from '@/components/admin/dossier-projet';

type Props = { params: { slug: string } };

type FiltreStatut = 'tous' | 'encours' | 'livres';

const FILTRES: { cle: FiltreStatut; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'encours', libelle: 'En cours' },
  { cle: 'livres', libelle: 'Livrés' },
];

function statutInitial(): FiltreStatut {
  if (typeof window === 'undefined') return 'tous';
  const p = new URLSearchParams(window.location.search).get('statut');
  return p === 'encours' || p === 'livres' ? p : 'tous';
}

// Liste des projets du collaborateur — l'API restreint déjà le périmètre à sa
// cellule (+ ceux où il est dessinateur / responsable 3D), cf. AccesProjetGuard.
export default function CollabProjetsPage({ params }: Props) {
  useTitrePage('Mes projets');
  const [projets, setProjets] = useState<ProjetExecution[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<FiltreStatut>('tous');

  // Filtre initial depuis ?statut= (posé par les tuiles de l'accueil).
  useEffect(() => {
    setStatut(statutInitial());
  }, []);

  useEffect(() => {
    getProjetsExecution(params.slug).then(setProjets).catch(() => setProjets([]));
  }, [params.slug]);

  const q = recherche.trim().toLowerCase();
  const filtres = useMemo(() => {
    if (!projets) return [];
    return projets.filter((p) => {
      if (statut === 'encours' && p.phase === 'livre') return false;
      if (statut === 'livres' && p.phase !== 'livre') return false;
      if (!q) return true;
      return `${p.code} ${p.programme} ${p.client.nom} ${p.localisation}`
        .toLowerCase()
        .includes(q);
    });
  }, [projets, q, statut]);

  return (
    <>
      <div className="projets-toolbar">
        <div className="projets-toolbar-info">
          <input
            type="search"
            className="field-input projets-recherche"
            placeholder="Rechercher un code, un programme…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {projets && (
            <span className="projets-compte">
              {filtres.length} projet{filtres.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="segmente" role="tablist" aria-label="Filtrer par statut">
          {FILTRES.map((f) => (
            <button
              key={f.cle}
              type="button"
              role="tab"
              aria-selected={statut === f.cle}
              className={`segmente-opt${statut === f.cle ? ' is-actif' : ''}`}
              onClick={() => setStatut(f.cle)}
            >
              {f.libelle}
            </button>
          ))}
        </div>
      </div>

      {!projets ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : filtres.length === 0 ? (
        <p className="empty-state empty-state--bloc">
          {q
            ? 'Aucun projet ne correspond à cette recherche.'
            : 'Aucun projet ne vous est rattaché pour le moment.'}
        </p>
      ) : (
        <div className="dossiers-grid">
          {filtres.map((p) => (
            <DossierProjet
              key={p.id}
              projet={p}
              href={`/collab/${params.slug}/projets/${p.id}`}
              celluleNoms={[]}
            />
          ))}
        </div>
      )}
    </>
  );
}
