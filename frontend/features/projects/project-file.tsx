'use client';

import { useEffect, useRef, useState } from 'react';
import { DecisionsFiche } from '@/components/pilotage/decisions-fiche';
import { SidePanel } from './side-panel';
import { Pill } from '@/components/ui/pill';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante } from '@/lib/layout-contexte';
import { ETAPE, formatDate } from '@hub/domain';
import { useConfirmer } from '@/components/confirmation';
import { FieldError } from '@/components/ui/field';
import { ApiError } from '@/lib/client-api';
import { AddTsElement } from './add-ts-element';
import { removeProjectLine } from './api';
import { CustomizeBar, LineDialog } from './project-customization';
import { CardThreadPanel } from './card-thread-panel';
import { stepNumber, stepPill } from './labels';
import { ProjectCardView, SURVEY_CARD_KEY } from './project-card';
import { invoicePills, myOpenTasksIn } from './project-tiles';
import { ProjectTeams } from './project-teams';
import { CardAssignment } from './card-assignment';
import { SiteStatusField } from './site-fields';
import { TaskPanel } from './task-panel';
import type { AssignableEmployee, OpenProjectFile, ProjectCard, ProjectTask } from './types';
import type { Selection } from './use-open-projects';

type Props = {
  slug: string;
  file: OpenProjectFile;
  step: number;
  onStep: (n: number) => void;
  selection: Selection;
  onSelection: (s: Selection) => void;
  assignable: AssignableEmployee[] | null;
  meId: string;
  mentionable: { id: string; nom: string }[] | null;
  onUpdate: () => Promise<void>;
  employee: boolean;
  onlyMine: boolean;
  onOnlyMine: (v: boolean) => void;
};

