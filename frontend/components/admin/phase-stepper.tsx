'use client';

import { Fragment, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { changerPhaseProjet } from '@/lib/projets';
import {
  PHASES,
  PHASES_PAR_CATEGORIE,
  peutAvancerPhase,
  type Phase,
  type ProjetExecution,
} from '@/lib/types';

// Couleur « pleine » d'une phase — uniquement pour les 2 bouts d'un lien de
// connexion (--lien-de/--lien-a), qui varient selon la paire d'étapes
// voisines et ne peuvent donc pas être une simple classe CSS statique. La
// pastille elle-même n'a PAS besoin de cette fonction : sa couleur vient
// entièrement de la classe .phase-etape--<phase> (globals.css) — un seul
// point de vérité par couleur, pas de mapping dupliqué JS + CSS.
function couleurPhase(ph: Phase): string {
  return `var(--${
    { avant_projet: 'azur', permis: 'turquoise', etudes: 'iris', chantier: 'mandarine', livre: 'argile' }[ph]
  })`;
}

type Props = {
  slug: string;
  projet: ProjetExecution;
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
  permisObtenu,
  avertissement,
  onChange,
  lectureSeule = false,
}: Props) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const sequence = PHASES_PAR_CATEGORIE[projet.categorie];
  const index = sequence.indexOf(projet.phase);
  const garde = peutAvancerPhase(projet, { permisObtenu });
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
        {sequence.map((ph, i) => {
          const etat = i === index ? 'is-courante' : i < index ? 'is-faite' : 'is-a-venir';
          // Le lien AVANT l'étape i : plein si les deux bouts sont faits,
          // « transition » s'il mène à l'étape courante, pointillé sinon.
          const lienEtat =
            i > index ? 'a-venir' : i === index ? 'transition' : 'faite';
          return (
            <Fragment key={ph}>
              {i > 0 && (
                <li
                  aria-hidden="true"
                  className={`phase-lien-item phase-lien-item--${lienEtat}`}
                  style={
                    {
                      '--lien-de': couleurPhase(sequence[i - 1]),
                      '--lien-a': couleurPhase(ph),
                    } as CSSProperties & Record<'--lien-de' | '--lien-a', string>
                  }
                >
                  <span className="phase-lien" />
                </li>
              )}
              <li
                className={`phase-etape phase-etape--${ph} ${etat}`}
                aria-current={i === index ? 'step' : undefined}
              >
                <span className="phase-pastille">
                  {i < index ? <Check size={20} strokeWidth={2.5} aria-hidden /> : i + 1}
                </span>
                <span className="phase-nom">{PHASES[ph]}</span>
              </li>
            </Fragment>
          );
        })}
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
