'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, Send, Trash2, Undo2, Wallet } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getProjetExecution } from '@/lib/projets';
import {
  ajouterPaiement,
  creerAvoir,
  creerEcheancier,
  creerFacture,
  emettreFacture,
  getFacturation,
  majFacture,
  supprimerFacture,
  supprimerPaiement,
} from '@/lib/facturation';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  CATEGORIES,
  JALONS_FACTURE,
  MODES_PAIEMENT,
  NATURES_DOSSIER,
  STATUTS_FACTURE,
  TAUX_TVA_DEFAUT,
  TYPES_BIEN,
  type Facture,
  type Facturation,
  type JalonFacture,
  type ModePaiement,
  type ProjetExecution,
  type Session,
  type Societe,
  type StatutFactureEffectif,
} from '@/lib/types';
import { formatMontant, formatMontantCompact } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';

type Props = { params: { slug: string; projetId: string } };

const AUJOURD_HUI = () => new Date().toISOString().slice(0, 10);

const PILL_FACTURE: Record<StatutFactureEffectif, string> = {
  brouillon: 'pill--neutre',
  emise: 'pill--info',
  partiellement_payee: 'pill--attention',
  payee: 'pill--succes',
  en_retard: 'pill--risque',
  annulee: 'pill--neutre',
};

// Une facture porte des actions selon son statut stocké. L'avoir (négatif) et la
// facture annulée sont en lecture seule.
function actionsPossibles(f: Facture) {
  return {
    modifiable: f.statut === 'brouillon',
    emissible: f.statut === 'brouillon',
    encaissable: f.statut === 'emise' && !f.estAvoir,
    annulable: f.statut === 'emise' && !f.estAvoir,
  };
}

