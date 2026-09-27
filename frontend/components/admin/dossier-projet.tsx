import Link from 'next/link';
import {
  CATEGORIES,
  NATURES_DOSSIER,
  PHASES,
  STATUTS_PROJET_EXEC,
  type ProjetExecution,
  type StatutProjetExec,
} from '@/lib/types';

// Statut = eye-catch de la carte : Argile (actif) / Ocre (à assigner) /
// Sauge (livré) via le système de pastilles — cf. Direction visuelle §5.
const PILL_STATUT_EXEC: Record<StatutProjetExec, string> = {
  a_assigner: 'pill--attention',
  assigne: 'pill--info',
  en_cours: 'pill--info',
  livre: 'pill--succes',
};

type Props = {
  projet: ProjetExecution;
  href: string;
  celluleNoms: string[];
};

// Couleur du dossier : variété purement visuelle, pas un classement (cf.
// .dossier-folder--v1..v5 dans globals.css). Dérivée de l'id du projet plutôt
// que Math.random() — la même carte doit garder la même couleur d'un rendu à
// l'autre, pas en piocher une nouvelle à chaque re-render.
const NB_VARIANTES_DOSSIER = 5;

function varianteDossier(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % NB_VARIANTES_DOSSIER) + 1;
}

// Un projet = un dossier. Le visuel (chemise + feuilles) est en CSS pur,
// voir .dossier* dans globals.css.
export function DossierProjet({ projet, href, celluleNoms }: Props) {
  return (
    <Link href={href} className="dossier">
      <span
        className={`dossier-folder dossier-folder--v${varianteDossier(projet.id)}`}
        aria-hidden
      >
        <span className="dossier-folder-back" />
        <span className="dossier-paper dossier-paper--1" />
        <span className="dossier-paper dossier-paper--2" />
        <span className="dossier-folder-front" />
      </span>

      <span className="dossier-infos">
        <span className="dossier-code">{projet.code}</span>
        <span className="dossier-sur">
          <span className={`pill pill--nature-${projet.nature}`}>
            {NATURES_DOSSIER[projet.nature]}
          </span>
          <span className={`pill pill--cat-${projet.categorie}`}>
            {CATEGORIES[projet.categorie]}
          </span>
        </span>
        <span className="dossier-nom">{projet.programme}</span>
        <span className="dossier-meta">
          {projet.client.nom}
          {celluleNoms.length ? ` · ${celluleNoms.join(', ')}` : ''}
        </span>
        <span className="dossier-bas">
          <span className="pill pill--phase">{PHASES[projet.phase]}</span>
          <span className={`pill ${PILL_STATUT_EXEC[projet.statut]}`}>
            {STATUTS_PROJET_EXEC[projet.statut]}
          </span>
        </span>
      </span>
    </Link>
  );
}
