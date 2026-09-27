'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  HardHat,
  Images,
  LandPlot,
  Lightbulb,
  MapPin,
  Pencil,
  Ruler,
  Stamp,
  UserPlus,
  X,
} from 'lucide-react';
import { getAvantProjet, getProjetExecution } from '@/lib/projets';
import { getCellules } from '@/lib/equipe';
import { getPermis } from '@/lib/permis';
import { getEtudes } from '@/lib/etudes';
import { getExecution } from '@/lib/execution';
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
  type Cellule,
  type StatutPermis,
  type StatutProjetExec,
} from '@/lib/types';
import dynamic from 'next/dynamic';
import { AssignerProjetModal } from '@/components/admin/assigner-projet-modal';
import { PhaseStepper } from '@/components/admin/phase-stepper';

const PinEditor = dynamic(
  () => import('@/components/admin/pin-editor').then((m) => m.PinEditor),
  { ssr: false, loading: () => <div className="fiche-carte" /> },
);

type Props = {
  params: { slug: string; projetId: string };
};

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

export default function ProjetPage({ params }: Props) {
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [cellules, setCellules] = useState<Cellule[]>([]);
  const [assignation, setAssignation] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(false);
  const [avantProjetChecklists, setAvantProjetChecklists] = useState<ChecklistAvpGroupe[]>(
    [],
  );
  const [statutPermis, setStatutPermis] = useState<StatutPermis | null>(null);
  const [etudes, setEtudes] = useState<Etudes | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);

  useTitrePage(projet ? projet.programme : 'Projet');

  useEffect(() => {
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      if (!p) return;
      if (p.categorie === 'conception') {
        getPermis(params.slug, params.projetId).then((permis) => setStatutPermis(permis.statut));
        getEtudes(params.slug, params.projetId).then(setEtudes);
      }
      getExecution(params.slug, params.projetId).then(setExecution);
    });
    getCellules(params.slug).then(setCellules).catch(() => setCellules([]));
    getAvantProjet(params.slug, params.projetId).then((ap) => {
      setAvantProjetChecklists(ap.checklists);
    });
  }, [params.slug, params.projetId]);

  const celluleNoms = useMemo(() => {
    if (!projet) return [];
    return projet.cellules.map((id) => cellules.find((c) => c.id === id)?.nom ?? id);
  }, [projet, cellules]);

  // Avancement de la checklist Exécution (8 blocs) — remplace l'ancien
  // décompte de lots (retiré sept. 2026, cf. mémoire).
  const execAv = execution
    ? avancementChecklistAvp(execution.checklists.flatMap((g) => g.items))
    : null;

  return (
    <>
      <Link href={`/admin/${params.slug}/projets`} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>Projets</span>
      </Link>

      {projet === undefined ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
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
              <span className="projet-equipe">
                {celluleNoms.length ? (
                  celluleNoms.map((nom) => (
                    <span key={nom} className="chip">
                      {nom}
                    </span>
                  ))
                ) : (
                  <span className="cell-sub">Aucune cellule</span>
                )}
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  onClick={() => setAssignation(true)}
                >
                  {projet.cellules.length ? (
                    <Pencil size={14} strokeWidth={2} aria-hidden />
                  ) : (
                    <UserPlus size={14} strokeWidth={2} aria-hidden />
                  )}
                  {projet.cellules.length ? 'Modifier les cellules' : 'Assigner'}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  onClick={() => setCarteOuverte(true)}
                >
                  <MapPin size={14} strokeWidth={2} aria-hidden />
                  {projet.latitude != null ? 'Localisation' : 'Localiser'}
                </button>
              </span>
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
                  } encore en cours — le DCE n'est pas complet.`
                : projet.phase === 'chantier' && execAv && execAv.total > 0 && !execAv.complete
                  ? `${execAv.total - execAv.faits} item${
                      execAv.total - execAv.faits > 1 ? 's' : ''
                    } pas encore coché${
                      execAv.total - execAv.faits > 1 ? 's' : ''
                    } sur la checklist chantier.`
                  : null)
            }
            onChange={setProjet}
          />

          <div className="projet-cartes">
            {SECTIONS_PROJET.filter((section) =>
              SECTIONS_PAR_CATEGORIE[projet.categorie].includes(section.cle),
            ).map((section) => {
              const Icone = ICONE_SECTION[section.cle];
              let etat: { classe: string; texte: string } | null = null;
              if (section.cle === 'avant-projet') {
                const av = avancementChecklistFichiers(itemsChecklistAvp(avantProjetChecklists));
                etat = av.complete
                  ? { classe: 'pill--succes', texte: 'Terminé' }
                  : {
                      classe: 'pill--attention',
                      texte: av.total ? `En cours · ${av.faits}/${av.total}` : 'En cours',
                    };
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
                  href={`/admin/${params.slug}/projets/${projet.id}/${section.cle}`}
                  className={`projet-carte projet-carte--${COULEUR_SECTION[section.cle]}`}
                >
                  <span className="projet-carte-icone">
                    <Icone size={22} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="projet-carte-titre">{section.libelle}</span>
                  <span className="projet-carte-desc">{section.description}</span>
                  {etat && <span className={`pill ${etat.classe} projet-carte-etat`}>{etat.texte}</span>}
                </Link>
              );
            })}
          </div>

          {/* Facturation centralisée (cf. cadrage « Devis ») — retirée de la
              grille projet (sept. 2026) : la carte + sa route dédiée
              disparaissent, remplacées par un lien filtré depuis la page
              centrale /admin/:slug/facturation. */}
          <Link
            href={`/admin/${params.slug}/facturation?projetId=${projet.id}`}
            className="lien-inline"
          >
            Voir la facturation de ce projet →
          </Link>
        </>
      )}

      {assignation && projet && (
        <AssignerProjetModal
          slug={params.slug}
          projet={projet}
          cellules={cellules}
          onClose={() => setAssignation(false)}
          onAssigne={(maj) => setProjet(maj)}
        />
      )}

      {carteOuverte && projet && (
        <div className="modal-backdrop" onClick={() => setCarteOuverte(false)}>
          <div
            className="modal modal--large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="carte-titre"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2 id="carte-titre">Localisation — {projet.programme}</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Fermer"
                onClick={() => setCarteOuverte(false)}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </header>
            <div className="modal-body">
              <p className="cell-sub" style={{ marginTop: 0 }}>
                {projet.localisation}
              </p>
              <PinEditor slug={params.slug} projet={projet} onChange={setProjet} grand />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
