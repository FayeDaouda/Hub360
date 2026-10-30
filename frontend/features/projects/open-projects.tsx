'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { KpiStrip } from '@/components/ui/kpi';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';
import { consultationEtCommentaires, sectionAccessible } from '@/lib/acces-back-office';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { HOURS_PER_DAY } from './labels';
import { ProjectFile } from './project-file';
import { ProjectPicker } from './project-picker';
import { boardTiles, employeeTiles } from './project-tiles';
import { useOpenProjects } from './use-open-projects';
import { ROLE_DIR_GC, ROLE_EMPLOYEE } from '@hub/domain';

// Projets · gabarit (maquette « Projets » du boss, vue CIO) : tuiles, projets
// ouverts, et le dossier du projet choisi — étapes, cartes, tâches.
export function OpenProjects({ slug }: { slug: string }) {
  const session = useSessionCourante();
  // Écran tenu dans la fenêtre (desktop, cf. globals.css) : la hauteur
  // disponible part du haut réel de la page, mesuré (barre du haut comprise).
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => el.style.setProperty('--po-haut', `${el.getBoundingClientRect().top + window.scrollY}px`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  // « Lecture et assignation » : la liste n'est chargée que pour qui assigne.
  const canAssign = niveauSuffisant(session, 'projets', 'ecriture');
  const dplg = session.role === ROLE_DIR_GC;
  const employee = session.role === ROLE_EMPLOYEE;
  // « Seulement mes tâches » : proposé à quiconque a une tâche dans le
  // projet ; décoché d'office — chacun voit d'abord tout le projet
  // (décision du 29/10/2026, remplace la revue Salarié du 19/10).
  const [onlyMine, setOnlyMine] = useState(false);
  // CEO, CFO : lecture, et les fils en écriture (exception ciblée, revérifiée
  // par le serveur) ; aucune action de circuit.
  const readAndComment = consultationEtCommentaires(session);
  // Fil en écriture : qui écrit sur Projets, le Salarié sur ses projets, CEO et CFO.
  const canWriteThreads = canAssign || employee || readAndComment;
  const p = useOpenProjects(slug, { canWriteThreads, employee });
  const { board } = p;

  // Le nom du gabarit parle à la direction, pas au Salarié (revue mobile 20/10/2026).
  useTitrePage(employee ? 'Projets' : `Projets · gabarit ${board?.gabarit ?? 'GC-CONCEPTION'}`);

  const horizon = board ? Math.round(board.budgetHeures / HOURS_PER_DAY) : null;
  const compact = !!board && board.projets.length < 3;
  const access = dplg
    ? 'Dir. GC : équipes du projet, assignation, désactivation, prolongations, validation en suppléance'
    : employee
      ? 'Salarié : remise, prolongation, discussion ; le chef d’équipe assigne et valide'
      : readAndComment
        ? 'Consultation et commentaires'
        : canAssign
          ? 'Lecture et assignation · accès complet'
          : 'Lecture seule';

  return (
    <div className="po" ref={root}>
      <div className="po-entete">
        <p className="po-sous-titre">
          {employee ? (
            'Les projets de votre équipe et ceux où vous avez une tâche : tout le projet, ce que vous avez à rendre, son échéance et les échanges avec l’équipe.'
          ) : (
            <>
              Étapes → cartes → tâches générées depuis le devis signé à l’émission de F1
              {horizon !== null && ` · ${horizon} jours ouvrés (${board!.budgetHeures} h)`}, délais figés, validation
              par le chef d’équipe.
            </>
          )}
        </p>
        <div className="po-entete-actions">
          {/* Réglages : réservés au CIO (page Paramètres hors matrice). */}
          {sectionAccessible(session, 'parametres') && (
            <Link className="btn-ghost" href={`/admin/${slug}/reglages?section=gabarit`}>
              Gabarit et paramètres
            </Link>
          )}
          {!employee && <span className="po-acces">{access}</span>}
        </div>
      </div>

      {p.error && <FieldError>{p.error}</FieldError>}

      <div className="po-kpi">
        <KpiStrip
          compact
          tiles={
            employee
              ? employeeTiles(p.counts, board, slug, p.openFirstToReview)
              : boardTiles(board, dplg, false, p.openFirstToReview)
          }
        />
      </div>

      {board && board.projets.length === 0 ? (
        <section className="panel glass-panel po-vide">
          <h2>Aucun projet ouvert</h2>
          <p className="po-aide">
            Un projet s’ouvre à l’émission de sa facture F1 (Réglages · Ouverture du projet) : ses étapes, cartes et
            tâches sont alors générées depuis le gabarit, délais figés.
          </p>
        </section>
      ) : (
        <div className={`po-colonnes${compact ? ' po-colonnes--compacte' : ''}`}>
          <ProjectPicker board={board} projectId={p.projectId} onSelect={p.selectProject} compact={compact} />

          <section className="panel glass-panel po-dossier" aria-label="Dossier projet">
            {!p.file ? (
              <Skeleton />
            ) : (
              // Zone qui défile (desktop) ; key : un autre projet repart du haut.
              <div className="po-dossier-defile" key={p.file.id}>
                <ProjectFile
                  slug={slug}
                  file={p.file}
                  step={p.step}
                  onStep={p.setStep}
                  selection={p.selection}
                  onSelection={p.setSelection}
                  assignable={p.assignable}
                  meId={session.utilisateur.id}
                  mentionable={canWriteThreads ? p.mentionable : null}
                  onUpdate={p.reload}
                  employee={employee}
                  onlyMine={onlyMine}
                  onOnlyMine={setOnlyMine}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
