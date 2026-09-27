'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, HardHat, Images, LandPlot, Lightbulb, Ruler, Stamp } from 'lucide-react';
import { getAvantProjet, getProjetExecution } from '@/lib/projets';
import { getPermis } from '@/lib/permis';
import { getEtudes } from '@/lib/etudes';
import { getExecution } from '@/lib/execution';
import { getMonProfil } from '@/lib/collab';
import { useTitrePage } from '@/lib/layout-contexte';
import {
  avancementChecklistAvp,
  avancementChecklistFichiers,
  avertissementChangementPhase,
  CATEGORIES,
  COULEUR_SECTION,
  etudesEnAttente,
  itemsChecklistAvp,
  NATURES_DOSSIER,
  SECTIONS_PAR_CATEGORIE,
  SECTIONS_PROJET,
  STATUTS_PERMIS,
  STATUTS_PROJET_EXEC,
  TYPES_BIEN,
  type ChecklistAvpGroupe,
  type Etudes,
  type Execution,
  type ProjetExecution,
  type SectionProjet,
  type StatutPermis,
  type StatutProjetExec,
} from '@/lib/types';
import { PhaseStepper } from '@/components/admin/phase-stepper';

type Props = { params: { slug: string; projetId: string } };

const PILL_STATUT_EXEC: Record<StatutProjetExec, string> = {
  a_assigner: 'pill--attention',
  assigne: 'pill--info',
  en_cours: 'pill--info',
  livre: 'pill--succes',
};

const ICONE_SECTION: Record<SectionProjet, typeof Lightbulb> = {
  'avant-projet': Lightbulb,
  images: Images,
  foncier: LandPlot,
  documents: FileText,
  permis: Stamp,
  etude: Ruler,
  execution: HardHat,
};


