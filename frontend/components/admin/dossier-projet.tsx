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
  celluleNom: string | null;
};

// Un projet = un dossier. Le visuel (chemise + feuilles) est en CSS pur,
// voir .dossier* dans globals.css.
export function DossierProjet({ projet, href, celluleNom }: Props) {
  return (
    <Link href={href} className="dossier">
      <span className="dossier-folder" aria-hidden>
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
          {celluleNom ? ` · ${celluleNom}` : ''}
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
