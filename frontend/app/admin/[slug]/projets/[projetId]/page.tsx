'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  HardHat,
  Images,
  Lightbulb,
  MapPin,
  ReceiptText,
  Ruler,
  Stamp,
  X,
} from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getAvantProjet, getProjetExecution } from '@/lib/projets';
import { getCellules } from '@/lib/equipe';
import { getPermis } from '@/lib/permis';
import { getEtudes } from '@/lib/etudes';
import { getExecution } from '@/lib/execution';
import { getFacturation } from '@/lib/facturation';
import { formatMontantCompact } from '@/lib/format';
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
  type ResumeFacturation,
  type ProjetExecution,
  type SectionProjet,
  type Cellule,
  type Session,
  type Societe,
  type StatutPermis,
  type StatutProjetExec,
} from '@/lib/types';
import dynamic from 'next/dynamic';
import { AdminShell } from '@/components/admin/admin-shell';
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
  documents: FileText,
  permis: Stamp,
  etude: Ruler,
  execution: HardHat,
};

export default function ProjetPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [cellules, setCellules] = useState<Cellule[]>([]);
  const [assignation, setAssignation] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(false);
  const [avantProjetValideLe, setAvantProjetValideLe] = useState<string | null>(null);
  const [avantProjetChecklists, setAvantProjetChecklists] = useState<ChecklistAvpGroupe[]>(
    [],
  );
  const [statutPermis, setStatutPermis] = useState<StatutPermis | null>(null);
  const [etudes, setEtudes] = useState<Etudes | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [factuResume, setFactuResume] = useState<ResumeFacturation | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'societe_admin') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug)
      .then(setSociete)
      .catch(() => setSociete(null));
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      if (!p) return;
      if (p.categorie === 'conception') {
        getPermis(params.slug, params.projetId).then((permis) => setStatutPermis(permis.statut));
        getEtudes(params.slug, params.projetId).then(setEtudes);
      }
      getExecution(params.slug, params.projetId, p.categorie).then(setExecution);
    });
    getFacturation(params.slug, params.projetId)
      .then((f) => setFactuResume(f.resume))
      .catch(() => setFactuResume(null));
    getCellules(params.slug).then(setCellules).catch(() => setCellules([]));
    getAvantProjet(params.slug, params.projetId).then((ap) => {
      setAvantProjetValideLe(ap.valideLe);
      setAvantProjetChecklists(ap.checklists);
    });
  }, [params.slug, params.projetId, router]);

  const celluleNom = useMemo(() => {
    if (!projet?.celluleAssignee) return null;
    return cellules.find((c) => c.id === projet.celluleAssignee)?.nom ?? null;
  }, [projet, cellules]);

  if (!session) return null;

  return (
    <AdminShell
      societe={societe}
      session={session}
      active="projets"
      titre={projet ? projet.programme : 'Projet'}
    >
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
                {celluleNom ? (
                  <span className="chip">{celluleNom}</span>
                ) : (
                  <span className="cell-sub">Aucune cellule</span>
                )}
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  onClick={() => setAssignation(true)}
                >
                  {projet.celluleAssignee ? 'Modifier la cellule' : 'Assigner'}
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
                  } encore en cours — le DCE n'est pas complet.`
                : projet.phase === 'chantier' && execution && lotsEnAttente(execution) > 0
                  ? `${lotsEnAttente(execution)} lot${
                      lotsEnAttente(execution) > 1 ? 's' : ''
                    } pas encore terminé${lotsEnAttente(execution) > 1 ? 's' : ''}.`
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
              } else if (section.cle === 'execution' && execution && execution.lots.length > 0) {
                const enAttente = lotsEnAttente(execution);
                etat = execution.reception.receptionDefinitive
                  ? { classe: 'pill--succes', texte: 'Réceptionné' }
                  : { classe: 'pill--info', texte: `${enAttente} lot${enAttente > 1 ? 's' : ''}` };
              }
              return (
                <Link
                  key={section.cle}
                  href={`/admin/${params.slug}/projets/${projet.id}/${section.cle}`}
                  className="projet-carte"
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

            {/* Facturation — module « gestion », admin only, hors SECTIONS_PROJET
                (jamais dans la vue collaborateur). */}
            {(() => {
              let etat = { classe: 'pill--neutre', texte: 'Aucune facture' };
              if (factuResume) {
                if (factuResume.nbEnRetard > 0) {
                  etat = {
                    classe: 'pill--risque',
                    texte: `${factuResume.nbEnRetard} en retard`,
                  };
                } else if (factuResume.totalDu > 0) {
                  etat = {
                    classe: 'pill--info',
                    texte: `Reste ${formatMontantCompact(factuResume.totalDu)}`,
                  };
                } else if (factuResume.totalFactureTtc > 0) {
                  etat = { classe: 'pill--succes', texte: 'Soldé' };
                }
              }
              return (
                <Link
                  href={`/admin/${params.slug}/projets/${projet.id}/facturation`}
                  className="projet-carte"
                >
                  <span className="projet-carte-icone">
                    <ReceiptText size={22} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="projet-carte-titre">Facturation</span>
                  <span className="projet-carte-desc">
                    Factures client, TVA, échéancier, paiements
                  </span>
                  <span className={`pill ${etat.classe} projet-carte-etat`}>
                    {etat.texte}
                  </span>
                </Link>
              );
            })()}
          </div>
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
    </AdminShell>
  );
}
