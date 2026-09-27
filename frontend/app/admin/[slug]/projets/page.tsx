'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getProjetsExecution } from '@/lib/projets';
import { getCellules } from '@/lib/equipe';
import { useTitrePage } from '@/lib/layout-contexte';

// Leaflet touche `window` → pas de SSR.
const ProjetsCarte = dynamic(
  () => import('@/components/admin/projets-carte').then((m) => m.ProjetsCarte),
  { ssr: false, loading: () => <div className="projets-carte projets-carte--vide">Carte…</div> },
);
import { PHASES, type Cellule, type Phase, type ProjetExecution } from '@/lib/types';
import { DossierProjet } from '@/components/admin/dossier-projet';
import { KpiMiniBars, KpiStrip } from '@/components/admin/kpi-strip';

// Même palette de dégradés que le tableau de bord et le CRM (demande boss,
// sept. 2026 : chaque KPI a sa propre couleur vive) — choix sémantique par
// tuile : « À assigner » garde une couleur d'appel à l'action.
const DEGRADE_KPI: Record<string, { a: string; b: string }> = {
  assigner: { a: '#ff5f6d', b: '#ffc371' }, // Sweet Morning
  cours: { a: '#2e3192', b: '#1bffff' }, // Ocean Blue
  livres: { a: '#11998e', b: '#38ef7d' }, // Quepal
  charge: { a: '#764ba2', b: '#667eea' }, // Plum Plate
};

type Props = {
  params: { slug: string };
};

type Vue = 'grille' | 'phase' | 'carte';

// Toutes les phases, dans l'ordre — sert de colonnes pour la vue « par phase ».
const ORDRE_PHASES: Phase[] = ['avant_projet', 'permis', 'etudes', 'chantier', 'livre'];

export default function ProjetsPage({ params }: Props) {
  useTitrePage('Projets');
  const [projets, setProjets] = useState<ProjetExecution[] | null>(null);
  const [cellules, setCellules] = useState<Cellule[]>([]);
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<Vue>('grille');

  useEffect(() => {
    getProjetsExecution(params.slug).then(setProjets);
    getCellules(params.slug).then(setCellules).catch(() => setCellules([]));
  }, [params.slug]);

  const nomCellule = useMemo(() => {
    const map = new Map(cellules.map((c) => [c.id, c.nom]));
    return (id: string) => map.get(id) ?? id;
  }, [cellules]);

  const filtres = useMemo(() => {
    if (!projets) return [];
    const q = recherche.trim().toLowerCase();
    if (!q) return projets;
    return projets.filter((p) =>
      [p.code, p.programme, p.localisation, p.client.nom].join(' ').toLowerCase().includes(q),
    );
  }, [projets, recherche]);

  const parPhase = useMemo(() => {
    return ORDRE_PHASES.map((ph) => ({
      phase: ph,
      projets: filtres.filter((p) => p.phase === ph),
    })).filter((g) => g.projets.length > 0);
  }, [filtres]);

  // KPI — liste complète, indépendant de la recherche. Un projet à plusieurs
  // cellules (sept. 2026) compte dans la charge de CHACUNE d'entre elles.
  const kpi = useMemo(() => {
    const liste = projets ?? [];
    const parCellule = new Map<string, number>();
    for (const p of liste) {
      if (p.phase === 'livre') continue;
      for (const celluleId of p.cellules) {
        parCellule.set(celluleId, (parCellule.get(celluleId) ?? 0) + 1);
      }
    }
    return {
      aAssigner: liste.filter((p) => p.statut === 'a_assigner').length,
      enCours: liste.filter((p) => p.statut === 'en_cours').length,
      livres: liste.filter((p) => p.phase === 'livre').length,
      charge: [...parCellule.entries()]
        .map(([id, n]) => ({ cle: id, label: nomCellule(id) ?? '—', valeur: n }))
        .sort((a, b) => b.valeur - a.valeur),
    };
  }, [projets, nomCellule]);

  function carte(projet: ProjetExecution) {
    return (
      <DossierProjet
        key={projet.id}
        projet={projet}
        href={`/admin/${params.slug}/projets/${projet.id}`}
        celluleNoms={projet.cellules.map(nomCellule)}
      />
    );
  }

  return (
    <>
      <div className="projets-toolbar">
        <div className="projets-toolbar-info">
          <input
            type="search"
            className="field-input projets-recherche"
            placeholder="Rechercher un code, un programme, un client…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {projets && (
            <span className="projets-compte">
              {filtres.length} projet{filtres.length > 1 ? 's' : ''}
              {recherche && ` sur ${projets.length}`}
            </span>
          )}
        </div>
        <div className="vue-toggle" role="group" aria-label="Affichage">
          <button
            type="button"
            className={vue === 'grille' ? 'is-active' : ''}
            aria-pressed={vue === 'grille'}
            onClick={() => setVue('grille')}
          >
            Grille
          </button>
          <button
            type="button"
            className={vue === 'phase' ? 'is-active' : ''}
            aria-pressed={vue === 'phase'}
            onClick={() => setVue('phase')}
          >
            Par phase
          </button>
          <button
            type="button"
            className={vue === 'carte' ? 'is-active' : ''}
            aria-pressed={vue === 'carte'}
            onClick={() => setVue('carte')}
          >
            Carte
          </button>
        </div>
      </div>

      {projets && projets.length > 0 && (
        <KpiStrip
          tuiles={[
            {
              cle: 'assigner',
              label: 'À assigner',
              valeur: kpi.aAssigner,
              degrade: DEGRADE_KPI.assigner,
            },
            { cle: 'cours', label: 'En cours', valeur: kpi.enCours, degrade: DEGRADE_KPI.cours },
            { cle: 'livres', label: 'Livrés', valeur: kpi.livres, degrade: DEGRADE_KPI.livres },
            {
              cle: 'charge',
              label: 'Charge par cellule',
              contenu: <KpiMiniBars items={kpi.charge} />,
              degrade: DEGRADE_KPI.charge,
            },
          ]}
        />
      )}

      {!projets ? (
        <div className="dossiers-grid" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton dossier-skeleton" />
          ))}
        </div>
      ) : filtres.length === 0 ? (
        <p className="empty-state empty-state--bloc">
          {recherche
            ? 'Aucun projet ne correspond à cette recherche.'
            : 'Aucun projet pour le moment. Un projet est créé automatiquement quand un dossier CRM passe en « Validé ».'}
        </p>
      ) : vue === 'carte' ? (
        <ProjetsCarte slug={params.slug} projets={filtres} />
      ) : vue === 'grille' ? (
        <div className="dossiers-grid">{filtres.map(carte)}</div>
      ) : (
        <div className="dossiers-phases">
          {parPhase.map((groupe) => (
            <section key={groupe.phase} className="dossiers-phase">
              <h2 className="dossiers-phase-titre">
                {PHASES[groupe.phase]}
                <span>{groupe.projets.length}</span>
              </h2>
              <div className="dossiers-grid">{groupe.projets.map(carte)}</div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