// Dossier d'un projet ouvert : en-tête (cellule, factures, jour J), étapes,
// cartes de l'étape choisie, et le panneau latéral (tâche ou fil d'une carte).
export function ProjectFile({
  slug,
  file: d,
  step,
  onStep,
  selection,
  onSelection,
  assignable,
  meId,
  mentionable,
  onUpdate,
  employee,
  onlyMine,
  onOnlyMine,
}: Props) {
  // « Seulement mes tâches » : proposé dès qu'une tâche du projet est à moi.
  const hasMine = d.cartes.some((c) => c.taches.some((t) => t.aMoi));
  const filter = onlyMine && hasMine;
  const cards = d.cartes
    .filter((c) => c.etapeNumero === step)
    .map((c) => (filter ? { ...c, taches: c.taches.filter((t) => t.aMoi) } : c))
    .filter((c) => !filter || c.taches.length > 0);
  const session = useSessionCourante();
  const canWrite = niveauSuffisant(session, 'projets', 'ecriture');
  // Équipes du projet : écriture sur le module « équipe » (le Dir. GC, l'administration).
  const canEditTeams = niveauSuffisant(session, ETAPE.equipeProjets, 'ecriture');
  const taskId = selection?.type === 'tache' ? selection.id : null;
  // Bloc dont on choisit la personne (bouton de l'en-tête de la carte).
  const [blockCardId, setBlockCardId] = useState<string | null>(null);
  // Personnalisation du projet (01/11/2026) : mode, ligne ouverte, erreur.
  const confirmer = useConfirmer();
  const [customizing, setCustomizing] = useState(false);
  const [lineDialog, setLineDialog] = useState<{ card: ProjectCard; task?: ProjectTask } | null>(null);
  const [customizeError, setCustomizeError] = useState<string | null>(null);
  async function removeLine(card: ProjectCard, task: ProjectTask) {
    const ok = await confirmer({
      titre: `Retirer « ${task.libelle} » ?`,
      message: `La ligne est retirée de ce projet seulement (${card.libelle}). Le gabarit ne change pas.`,
      confirmer: 'Retirer la ligne',
      danger: true,
    });
    if (!ok) return;
    setCustomizeError(null);
    try {
      await removeProjectLine(slug, d.id, task.id);
      await onUpdate();
    } catch (e) {
      setCustomizeError(e instanceof ApiError ? e.message : 'La ligne n’a pas été retirée.');
    }
  }
  const blockCard = d.cartes.find((c) => c.id === blockCardId) ?? null;
  const chosen =
    d.cartes.flatMap((c) => c.taches.map((t) => ({ carte: c, tache: t }))).find((x) => x.tache.id === taskId) ?? null;
  const threadCard = selection?.type === 'carte' ? (d.cartes.find((c) => c.id === selection.id) ?? null) : null;
  const invoices = invoicePills(d);
  // Changer d'étape (desktop, où le dossier défile seul) : si on était
  // descendu, les cartes repartent juste sous les étapes collées.
  const stepsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const band = stepsRef.current;
    const scroller = band?.parentElement;
    const before = band?.previousElementSibling as HTMLElement | null;
    if (!band || !scroller || !before || scroller.scrollHeight <= scroller.clientHeight) return;
    const top = before.offsetTop + before.offsetHeight + parseFloat(getComputedStyle(scroller).rowGap || '0');
    if (scroller.scrollTop > top) scroller.scrollTop = top;
  }, [step]);

  return (
    <>
      <header className="po-dossier-tete">
        <div>
          <p className="po-kicker">Dossier projet</p>
          <h2 className="po-dossier-titre">
            <span className="po-code po-code--grand">{d.code}</span> {d.client.nom}
          </h2>
          {employee ? (
            // Revue Salarié : l'essentiel, sans le vocabulaire de direction.
            <p className="po-aide">
              J{d.jour} sur {d.horizon} · livraison le {formatDate(d.livraisonLe)} ·{' '}
              {d.jeSuisChef ? 'vous êtes chef d’équipe' : `votre chef d’équipe : ${d.cellule?.chef ?? 'à désigner'}`}
            </p>
          ) : (
            <>
              {/* Équipes du projet : le Dir. GC les affecte et les modifie ici. */}
              <ProjectTeams slug={slug} projectId={d.id} canEdit={canEditTeams} onChange={onUpdate} />
              <p className="po-aide">
                {d.cellule?.chef && `Validation aujourd’hui : ${d.cellule.chef} · `}pilote des études : {d.pilote}
                {d.version && ` · ${d.version.code} ${d.version.libelle}`}
                {d.offre && ` depuis ${d.offre}`}
              </p>
              <div className="po-pastilles">
                {invoices.map((f) => (
                  <Pill key={f.libelle} tone={f.ton}>
                    {f.libelle}
                  </Pill>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="po-dossier-jour">
          <strong>
            J{d.jour} / {d.horizon}
          </strong>
          {/* Le Salarié a déjà J et livraison dans sa ligne d'en-tête. */}
          {!employee && (
            <span className="po-aide">
              J1 le {formatDate(d.ouvertLe)} → livraison J{d.horizon} le {formatDate(d.livraisonLe)}
            </span>
          )}
          {d.jour > d.horizon && d.statutChantier !== 'livre' && <Pill tone="risque">Livraison dépassée</Pill>}
          {d.budgetHeures !== null && !employee && (
            <span className="po-aide">Budget atelier {d.budgetHeures} h · durée, pas une somme d’heures</span>
          )}
          <SiteStatusField
            slug={slug}
            projectId={d.id}
            status={d.statutChantier}
            editable={canWrite}
            onUpdate={onUpdate}
          />
        </div>
      </header>
      <DecisionsFiche slug={slug} cible={{ projet: d.id }} />

      <div ref={stepsRef} className="po-etapes" role="tablist" aria-label="Étapes">
        {d.etapes.map((e) => {
          const pill = stepPill(e);
          const mine = myOpenTasksIn(d, e.numero);
          return (
            <button
              key={e.numero}
              type="button"
              role="tab"
              aria-selected={e.numero === step}
              className={`po-etape${e.numero === step ? ' is-actif' : ''}`}
              onClick={() => {
                onStep(e.numero);
                onSelection(null);
              }}
            >
              <span className="po-etape-tete">
                <span>{stepNumber(e.numero)}</span>
                <span>
                  {e.faites}/{e.total} tâches
                </span>
              </span>
              <strong>{e.libelle}</strong>
              <span className="po-etape-pied">
                <Pill tone={pill.ton}>{pill.libelle}</Pill>
                {mine > 0 && (
                  <span className="po-etape-moi" title="Vos tâches en cours dans cette étape">
                    {mine} à moi
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {d.optionsTs.length > 0 && <AddTsElement slug={slug} file={d} onUpdate={onUpdate} />}
      {!employee && <CustomizeBar file={d} active={customizing} onToggle={() => setCustomizing((x) => !x)} />}
      {customizeError && <FieldError>{customizeError}</FieldError>}

      {hasMine && (
        <label className="po-miennes">
          <input type="checkbox" checked={onlyMine} onChange={(e) => onOnlyMine(e.target.checked)} />
          Seulement mes tâches
        </label>
      )}

      <div className="po-corps">
        {/* key : changer d'étape repart du haut de la liste des cartes. */}
        <div className="po-cartes" key={`${step}:${filter}`}>
          {cards.length === 0 && filter && (
            <p className="po-aide">
              Aucune de vos tâches dans cette étape.{' '}
              <button type="button" className="lien-inline po-lien-bouton" onClick={() => onOnlyMine(false)}>
                Voir toutes les tâches
              </button>
            </p>
          )}
          {cards.map((c) => (
            <ProjectCardView
              key={c.id}
              card={c}
              taskId={taskId}
              threadActive={threadCard?.id === c.id}
              onTask={(id) => onSelection({ type: 'tache', id })}
              onThread={() => onSelection({ type: 'carte', id: c.id })}
              visit={
                c.cle === SURVEY_CARD_KEY
                  ? { slug, projectId: d.id, date: d.dateVisiteSite, editable: canWrite, onUpdate }
                  : undefined
              }
              blockTasks={d.cartes.find((x) => x.id === c.id)?.taches}
              onAssignBlock={d.peutAssigner && assignable ? () => setBlockCardId(c.id) : undefined}
              customize={
                customizing && d.peutPersonnaliser
                  ? {
                      onAdd: () => setLineDialog({ card: c }),
                      onEdit: (t) => setLineDialog({ card: c, task: t }),
                      onRemove: (t) => void removeLine(c, t),
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {lineDialog && (
        <LineDialog
          slug={slug}
          projectId={d.id}
          card={lineDialog.card}
          task={lineDialog.task}
          onClose={() => setLineDialog(null)}
          onDone={() => {
            setLineDialog(null);
            void onUpdate();
          }}
        />
      )}

      {blockCard && assignable && (
        <CardAssignment
          slug={slug}
          projectId={d.id}
          card={blockCard}
          assignable={assignable}
          teams={d.equipes}
          onClose={() => setBlockCardId(null)}
          onDone={() => {
            setBlockCardId(null);
            void onUpdate();
          }}
        />
      )}

      {/* Tâche ou fil d'une carte : panneau latéral, le dossier garde la largeur. */}
      {(chosen || threadCard) && (
        <SidePanel
          title={chosen ? `Tâche ${chosen.tache.libelle}` : `Fil de la carte ${threadCard!.libelle}`}
          onClose={() => onSelection(null)}
          header={
            <>
              <p className="fiche-crm-code">{d.code}</p>
              <p className="fiche-crm-meta">{d.client.nom}</p>
            </>
          }
        >
          {chosen ? (
            <TaskPanel
              key={chosen.tache.id}
              slug={slug}
              projectId={d.id}
              code={d.code}
              card={chosen.carte}
              task={chosen.tache}
              assignable={d.peutAssigner ? assignable : null}
              meId={meId}
              mentionable={mentionable}
              onUpdate={onUpdate}
            />
          ) : (
            <CardThreadPanel
              key={threadCard!.id}
              slug={slug}
              projectId={d.id}
              card={threadCard!}
              meId={meId}
              mentionable={mentionable}
              onUpdate={onUpdate}
            />
          )}
        </SidePanel>
      )}
    </>
  );
}