export default function FacturationPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [factu, setFactu] = useState<Facturation | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [paiementsId, setPaiementsId] = useState<string | null>(null);

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
    getProjetExecution(params.slug, params.projetId).then(setProjet);
    getFacturation(params.slug, params.projetId).then(setFactu);
  }, [params.slug, params.projetId, router]);

  const factureEditee = useMemo(
    () => factu?.factures.find((f) => f.id === editId) ?? null,
    [factu, editId],
  );
  const facturePaiements = useMemo(
    () => factu?.factures.find((f) => f.id === paiementsId) ?? null,
    [factu, paiementsId],
  );

  if (!session) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;
  const mandat = projet?.nature === 'mandat_client';
  const echeancierPose = !!factu?.factures.some((f) => f.jalon);

  // Toute mutation renvoie la Facturation complète — on remplace l'état et on
  // laisse le back faire foi (statuts dérivés, numéro, résumé).
  async function action<T>(fn: () => Promise<Facturation>) {
    setBusy(true);
    setErreur(null);
    try {
      setFactu(await fn());
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Une erreur est survenue.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell societe={societe} session={session} active="projets" titre="Facturation">
      <Link href={retour} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!factu || projet === undefined ? (
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
              <h2>Facturation client</h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation} ·{' '}
                {TYPES_BIEN[projet.type]}
              </p>
            </div>
          </header>

          {erreur && <p className="field-erreur">{erreur}</p>}

          {/* Résumé */}
          <section className="panel">
            <h3 className="panel-title">Résumé</h3>
            <div className="factu-resume">
              <div>
                <span className="factu-resume-label">Net facturé (TTC)</span>
                <span className="factu-resume-val">
                  {formatMontantCompact(factu.resume.totalFactureTtc)}
                </span>
              </div>
              <div>
                <span className="factu-resume-label">Encaissé</span>
                <span className="factu-resume-val">
                  {formatMontantCompact(factu.resume.totalEncaisse)}
                </span>
              </div>
              <div>
                <span className="factu-resume-label">Reste dû</span>
                <span
                  className={`factu-resume-val ${
                    factu.resume.totalDu > 0
                      ? 'prebilan-delta--mauvais'
                      : factu.resume.totalDu < 0
                        ? 'prebilan-delta--bon'
                        : ''
                  }`}
                >
                  {formatMontantCompact(factu.resume.totalDu)}
                </span>
              </div>
              <div>
                <span className="factu-resume-label">En retard</span>
                <span
                  className={`factu-resume-val ${
                    factu.resume.nbEnRetard > 0 ? 'prebilan-delta--mauvais' : ''
                  }`}
                >
                  {factu.resume.nbEnRetard}
                </span>
              </div>
            </div>
          </section>

          {/* Factures */}
          <section className="panel">
            <h3 className="panel-title">Factures</h3>
            {factu.factures.length === 0 ? (
              <p className="images-vide">Aucune facture. Créez-en une ci-dessous.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Réf.</th>
                      <th>Objet</th>
                      <th>Statut</th>
                      <th>TTC</th>
                      <th>Payé</th>
                      <th>Reste</th>
                      <th>Échéance</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {factu.factures.map((f) => {
                      const a = actionsPossibles(f);
                      const cls = f.estAvoir
                        ? 'factu-l--avoir'
                        : f.statut === 'annulee'
                          ? 'factu-l--annulee'
                          : undefined;
                      return (
                        <tr key={f.id} className={cls}>
                          <td data-label="Réf.">
                            {f.reference ?? <span className="cell-sub">brouillon</span>}
                          </td>
                          <td data-label="Objet">
                            {f.libelle || <span className="cell-sub">—</span>}
                            {f.jalon && (
                              <span className="chip factu-chip">
                                {JALONS_FACTURE.find((j) => j.cle === f.jalon)?.libelle}
                              </span>
                            )}
                          </td>
                          <td data-label="Statut">
                            {f.estAvoir ? (
                              <span className="pill pill--neutre">Avoir</span>
                            ) : (
                              <span className={`pill ${PILL_FACTURE[f.statutEffectif]}`}>
                                {STATUTS_FACTURE[f.statutEffectif]}
                              </span>
                            )}
                          </td>
                          <td data-label="TTC">{formatMontantCompact(f.montantTtc)}</td>
                          <td data-label="Payé">
                            {f.montantPaye ? formatMontantCompact(f.montantPaye) : '—'}
                          </td>
                          <td data-label="Reste">
                            {f.estAvoir || f.statut === 'annulee'
                              ? '—'
                              : formatMontantCompact(f.resteAPayer)}
                            {f.statutEffectif === 'en_retard' && (
                              <span className="cell-sub">
                                {f.joursRetard} j de retard
                              </span>
                            )}
                          </td>
                          <td data-label="Échéance">{f.echeanceLe ?? '—'}</td>
                          <td data-label="" className="cell-actions">
                            <span className="factu-actions">
                              {a.modifiable && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={() => setEditId(f.id)}
                                >
                                  <Pencil size={12} strokeWidth={2} aria-hidden /> Modifier
                                </button>
                              )}
                              {a.emissible && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Émettre la facture ? Un numéro définitif lui est attribué et elle ne sera plus modifiable (correction par avoir).',
                                      )
                                    ) {
                                      void action(() =>
                                        emettreFacture(params.slug, params.projetId, f.id),
                                      );
                                    }
                                  }}
                                >
                                  <Send size={12} strokeWidth={2} aria-hidden /> Émettre
                                </button>
                              )}
                              {a.encaissable && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={() => setPaiementsId(f.id)}
                                >
                                  <Wallet size={12} strokeWidth={2} aria-hidden /> Paiements
                                  {f.paiements.length > 0 && ` (${f.paiements.length})`}
                                </button>
                              )}
                              {a.annulable && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Créer un avoir pour annuler ${f.reference} ? La facture passera en « annulée » et un avoir du même montant en négatif sera émis.`,
                                      )
                                    ) {
                                      void action(() =>
                                        creerAvoir(params.slug, params.projetId, f.id),
                                      );
                                    }
                                  }}
                                >
                                  <Undo2 size={12} strokeWidth={2} aria-hidden /> Avoir
                                </button>
                              )}
                              {a.modifiable && (
                                <button
                                  type="button"
                                  className="lien-inline btn-ghost--danger"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm('Supprimer ce brouillon ?')) {
                                      void action(() =>
                                        supprimerFacture(params.slug, params.projetId, f.id),
                                      );
                                    }
                                  }}
                                >
                                  <Trash2 size={12} strokeWidth={2} aria-hidden />
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Création */}
          <CreationFacture
            mandat={mandat}
            echeancierPose={echeancierPose}
            suggestionVenteHt={factu.resume.suggestionVenteHt}
            busy={busy}
            onFacture={(body) =>
              action(() => creerFacture(params.slug, params.projetId, body))
            }
            onEcheancier={(body) =>
              action(() => creerEcheancier(params.slug, params.projetId, body))
            }
          />
        </>
      )}

      {factureEditee && (
        <ModaleModifier
          facture={factureEditee}
          busy={busy}
          onClose={() => setEditId(null)}
          onEnregistrer={async (patch) => {
            const ok = await action(() =>
              majFacture(params.slug, params.projetId, factureEditee.id, patch),
            );
            if (ok) setEditId(null);
          }}
        />
      )}

      {facturePaiements && (
        <ModalePaiements
          facture={facturePaiements}
          busy={busy}
          onClose={() => setPaiementsId(null)}
          onAjouter={(body) =>
            action(() =>
              ajouterPaiement(params.slug, params.projetId, facturePaiements.id, body),
            )
          }
          onSupprimer={(paiementId) =>
            action(() =>
              supprimerPaiement(
                params.slug,
                params.projetId,
                facturePaiements.id,
                paiementId,
              ),
            )
          }
        />
      )}
    </AdminShell>
  );
}

// --- Création : facture unique ou échéancier 3 jalons -----------------------

function CreationFacture({
  mandat,
  echeancierPose,
  suggestionVenteHt,
  busy,
  onFacture,
  onEcheancier,
}: {
  mandat: boolean;
  echeancierPose: boolean;
  suggestionVenteHt: number | null;
  busy: boolean;
  onFacture: (body: {
    montantHt: number;
    tauxTva: number;
    echeanceLe: string | null;
    libelle: string;
  }) => Promise<boolean>;
  onEcheancier: (body: {
    tauxTva: number;
    montants: Record<JalonFacture, number>;
    echeances: Partial<Record<JalonFacture, string>>;
  }) => Promise<boolean>;
}) {
  const echeancierPossible = mandat && !echeancierPose;
  const [mode, setMode] = useState<'unique' | 'echeancier'>('unique');

  // Facture unique
  const [montant, setMontant] = useState('');
  const [taux, setTaux] = useState(String(TAUX_TVA_DEFAUT));
  const [echeance, setEcheance] = useState('');
  const [libelle, setLibelle] = useState('');

  // Échéancier
  const [ech, setEch] = useState<Record<JalonFacture, { montant: string; date: string }>>({
    signature: { montant: '', date: '' },
    avant_projet: { montant: '', date: '' },
    livraison: { montant: '', date: '' },
  });

  const modeActif = mode === 'echeancier' && echeancierPossible ? 'echeancier' : 'unique';

  async function soumettreUnique() {
    const m = Number(montant);
    if (!m) return;
    const ok = await onFacture({
      montantHt: m,
      tauxTva: Number(taux) || TAUX_TVA_DEFAUT,
      echeanceLe: echeance || null,
      libelle: libelle.trim(),
    });
    if (ok) {
      setMontant('');
      setEcheance('');
      setLibelle('');
    }
  }

  async function soumettreEcheancier() {
    const montants = {
      signature: Number(ech.signature.montant) || 0,
      avant_projet: Number(ech.avant_projet.montant) || 0,
      livraison: Number(ech.livraison.montant) || 0,
    };
    const echeances: Partial<Record<JalonFacture, string>> = {};
    (Object.keys(ech) as JalonFacture[]).forEach((k) => {
      if (ech[k].date) echeances[k] = ech[k].date;
    });
    const ok = await onEcheancier({
      tauxTva: Number(taux) || TAUX_TVA_DEFAUT,
      montants,
      echeances,
    });
    if (ok) {
      setEch({
        signature: { montant: '', date: '' },
        avant_projet: { montant: '', date: '' },
        livraison: { montant: '', date: '' },
      });
    }
  }

  return (
    <section className="panel">
      <div className="factu-creer-tete">
        <h3 className="panel-title" style={{ margin: 0 }}>
          Nouvelle facture
        </h3>
        {echeancierPossible && (
          <div className="vue-toggle" role="tablist">
            <button
              type="button"
              className={modeActif === 'unique' ? 'is-active' : ''}
              onClick={() => setMode('unique')}
            >
              Facture unique
            </button>
            <button
              type="button"
              className={modeActif === 'echeancier' ? 'is-active' : ''}
              onClick={() => setMode('echeancier')}
            >
              Échéancier (3 jalons)
            </button>
          </div>
        )}
      </div>

      {modeActif === 'unique' ? (
        <>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Montant HT (FCFA)</span>
              <input
                type="number"
                min="0"
                className="field-input"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
              {suggestionVenteHt != null && (
                <button
                  type="button"
                  className="lien-inline"
                  onClick={() => setMontant(String(suggestionVenteHt))}
                >
                  Reprendre le prix de vente du pré-bilan (
                  {formatMontantCompact(suggestionVenteHt)})
                </button>
              )}
            </label>
            <label className="field">
              <span className="field-label">TVA (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="field-input"
                value={taux}
                onChange={(e) => setTaux(e.target.value)}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Échéance</span>
              <input
                type="date"
                className="field-input"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Libellé</span>
              <input
                className="field-input"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="ex : Honoraires de conception — phase APS"
              />
            </label>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !Number(montant)}
              onClick={soumettreUnique}
            >
              <Plus size={15} strokeWidth={2} aria-hidden /> Créer le brouillon
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="field" style={{ maxWidth: 200 }}>
            <span className="field-label">TVA (%) — appliquée aux 3 jalons</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="field-input"
              value={taux}
              onChange={(e) => setTaux(e.target.value)}
            />
          </label>
          <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Jalon</th>
                  <th>Montant HT (FCFA)</th>
                  <th>Échéance</th>
                </tr>
              </thead>
              <tbody>
                {JALONS_FACTURE.map((j) => (
                  <tr key={j.cle}>
                    <td data-label="Jalon">{j.libelle}</td>
                    <td data-label="Montant HT (FCFA)">
                      <input
                        type="number"
                        min="0"
                        className="field-input"
                        value={ech[j.cle].montant}
                        onChange={(e) =>
                          setEch((s) => ({
                            ...s,
                            [j.cle]: { ...s[j.cle], montant: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td data-label="Échéance">
                      <input
                        type="date"
                        className="field-input"
                        value={ech[j.cle].date}
                        onChange={(e) =>
                          setEch((s) => ({
                            ...s,
                            [j.cle]: { ...s[j.cle], date: e.target.value },
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-aide">
            Les 3 factures sont créées en brouillon. Vous les émettez ensuite une par
            une, au fur et à mesure que le projet atteint chaque jalon.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={
                busy ||
                !Number(ech.signature.montant) ||
                !Number(ech.avant_projet.montant) ||
                !Number(ech.livraison.montant)
              }
              onClick={soumettreEcheancier}
            >
              <Plus size={15} strokeWidth={2} aria-hidden /> Créer l’échéancier
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// --- Modale : modifier un brouillon ----------------------------------------

function ModaleModifier({
  facture,
  busy,
  onClose,
  onEnregistrer,
}: {
  facture: Facture;
  busy: boolean;
  onClose: () => void;
  onEnregistrer: (patch: {
    montantHt: number;
    tauxTva: number;
    echeanceLe: string | null;
    libelle: string;
  }) => void;
}) {
  const [montant, setMontant] = useState(String(facture.montantHt || ''));
  const [taux, setTaux] = useState(String(facture.tauxTva));
  const [echeance, setEcheance] = useState(facture.echeanceLe ?? '');
  const [libelle, setLibelle] = useState(facture.libelle);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Modifier le brouillon</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <div className="field-row">
            <label className="field">
              <span className="field-label">Montant HT (FCFA)</span>
              <input
                type="number"
                min="0"
                className="field-input"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">TVA (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="field-input"
                value={taux}
                onChange={(e) => setTaux(e.target.value)}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Échéance</span>
              <input
                type="date"
                className="field-input"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Libellé</span>
              <input
                className="field-input"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !Number(montant)}
              onClick={() =>
                onEnregistrer({
                  montantHt: Number(montant),
                  tauxTva: Number(taux) || TAUX_TVA_DEFAUT,
                  echeanceLe: echeance || null,
                  libelle: libelle.trim(),
                })
              }
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Modale : paiements d'une facture émise -------------------------------

function ModalePaiements({
  facture,
  busy,
  onClose,
  onAjouter,
  onSupprimer,
}: {
  facture: Facture;
  busy: boolean;
  onClose: () => void;
  onAjouter: (body: {
    date: string;
    montant: number;
    mode?: ModePaiement;
    reference?: string;
  }) => Promise<boolean>;
  onSupprimer: (paiementId: string) => void;
}) {
  const [date, setDate] = useState(AUJOURD_HUI());
  const [montant, setMontant] = useState(
    facture.resteAPayer > 0 ? String(facture.resteAPayer) : '',
  );
  const [mode, setMode] = useState<ModePaiement | ''>('');
  const [reference, setReference] = useState('');

  async function ajouter() {
    const m = Number(montant);
    if (!m || m <= 0) return;
    const ok = await onAjouter({
      date,
      montant: m,
      mode: mode || undefined,
      reference: reference.trim() || undefined,
    });
    if (ok) {
      setMontant('');
      setReference('');
      setMode('');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Paiements — {facture.reference}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="factu-pai-resume">
            TTC {formatMontant(facture.montantTtc)} · payé{' '}
            {formatMontant(facture.montantPaye)} · reste{' '}
            <strong>{formatMontant(facture.resteAPayer)}</strong>
          </p>

          {facture.paiements.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Mode</th>
                  <th>Référence</th>
                  <th aria-label="Supprimer" />
                </tr>
              </thead>
              <tbody>
                {facture.paiements.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Date">{p.date}</td>
                    <td data-label="Montant">{formatMontantCompact(p.montant)}</td>
                    <td data-label="Mode">{p.mode ? MODES_PAIEMENT[p.mode] : '—'}</td>
                    <td data-label="Référence">{p.reference || '—'}</td>
                    <td data-label="">
                      <button
                        type="button"
                        className="lien-inline"
                        aria-label="Supprimer le paiement"
                        disabled={busy}
                        onClick={() => onSupprimer(p.id)}
                      >
                        <Trash2 size={12} strokeWidth={2} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4 className="exec-sous-titre">Enregistrer un versement</h4>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Date</span>
              <input
                type="date"
                className="field-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Montant (FCFA)</span>
              <input
                type="number"
                min="1"
                className="field-input"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Mode</span>
              <select
                className="field-input"
                value={mode}
                onChange={(e) => setMode(e.target.value as ModePaiement | '')}
              >
                <option value="">—</option>
                {(Object.keys(MODES_PAIEMENT) as ModePaiement[]).map((m) => (
                  <option key={m} value={m}>
                    {MODES_PAIEMENT[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Référence</span>
              <input
                className="field-input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="n° de virement / chèque"
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose}>
              Fermer
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !Number(montant)}
              onClick={ajouter}
            >
              <Plus size={15} strokeWidth={2} aria-hidden /> Ajouter le versement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
