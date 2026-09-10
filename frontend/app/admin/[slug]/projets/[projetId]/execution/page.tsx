'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getPreBilan, getProjetExecution } from '@/lib/projets';
import {
  ajouterCrChantier,
  ajouterReserve,
  ajouterSituation,
  attribuerLot,
  getExecution,
  majLot,
  majReception,
  majReserve,
  supprimerSituation,
} from '@/lib/execution';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  CATEGORIES,
  NATURES_DOSSIER,
  STATUTS_LOT,
  TYPES_LOT,
  lotsEnAttente,
  totalMarches,
  verseSurLot,
  type Execution,
  type Lot,
  type ProjetExecution,
  type Session,
  type Societe,
  type StatutLot,
  type TypeLot,
} from '@/lib/types';
import { formatDateCourte, formatEcartMontant, formatMontantCompact } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';

type Props = { params: { slug: string; projetId: string } };

function dInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : '';
}
function toIso(v: string) {
  return v ? new Date(v).toISOString().slice(0, 10) : null;
}

export default function ExecutionPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [exec, setExec] = useState<Execution | null>(null);
  const [refPreBilan, setRefPreBilan] = useState<number | null>(null);
  const [lotOuvert, setLotOuvert] = useState<TypeLot | null>(null);
  const [crTexte, setCrTexte] = useState('');
  const [reserveTexte, setReserveTexte] = useState('');

  const utilisateur = session
    ? `${session.utilisateur.prenom} ${session.utilisateur.nom}`.trim()
    : '';

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
      if (p) getExecution(params.slug, params.projetId, p.categorie).then(setExec);
    });
    getPreBilan(params.slug, params.projetId).then((pb) => {
      const derniere = pb.versions[pb.versions.length - 1];
      setRefPreBilan(
        derniere
          ? Object.values(derniere.couts).reduce<number>((s, n) => s + (n ?? 0), 0)
          : null,
      );
    });
  }, [params.slug, params.projetId, router]);

  const lot = useMemo(
    () => exec?.lots.find((l) => l.type === lotOuvert) ?? null,
    [exec, lotOuvert],
  );

  if (!session) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;
  const conception = projet?.categorie === 'conception';

  function patchExec(mut: (e: Execution) => void) {
    setExec((e) => {
      if (!e) return e;
      const copie: Execution = structuredClone(e);
      mut(copie);
      return copie;
    });
  }

  async function patchLot(type: TypeLot, patch: Partial<Lot>) {
    patchExec((e) => {
      e.lots = e.lots.map((l) => (l.type === type ? { ...l, ...patch } : l));
    });
    await majLot(params.slug, params.projetId, type, patch, projet!.categorie);
  }

  async function attribuer(type: TypeLot, entreprise: string, montant: number) {
    if (!entreprise.trim() || !montant) return;
    setExec(await attribuerLot(params.slug, params.projetId, type, entreprise.trim(), montant));
  }

  async function ajouterSit(type: TypeLot, form: HTMLFormElement) {
    const fd = new FormData(form);
    const montant = Number(fd.get('montant')) || 0;
    const retenue = Number(fd.get('retenue')) || 0;
    setExec(
      await ajouterSituation(params.slug, params.projetId, type, {
        date: String(fd.get('date') || new Date().toISOString().slice(0, 10)),
        avancementCumule: Number(fd.get('avct')) || 0,
        montantSituation: montant,
        retenueGarantie: retenue,
        montantVerse: montant - retenue,
      }),
    );
    form.reset();
  }

  async function supprSit(type: TypeLot, id: string) {
    setExec(await supprimerSituation(params.slug, params.projetId, type, id));
  }

  async function ajCr() {
    if (!crTexte.trim()) return;
    setExec(await ajouterCrChantier(params.slug, params.projetId, crTexte, utilisateur));
    setCrTexte('');
  }

  async function patchReception(patch: Partial<Execution['reception']>) {
    patchExec((e) => {
      e.reception = { ...e.reception, ...patch };
    });
    await majReception(params.slug, params.projetId, patch);
  }

  async function ajReserve() {
    if (!reserveTexte.trim()) return;
    setExec(await ajouterReserve(params.slug, params.projetId, reserveTexte));
    setReserveTexte('');
  }

  async function toggleReserve(id: string, ouverte: boolean) {
    setExec(
      await majReserve(params.slug, params.projetId, id, {
        statut: ouverte ? 'levee' : 'ouverte',
        dateLevee: ouverte ? new Date().toISOString().slice(0, 10) : null,
      }),
    );
  }

  const totalM = exec ? totalMarches(exec) : 0;
  const ecartBudget = refPreBilan !== null ? totalM - refPreBilan : null;

  return (
    <AdminShell societe={societe} session={session} active="projets" titre="Exécution">
      <Link href={retour} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!exec || projet === undefined ? (
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
              <h2>Exécution / chantier</h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
          </header>

          {/* Budget chantier — rollup marchés vs pré-bilan */}
          <section className="panel">
            <h3 className="panel-title">Budget chantier</h3>
            <div className="exec-budget">
              <div>
                <span className="exec-budget-label">Marchés signés</span>
                <span className="exec-budget-val">{formatMontantCompact(totalM)}</span>
              </div>
              <div>
                <span className="exec-budget-label">Référence (dernier chiffrage)</span>
                <span className="exec-budget-val">
                  {refPreBilan !== null ? formatMontantCompact(refPreBilan) : '—'}
                </span>
              </div>
              <div>
                <span className="exec-budget-label">Écart</span>
                <span
                  className={`exec-budget-val ${
                    ecartBudget === null
                      ? ''
                      : ecartBudget > 0
                        ? 'prebilan-delta--mauvais'
                        : 'prebilan-delta--bon'
                  }`}
                >
                  {ecartBudget === null ? '—' : formatEcartMontant(ecartBudget)}
                </span>
              </div>
            </div>
          </section>

          {/* Lots & marchés */}
          <section className="panel">
            <h3 className="panel-title">Lots &amp; marchés</h3>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Statut</th>
                    <th>Entreprise</th>
                    <th>Montant marché</th>
                    <th>Avancement</th>
                    <th>Versé / reste</th>
                    <th aria-label="Détail" />
                  </tr>
                </thead>
                <tbody>
                  {exec.lots.map((l) => {
                    const verse = verseSurLot(l);
                    return (
                      <tr key={l.type}>
                        <td data-label="Lot">{TYPES_LOT[l.type]}</td>
                        <td data-label="Statut">
                          <select
                            className="field-input etude-statut"
                            value={l.statut}
                            onChange={(e) =>
                              patchLot(l.type, { statut: e.target.value as StatutLot })
                            }
                          >
                            {(Object.keys(STATUTS_LOT) as StatutLot[]).map((s) => (
                              <option key={s} value={s}>
                                {STATUTS_LOT[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Entreprise">{l.entrepriseRetenue || '—'}</td>
                        <td data-label="Montant marché">
                          {l.montantMarche ? formatMontantCompact(l.montantMarche) : '—'}
                        </td>
                        <td data-label="Avancement">
                          <span className="progress">
                            <span className="progress-track">
                              <span
                                className="progress-fill"
                                style={{ width: `${l.avancement}%` }}
                              />
                            </span>
                            <span className="progress-val">{l.avancement} %</span>
                          </span>
                        </td>
                        <td data-label="Versé / reste">
                          {l.montantMarche ? (
                            <>
                              {formatMontantCompact(verse)}
                              <span className="cell-sub">
                                reste {formatMontantCompact(l.montantMarche - verse)}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td data-label="">
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--sm"
                            onClick={() => setLotOuvert(l.type)}
                          >
                            Détail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* CR de chantier */}
          <section className="panel">
            <h3 className="panel-title">Comptes-rendus de chantier</h3>
            <div className="permis-journal-ajout">
              <input
                className="field-input"
                value={crTexte}
                onChange={(e) => setCrTexte(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ajCr()}
                placeholder="Visite du 12/09 — points traités, décisions, blocages"
              />
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={ajCr}
                disabled={!crTexte.trim()}
              >
                <Plus size={14} strokeWidth={2} aria-hidden />
                <span>Ajouter</span>
              </button>
            </div>
            {exec.crChantier.length === 0 ? (
              <p className="images-vide">Aucun compte-rendu.</p>
            ) : (
              <ul className="permis-journal">
                {exec.crChantier.map((c) => (
                  <li key={c.id}>
                    <span className="permis-journal-date">{formatDateCourte(c.date)}</span>
                    <span className="permis-journal-texte">{c.texte}</span>
                    <span className="permis-journal-auteur">{c.auteur}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Réception */}
          <section className="panel">
            <h3 className="panel-title">Réception</h3>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Réception provisoire</span>
                <input
                  type="date"
                  className="field-input"
                  value={dInput(exec.reception.receptionProvisoire)}
                  onChange={(e) =>
                    patchReception({ receptionProvisoire: toIso(e.target.value) })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Réception définitive</span>
                <input
                  type="date"
                  className="field-input"
                  value={dInput(exec.reception.receptionDefinitive)}
                  onChange={(e) =>
                    patchReception({ receptionDefinitive: toIso(e.target.value) })
                  }
                />
              </label>
            </div>

            {conception ? (
              <>
                <div className="permis-journal-ajout" style={{ marginTop: '1rem' }}>
                  <input
                    className="field-input"
                    value={reserveTexte}
                    onChange={(e) => setReserveTexte(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && ajReserve()}
                    placeholder="Nouvelle réserve — ex : reprise peinture cage d'escalier"
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm"
                    onClick={ajReserve}
                    disabled={!reserveTexte.trim()}
                  >
                    <Plus size={14} strokeWidth={2} aria-hidden />
                    <span>Réserve</span>
                  </button>
                </div>
                {exec.reception.reserves.length === 0 ? (
                  <p className="images-vide">Aucune réserve.</p>
                ) : (
                  <ul className="exec-reserves">
                    {exec.reception.reserves.map((r) => (
                      <li key={r.id} className={r.statut === 'levee' ? 'is-levee' : undefined}>
                        <label className="ap-checklist-item">
                          <input
                            type="checkbox"
                            checked={r.statut === 'levee'}
                            onChange={() => toggleReserve(r.id, r.statut === 'ouverte')}
                          />
                          <span>{r.description}</span>
                        </label>
                        {r.statut === 'levee' && r.dateLevee && (
                          <span className="cell-sub">levée le {formatDateCourte(r.dateLevee)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <label className="field" style={{ marginTop: '1rem', maxWidth: 260 }}>
                  <span className="field-label">Levée des réserves</span>
                  <input
                    type="date"
                    className="field-input"
                    value={dInput(exec.reception.leveeReserves)}
                    onChange={(e) => patchReception({ leveeReserves: toIso(e.target.value) })}
                  />
                </label>
              </>
            ) : (
              <label className="ap-checklist-item" style={{ marginTop: '1rem' }}>
                <input
                  type="checkbox"
                  checked={exec.reception.validationClient}
                  onChange={(e) =>
                    patchReception({
                      validationClient: e.target.checked,
                      dateValidationClient: e.target.checked
                        ? new Date().toISOString().slice(0, 10)
                        : null,
                    })
                  }
                />
                <span>
                  Aménagement validé par le client
                  {exec.reception.dateValidationClient &&
                    ` — le ${formatDateCourte(exec.reception.dateValidationClient)}`}
                </span>
              </label>
            )}

            <p className="ap-a-venir">
              La réception définitive ouvre la demande de certificat de conformité (section
              « Permis »).
            </p>
          </section>
        </>
      )}

      {lot && projet && (
        <LotModal
          lot={lot}
          onClose={() => setLotOuvert(null)}
          onPatch={(patch) => patchLot(lot.type, patch)}
          onAttribuer={(ent, m) => attribuer(lot.type, ent, m)}
          onAjouterSituation={(form) => ajouterSit(lot.type, form)}
          onSupprimerSituation={(id) => supprSit(lot.type, id)}
        />
      )}
    </AdminShell>
  );
}

function LotModal({
  lot,
  onClose,
  onPatch,
  onAttribuer,
  onAjouterSituation,
  onSupprimerSituation,
}: {
  lot: Lot;
  onClose: () => void;
  onPatch: (patch: Partial<Lot>) => void;
  onAttribuer: (entreprise: string, montant: number) => void;
  onAjouterSituation: (form: HTMLFormElement) => void;
  onSupprimerSituation: (id: string) => void;
}) {
  const [ent, setEnt] = useState(lot.entrepriseRetenue);
  const [montant, setMontant] = useState(String(lot.montantMarche || ''));
  const verse = verseSurLot(lot);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal image-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{TYPES_LOT[lot.type]}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h4 className="exec-sous-titre">Consultation &amp; attribution</h4>
          {lot.offres.length > 0 && (
            <table className="admin-table exec-offres">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Offre</th>
                  <th>Délai</th>
                  <th aria-label="Retenir" />
                </tr>
              </thead>
              <tbody>
                {lot.offres.map((o) => (
                  <tr key={o.id}>
                    <td>{o.entreprise}</td>
                    <td>{formatMontantCompact(o.montant)}</td>
                    <td>{o.delaiJours ? `${o.delaiJours} j` : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="lien-inline"
                        onClick={() => {
                          setEnt(o.entreprise);
                          setMontant(String(o.montant));
                        }}
                      >
                        Retenir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="field-row">
            <label className="field">
              <span className="field-label">Entreprise retenue</span>
              <input
                className="field-input"
                value={ent}
                onChange={(e) => setEnt(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Montant du marché (FCFA)</span>
              <input
                type="number"
                min="0"
                className="field-input"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            onClick={() => onAttribuer(ent, Number(montant))}
            disabled={!ent.trim() || !Number(montant)}
          >
            Attribuer le lot
          </button>

          <h4 className="exec-sous-titre">Suivi</h4>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Avancement physique (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                className="field-input"
                value={lot.avancement}
                onChange={(e) => onPatch({ avancement: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field-label">Fin prévue</span>
              <input
                type="date"
                className="field-input"
                value={lot.dateFinPrevue ? lot.dateFinPrevue.slice(0, 10) : ''}
                onChange={(e) =>
                  onPatch({
                    dateFinPrevue: e.target.value
                      ? new Date(e.target.value).toISOString().slice(0, 10)
                      : null,
                  })
                }
              />
            </label>
          </div>

          <h4 className="exec-sous-titre">Situations de paiement</h4>
          <p className="exec-sit-resume">
            Versé {formatMontantCompact(verse)} / marché{' '}
            {formatMontantCompact(lot.montantMarche)} — reste{' '}
            {formatMontantCompact(Math.max(0, lot.montantMarche - verse))}
          </p>
          {lot.situations.length > 0 && (
            <table className="admin-table exec-offres">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th>Avct cum.</th>
                  <th>Situation</th>
                  <th>Ret. garantie</th>
                  <th>Versé</th>
                  <th aria-label="Supprimer" />
                </tr>
              </thead>
              <tbody>
                {lot.situations.map((s) => (
                  <tr key={s.id}>
                    <td>{s.numero}</td>
                    <td>{formatDateCourte(s.date)}</td>
                    <td>{s.avancementCumule} %</td>
                    <td>{formatMontantCompact(s.montantSituation)}</td>
                    <td>{formatMontantCompact(s.retenueGarantie)}</td>
                    <td>{formatMontantCompact(s.montantVerse)}</td>
                    <td>
                      <button
                        type="button"
                        className="lien-inline"
                        onClick={() => onSupprimerSituation(s.id)}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={12} strokeWidth={2} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form
            className="exec-sit-form"
            onSubmit={(e) => {
              e.preventDefault();
              onAjouterSituation(e.currentTarget);
            }}
          >
            <input type="date" name="date" className="field-input" required aria-label="Date" />
            <input
              type="number"
              name="avct"
              min="0"
              max="100"
              className="field-input"
              placeholder="Avct %"
              aria-label="Avancement cumulé"
            />
            <input
              type="number"
              name="montant"
              min="0"
              className="field-input"
              placeholder="Montant"
              required
              aria-label="Montant situation"
            />
            <input
              type="number"
              name="retenue"
              min="0"
              className="field-input"
              placeholder="Ret. gar."
              aria-label="Retenue de garantie"
            />
            <button type="submit" className="btn-ghost btn-ghost--sm">
              <Plus size={14} strokeWidth={2} aria-hidden />
              <span>Situation</span>
            </button>
          </form>

          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
