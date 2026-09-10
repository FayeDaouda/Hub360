'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileCheck2 } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getProjetExecution } from '@/lib/projets';
import { annulerDce, constituerDce, getEtudes, majLigneEtude } from '@/lib/etudes';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  CATEGORIES,
  NATURES_DOSSIER,
  STATUTS_ETUDE,
  TYPES_ETUDE,
  etudesCompletes,
  etudesEnAttente,
  type Etudes,
  type LigneEtude,
  type ProjetExecution,
  type Session,
  type Societe,
  type StatutEtude,
  type TypeEtude,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';

type Props = { params: { slug: string; projetId: string } };

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}
function toIso(v: string): string | null {
  return v ? new Date(v).toISOString().slice(0, 10) : null;
}

export default function EtudePage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [etudes, setEtudes] = useState<Etudes | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

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
    getSociete(params.slug).then(setSociete).catch(() => setSociete(null));
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      if (p && p.categorie !== 'conception') {
        router.replace(`/admin/${params.slug}/projets/${params.projetId}`);
      }
    });
    getEtudes(params.slug, params.projetId).then(setEtudes);
  }, [params.slug, params.projetId, router]);

  if (!session) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;
  const nbValidees = etudes
    ? etudes.lignes.filter((l) => l.statut === 'validee').length
    : 0;
  const nbNonRequises = etudes
    ? etudes.lignes.filter((l) => l.statut === 'non_requise').length
    : 0;
  const complet = etudes ? etudesCompletes(etudes) : false;

  async function patchLigne(type: TypeEtude, patch: Partial<Omit<LigneEtude, 'type'>>) {
    setEtudes((e) =>
      e
        ? { ...e, lignes: e.lignes.map((l) => (l.type === type ? { ...l, ...patch } : l)) }
        : e,
    );
    await majLigneEtude(params.slug, params.projetId, type, patch);
  }

  async function faireDce() {
    setEnCours(true);
    setErreur(null);
    try {
      setEtudes(await constituerDce(params.slug, params.projetId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de constituer le DCE.');
    }
    setEnCours(false);
  }

  async function defaireDce() {
    setEtudes(await annulerDce(params.slug, params.projetId));
  }

  return (
    <AdminShell societe={societe} session={session} active="projets" titre="Études">
      <Link href={retour} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!etudes || projet === undefined ? (
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
              <h2>Études techniques</h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
          </header>

          <p className="permis-delai permis-delai--ok">
            {nbValidees} validée{nbValidees > 1 ? 's' : ''}
            {nbNonRequises > 0 && ` · ${nbNonRequises} non requise${nbNonRequises > 1 ? 's' : ''}`}
            {' · '}
            {etudesEnAttente(etudes)} en attente
            {' — '}
            {etudes.dceConstitue
              ? `DCE constitué le ${formatDateCourte(etudes.dceLe!)}`
              : 'DCE non constitué'}
          </p>

          <section className="panel">
            <h3 className="panel-title">Études par corps de métier</h3>
            <div className="admin-table-wrap">
              <table className="admin-table etude-table">
                <thead>
                  <tr>
                    <th>Étude</th>
                    <th>Statut</th>
                    <th>Bureau d'études</th>
                    <th>Remise prévue</th>
                    <th>Remise réelle</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {etudes.lignes.map((l) => (
                    <tr key={l.type} data-inactive={l.statut === 'non_requise' || undefined}>
                      <td data-label="Étude">{TYPES_ETUDE[l.type]}</td>
                      <td data-label="Statut">
                        <select
                          className={`field-input etude-statut etude-statut--${l.statut}`}
                          value={l.statut}
                          onChange={(e) =>
                            patchLigne(l.type, { statut: e.target.value as StatutEtude })
                          }
                        >
                          {(Object.keys(STATUTS_ETUDE) as StatutEtude[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUTS_ETUDE[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Bureau d'études">
                        <input
                          className="field-input"
                          value={l.bet}
                          onChange={(e) =>
                            setEtudes((et) =>
                              et
                                ? {
                                    ...et,
                                    lignes: et.lignes.map((x) =>
                                      x.type === l.type ? { ...x, bet: e.target.value } : x,
                                    ),
                                  }
                                : et,
                            )
                          }
                          onBlur={(e) => patchLigne(l.type, { bet: e.target.value })}
                          placeholder="Nom du BET"
                        />
                      </td>
                      <td data-label="Remise prévue">
                        <input
                          type="date"
                          className="field-input"
                          value={dateInput(l.dateRemisePrevue)}
                          onChange={(e) =>
                            patchLigne(l.type, { dateRemisePrevue: toIso(e.target.value) })
                          }
                        />
                      </td>
                      <td data-label="Remise réelle">
                        <input
                          type="date"
                          className="field-input"
                          value={dateInput(l.dateRemiseReelle)}
                          onChange={(e) =>
                            patchLigne(l.type, { dateRemiseReelle: toIso(e.target.value) })
                          }
                        />
                      </td>
                      <td data-label="Note">
                        <input
                          className="field-input"
                          value={l.note}
                          onChange={(e) =>
                            setEtudes((et) =>
                              et
                                ? {
                                    ...et,
                                    lignes: et.lignes.map((x) =>
                                      x.type === l.type ? { ...x, note: e.target.value } : x,
                                    ),
                                  }
                                : et,
                            )
                          }
                          onBlur={(e) => patchLigne(l.type, { note: e.target.value })}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3 className="panel-title">Dossier de consultation des entreprises (DCE)</h3>
            <p className="ap-a-venir">
              Mobilisable quand chaque étude est validée ou non requise. Sert de base à la
              consultation des entreprises — l'attribution des marchés se fait dans « Exécution ».
            </p>
            {etudes.dceConstitue ? (
              <div className="ap-bandeau" role="status">
                <FileCheck2 size={16} strokeWidth={2} aria-hidden />
                <span>DCE constitué le {formatDateCourte(etudes.dceLe!)}.</span>
                <button type="button" className="lien-inline" onClick={defaireDce}>
                  Annuler
                </button>
              </div>
            ) : (
              <>
                {erreur && <p className="field-erreur">{erreur}</p>}
                <button
                  type="button"
                  className="btn-primary"
                  onClick={faireDce}
                  disabled={enCours || !complet}
                  title={complet ? undefined : 'Toutes les études ne sont pas validées.'}
                >
                  Constituer le DCE
                </button>
              </>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}
