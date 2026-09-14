'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, HardHat, Images, Lightbulb, Ruler, Stamp } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getAvantProjet, getProjetExecution } from '@/lib/projets';
import { getPermis } from '@/lib/permis';
import { getEtudes } from '@/lib/etudes';
import { getExecution } from '@/lib/execution';
import { getMonProfil } from '@/lib/collab';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  avancementChecklistAvp,
  avertissementChangementPhase,
  CATEGORIES,
  etudesEnAttente,
  itemsChecklistAvp,
  lotsEnAttente,
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
  type Session,
  type Societe,
  type StatutPermis,
  type StatutProjetExec,
} from '@/lib/types';
import { CollaborateurShell } from '@/components/collab/collab-shell';
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
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [celluleNom, setCelluleNom] = useState<string | null>(null);
  const [avantProjetValideLe, setAvantProjetValideLe] = useState<string | null>(null);
  const [avantProjetChecklists, setAvantProjetChecklists] = useState<ChecklistAvpGroupe[]>(
    [],
  );
  const [statutPermis, setStatutPermis] = useState<StatutPermis | null>(null);
  const [etudes, setEtudes] = useState<Etudes | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'collaborateur') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug).then(setSociete).catch(() => setSociete(null));

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
        getExecution(params.slug, params.projetId, p.categorie)
          .then(setExecution)
          .catch(() => setExecution(null));
        // Nom de cellule : via la fiche du collaborateur (pas d'accès à /cellules).
        getMonProfil(params.slug)
          .then((moi) => {
            if (moi.celluleId && moi.celluleId === p.celluleAssignee) {
              setCelluleNom(moi.celluleNom);
            }
          })
          .catch(() => {});
      })
      .catch(() => setProjet(null));

    getAvantProjet(params.slug, params.projetId)
      .then((ap) => {
        setAvantProjetValideLe(ap.valideLe);
        setAvantProjetChecklists(ap.checklists);
      })
      .catch(() => {});
  }, [params.slug, params.projetId, router]);

  const sections = useMemo(() => {
    if (!projet) return [];
    return SECTIONS_PROJET.filter((s) =>
      SECTIONS_PAR_CATEGORIE[projet.categorie].includes(s.cle),
    );
  }, [projet]);

  if (!session) return null;

  return (
    <CollaborateurShell
      societe={societe}
      session={session}
      active="projets"
      titre={projet ? projet.programme : 'Projet'}
    >
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
            avantProjetValide={!!avantProjetValideLe}
            permisObtenu={statutPermis === 'obtenu'}
            avertissement={
              avertissementChangementPhase(projet, {
                avantProjetValide: !!avantProjetValideLe,
                permisObtenu: statutPermis === 'obtenu',
              }) ??
              (projet.phase === 'etudes' && etudes && etudesEnAttente(etudes) > 0
                ? `${etudesEnAttente(etudes)} étude${
                    etudesEnAttente(etudes) > 1 ? 's' : ''
                  } encore en cours.`
                : projet.phase === 'chantier' && execution && lotsEnAttente(execution) > 0
                  ? `${lotsEnAttente(execution)} lot${
                      lotsEnAttente(execution) > 1 ? 's' : ''
                    } pas encore terminé${lotsEnAttente(execution) > 1 ? 's' : ''}.`
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
                if (avantProjetValideLe) {
                  etat = { classe: 'pill--succes', texte: 'Validé' };
                } else {
                  const av = avancementChecklistAvp(
                    itemsChecklistAvp(avantProjetChecklists),
                  );
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
              } else if (
                section.cle === 'execution' &&
                execution &&
                execution.lots.length > 0
              ) {
                const enAttente = lotsEnAttente(execution);
                etat = execution.reception.receptionDefinitive
                  ? { classe: 'pill--succes', texte: 'Réceptionné' }
                  : {
                      classe: 'pill--info',
                      texte: `${enAttente} lot${enAttente > 1 ? 's' : ''}`,
                    };
              }
              return (
                <Link
                  key={section.cle}
                  href={`/collab/${params.slug}/projets/${params.projetId}/${section.cle}`}
                  className="projet-carte"
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
    </CollaborateurShell>
  );
}
