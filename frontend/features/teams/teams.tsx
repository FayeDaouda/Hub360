'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { ChampModal } from '@/components/admin/champ-modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';
import { useSectionEnLecture } from '@/lib/defilement';
import { useEnteteFixe } from '@/lib/entete-fixe';
import { useMediaQuery } from '@/lib/media';
import { deleteCell, renameCell, setCellPilot, updateEmployee } from './api';
import { CellCard } from './cell-card';
import { CellSummary, cellAnchor } from './cell-summary';
import { CreateCell } from './create-cell';
import { Nomenclature } from './nomenclature';
import { AbsencesList, OngoingTasksList, SignedProjectsList, UnassignedList } from './team-lists';
import { teamTiles, type TeamList } from './team-tiles';
import type { EmployeeLevel, TeamCell } from './types';
import { useTeamsView } from './use-teams-view';

// Équipes (maquette du boss, oct. 2026) : cinq indicateurs, chacun ouvre sa
// liste pour agir directement ; « Cellules » par défaut, avec la création et
// la nomenclature ISO 9001. Écriture selon la matrice (module équipe).
export function Teams({ slug, canWrite }: { slug: string; canWrite: boolean }) {
  const { view, pendingAbsences, setPendingAbsences, error, reload, run } = useTeamsView(slug);
  // ?liste=affecter : depuis « À décider aujourd'hui » (nouvel arrivant).
  const requested = useSearchParams().get('liste');
  const [list, setList] = useState<TeamList>(requested === 'affecter' ? 'affecter' : 'cellules');
  const [toRename, setToRename] = useState<TeamCell | null>(null);
  const [toDelete, setToDelete] = useState<TeamCell | null>(null);

  // Actions reprises de l'ancienne page Équipe (phase 1, G1 à G4) : chaque
  // réussite recharge la vue, le serveur fait foi (règles de cellule, 409).
  const reassign = (employeeId: string, cellId: string | null) =>
    run(() => updateEmployee(slug, employeeId, { celluleId: cellId }), 'La réaffectation a échoué.');
  const setPilot = (cellId: string, employeeId: string | null) =>
    run(() => setCellPilot(slug, cellId, employeeId), 'Le chef d’équipe n’a pas été modifié.');
  const updateMember = (employeeId: string, patch: { niveau?: EmployeeLevel; photo?: string | null }) =>
    run(() => updateEmployee(slug, employeeId, patch), 'La modification a échoué.');

  // Sommaire des cellules : barre de raccourcis collée tant que les cellules
  // tiennent sur une colonne (≤ 1100 px), sinon en tête de la colonne de
  // droite collée (23-equipes-pilotage.css).
  const narrow = useMediaQuery('(max-width: 1100px)');
  const shortcutBar = useRef<HTMLElement>(null);
  const withSummary = list === 'cellules' && !!view;
  useEnteteFixe(withSummary && narrow);
  const reading = useSectionEnLecture(
    withSummary ? view.cellules.map((c) => cellAnchor(c.id)) : [],
    narrow ? shortcutBar : undefined,
  );

  if (!view) return error ? <FieldError>{error}</FieldError> : <Skeleton />;

  // Pilotes sans compte HUB : signalés une fois pour toutes les cellules.
  const withoutAccount = view.cellules.filter((c) => c.pilote?.sansCompte).map((c) => c.pilote!.nom);

  return (
    <div className="eq">
      <p className="eq-sous-titre">Choisissez un indicateur pour ouvrir la liste correspondante et agir directement.</p>
      <div className="eq-tuiles" role="tablist" aria-label="Indicateurs">
        {teamTiles(view, canWrite, pendingAbsences).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={list === t.key}
            className={`panel glass-panel po-tuile eq-tuile${list === t.key ? ' is-active' : ''}`}
            onClick={() => setList(t.key)}
          >
            <span className="po-tuile-libelle">{t.label}</span>
            <strong className={`po-tuile-valeur${t.tone ? ` po-ton--${t.tone}` : ''}`}>{t.value}</strong>
            <span className="po-aide">{t.hint}</span>
          </button>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}

      {list === 'cellules' && withoutAccount.length > 0 && (
        <p className="eq-alerte" role="note">
          {withoutAccount.length === 1
            ? `${withoutAccount[0]} n’a pas de compte HUB : les remises et demandes de sa cellule remontent au Dir. GC. Créez-lui un compte, ou désignez un autre chef d’équipe.`
            : `${withoutAccount.length} chefs d’équipe n’ont pas de compte HUB (${withoutAccount.join(', ')}) : les remises et demandes de leur cellule remontent au Dir. GC. Créez-leur un compte, ou désignez d’autres chefs d’équipe.`}
        </p>
      )}
      {list === 'cellules' && narrow && (
        <CellSummary cells={view.cellules} reading={reading} compact bar={shortcutBar} />
      )}
      {list === 'cellules' && (
        <div className="eq-colonnes">
          <div className="eq-cellules">
            {view.cellules.map((c) => (
              <CellCard
                key={c.id}
                slug={slug}
                cell={c}
                cells={view.cellules}
                canWrite={canWrite}
                onReassign={reassign}
                onRename={setToRename}
                onDelete={setToDelete}
                onPilot={setPilot}
                onUpdateMember={updateMember}
              />
            ))}
          </div>
          <aside className="eq-cote">
            {!narrow && <CellSummary cells={view.cellules} reading={reading} compact={false} />}
            {canWrite && <CreateCell slug={slug} view={view} onCreated={reload} />}
            <Nomenclature prefix={view.prochainsCodes.ARC.split('-')[0]} />
          </aside>
        </div>
      )}

      {list === 'affecter' && <UnassignedList view={view} canWrite={canWrite} onAssign={reassign} />}
      {list === 'projets' && <SignedProjectsList slug={slug} view={view} />}
      {list === 'taches' && <OngoingTasksList view={view} />}
      {list === 'absences' && (
        <AbsencesList slug={slug} view={view} pending={pendingAbsences} onCount={setPendingAbsences} />
      )}

      {/* Hors des cartes « glass » : une modale fixe y serait positionnée par
          rapport à la carte, pas à l'écran. */}
      {toRename && (
        <ChampModal
          titre="Renommer la cellule"
          label="Nom"
          valeurInitiale={toRename.nom}
          onSubmit={async (name) => {
            await renameCell(slug, toRename.id, name.trim());
            setToRename(null);
            reload();
          }}
          onClose={() => setToRename(null)}
        />
      )}
      {toDelete && (
        <ConfirmModal
          title="Supprimer la cellule"
          message={`Supprimer « ${toDelete.code} · ${toDelete.nom} » ? Une cellule qui a encore des membres ne peut pas être supprimée.`}
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            await deleteCell(slug, toDelete.id);
            setToDelete(null);
            reload();
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