// Fiche projet côté collaborateur : lecture seule. Vue d'ensemble (en-tête,
// frise de phase, état de chaque section) + accès aux 6 sections en lecture
// seule (pages dédiées sous ce dossier). Toute écriture reste côté admin
// (cf. AccesProjetGuard : GET large, écriture 403 pour le collaborateur).
export default function CollabProjetPage({ params }: Props) {
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [celluleNom, setCelluleNom] = useState<string | null>(null);
  const [avantProjetChecklists, setAvantProjetChecklists] = useState<ChecklistAvpGroupe[]>(
    [],
  );
  const [statutPermis, setStatutPermis] = useState<StatutPermis | null>(null);
  const [etudes, setEtudes] = useState<Etudes | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);

  useTitrePage(projet ? projet.programme : 'Projet');

  useEffect(() => {
    getProjetExecution(params.slug, params.projetId)
      .then((p) => {
        setProjet(p);
        if (!p) return;
        if (p.categorie === 'conception') {
          getPermis(params.slug, params.projetId)
            .then((permis) => setStatutPermis(permis.statut))
            .catch(() => setStatutPermis(null));
          getEtudes(params.slug, params.projetId).then(setEtudes).catch(() => setEtudes(null));
        }
        getExecution(params.slug, params.projetId)
          .then(setExecution)
          .catch(() => setExecution(null));
        // Nom de cellule : via la fiche du collaborateur (pas d'accès à /cellules).
        // Un projet peut avoir plusieurs équipes (sept. 2026) — on affiche la
        // sienne dès qu'elle en fait partie.
        getMonProfil(params.slug)
          .then((moi) => {
            if (moi.celluleId && p.cellules.includes(moi.celluleId)) {
              setCelluleNom(moi.celluleNom);
            }
          })
          .catch(() => {});
      })
      .catch(() => setProjet(null));

    getAvantProjet(params.slug, params.projetId)
      .then((ap) => {
        setAvantProjetChecklists(ap.checklists);
      })
      .catch(() => {});
  }, [params.slug, params.projetId]);

  const sections = useMemo(() => {
    if (!projet) return [];
    return SECTIONS_PROJET.filter((s) =>
      SECTIONS_PAR_CATEGORIE[projet.categorie].includes(s.cle),
    );
  }, [projet]);

  // Avancement de la checklist Exécution (8 blocs) — remplace l'ancien
  // décompte de lots (retiré sept. 2026, cf. mémoire).
  const execAv = execution
    ? avancementChecklistAvp(execution.checklists.flatMap((g) => g.items))
    : null;

  return (
    <>
      <Link href={`/collab/${params.slug}/projets`} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>Mes projets</span>
      </Link>

      {projet === undefined ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : projet === null ? (
        <p className="empty-state empty-state--bloc">
          Projet introuvable ou non rattaché à votre cellule.
        </p>
      ) : (
        <>
          <header className="projet-entete">
            <div className="projet-entete-titre">
              <span className="projet-entete-sur">
                <span className="dossier-code">{projet.code}</span>
                <span className={`pill pill--nature-${projet.nature}`}>
                  {NATURES_DOSSIER[projet.nature]}
                </span>
                <span className={`pill pill--cat-${projet.categorie}`}>
                  {CATEGORIES[projet.categorie]}
                </span>
              </span>
              <h2>{projet.programme}</h2>
              <p className="projet-entete-meta">
                {projet.client.nom} · {projet.localisation} · {TYPES_BIEN[projet.type]}
              </p>
            </div>
            <div className="projet-entete-actions">
              <span className={`pill ${PILL_STATUT_EXEC[projet.statut]}`}>
                {STATUTS_PROJET_EXEC[projet.statut]}
              </span>
              {celluleNom && <span className="chip">{celluleNom}</span>}
            </div>
          </header>

          <PhaseStepper
            slug={params.slug}
            projet={projet}
            permisObtenu={statutPermis === 'obtenu'}
            avertissement={
              avertissementChangementPhase(projet, {
                permisObtenu: statutPermis === 'obtenu',
              }) ??
              (projet.phase === 'etudes' && etudes && etudesEnAttente(etudes) > 0
                ? `${etudesEnAttente(etudes)} étude${
                    etudesEnAttente(etudes) > 1 ? 's' : ''
                  } encore en cours.`
                : projet.phase === 'chantier' && execAv && execAv.total > 0 && !execAv.complete
                  ? `${execAv.total - execAv.faits} item${
                      execAv.total - execAv.faits > 1 ? 's' : ''
                    } pas encore coché${
                      execAv.total - execAv.faits > 1 ? 's' : ''
                    } sur la checklist chantier.`
                  : null)
            }
            onChange={() => {}}
            lectureSeule
          />

          <div className="projet-cartes">
            {sections.map((section) => {
              const Icone = ICONE_SECTION[section.cle];
              let etat: { classe: string; texte: string } | null = null;
              if (section.cle === 'avant-projet') {
                const av = avancementChecklistFichiers(itemsChecklistAvp(avantProjetChecklists));
                if (av.complete) {
                  etat = { classe: 'pill--succes', texte: 'Terminé' };
                } else {
                  etat = {
                    classe: 'pill--attention',
                    texte: av.total ? `En cours · ${av.faits}/${av.total}` : 'En cours',
                  };
                }
              } else if (section.cle === 'permis' && statutPermis) {
                etat = {
                  classe:
                    statutPermis === 'obtenu'
                      ? 'pill--succes'
                      : statutPermis === 'refuse'
                        ? 'pill--risque'
                        : 'pill--info',
                  texte: STATUTS_PERMIS[statutPermis],
                };
              } else if (section.cle === 'etude' && etudes) {
                etat = etudes.dceConstitue
                  ? { classe: 'pill--succes', texte: 'DCE constitué' }
                  : {
                      classe: 'pill--info',
                      texte: `${etudesEnAttente(etudes)} en cours`,
                    };
              } else if (section.cle === 'execution' && execAv && execAv.total > 0) {
                etat = {
                  classe: execAv.complete ? 'pill--succes' : 'pill--info',
                  texte: execAv.complete ? 'Terminé' : `${execAv.faits}/${execAv.total}`,
                };
              }
              return (
                <Link
                  key={section.cle}
                  href={`/collab/${params.slug}/projets/${params.projetId}/${section.cle}`}
                  className={`projet-carte projet-carte--${COULEUR_SECTION[section.cle]}`}
                >
                  <span className="projet-carte-icone">
                    <Icone size={22} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="projet-carte-titre">{section.libelle}</span>
                  <span className="projet-carte-desc">{section.description}</span>
                  {etat && (
                    <span className={`pill ${etat.classe} projet-carte-etat`}>
                      {etat.texte}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
