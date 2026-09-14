'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { changerPhaseProjet } from '@/lib/projets';
import {
  PHASES,
  PHASES_PAR_CATEGORIE,
  peutAvancerPhase,
  type Phase,
  type ProjetExecution,
} from '@/lib/types';

type Props = {
  slug: string;
  projet: ProjetExecution;
  avantProjetValide: boolean;
  permisObtenu: boolean;
  // Avertissement souple : affiché sous le stepper sans bloquer la transition
  // (ex : « 3 études encore en cours »).
  avertissement?: string | null;
  onChange: (projet: ProjetExecution) => void;
  // Vue collaborateur : la frise d'avancement seule, sans les boutons de
  // transition (le changement de phase reste une action admin).
  lectureSeule?: boolean;
};

export function PhaseStepper({
  slug,
  projet,
  avantProjetValide,
  permisObtenu,
  avertissement,
  onChange,
  lectureSeule = false,
}: Props) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const sequence = PHASES_PAR_CATEGORIE[projet.categorie];
  const index = sequence.indexOf(projet.phase);
  const garde = peutAvancerPhase(projet, { avantProjetValide, permisObtenu });
  const peutReculer = index > 0;

  async function aller(cible: Phase) {
    setEnCours(true);
    setErreur(null);
    try {
      onChange(await changerPhaseProjet(slug, projet.id, cible));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Transition impossible');
    }
    setEnCours(false);
  }

  return (
    <div className="phase-stepper">
      <p className="phase-suite-compact">
        Phase {index + 1} / {sequence.length} — <strong>{PHASES[projet.phase]}</strong>
      </p>
      <ol className="phase-suite">
        {sequence.map((ph, i) => (
          <li
            key={ph}
            className={
              i === index ? 'is-courante' : i < index ? 'is-faite' : undefined
            }
          >
            <span className="phase-pastille">{i + 1}</span>
            <span className="phase-nom">{PHASES[ph]}</span>
          </li>
        ))}
      </ol>

      {lectureSeule ? (
        avertissement ? (
          <p className="phase-hint phase-hint--doux">{avertissement}</p>
        ) : null
      ) : (
        <>
      <div className="phase-actions">
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          disabled={enCours || !peutReculer}
          onClick={() => aller(sequence[index - 1])}
        >
          <ChevronLeft size={15} strokeWidth={2} aria-hidden />
          <span>Phase précédente</span>
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={enCours || !garde.ok}
          title={garde.ok ? undefined : garde.raison}
          onClick={() => aller(sequence[index + 1])}
        >
          <span>
            {garde.ok
              ? `Passer en « ${PHASES[sequence[index + 1]]} »`
              : PHASES[projet.phase] === PHASES.livre
                ? 'Dernière phase'
                : 'Phase suivante'}
          </span>
          <ChevronRight size={15} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {garde.ok && avertissement && (
        <p className="phase-hint phase-hint--doux">{avertissement}</p>
      )}
      {erreur && <p className="field-erreur">{erreur}</p>}
        </>
      )}
    </div>
  );
}
