'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, ReceiptText, Send, Trash2, Undo2, Wallet } from 'lucide-react';
import {
  ajouterPaiement,
  creerAvoir,
  creerEcheancier,
  creerFacture,
  creerMensualite,
  emettreFacture,
  marquerBureauRegle,
  refacturerEtudes,
  getFacturation,
  majFacture,
  supprimerFacture,
  supprimerPaiement,
} from '@/lib/facturation';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { sectionAccessible } from '@/lib/acces-back-office';
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
  type StatutFactureEffectif,
  STATUTS_REGLEMENT_BUREAU,
  type StatutReglementBureau,
} from '@/lib/types';
import { formatMontant, formatMontantCompact } from '@/lib/format';

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
const PILL_REGLEMENT: Record<StatutReglementBureau, string> = {
  non_refacture: 'pill--neutre',
  en_attente_encaissement: 'pill--info',
  a_regler: 'pill--attention',
  regle: 'pill--succes',
};

// Selon la matrice (finances_factures) : écriture = préparer les brouillons
// (Dir. GC) ; validation = émettre, avoir, paiements (« la CFO seule
// enregistre les paiements »). Affichage seulement — le serveur revérifie.
type Droits = { ecriture: boolean; validation: boolean };

function actionsPossibles(f: Facture, d: Droits) {
  return {
    modifiable: f.statut === 'brouillon' && d.ecriture,
    emissible: f.statut === 'brouillon' && d.validation,
    encaissable: f.statut === 'emise' && !f.estAvoir && d.validation,
    annulable: f.statut === 'emise' && !f.estAvoir && d.validation,
  };
}

export default function FacturationPage({ params }: Props) {
  useTitrePage('Facturation');
  const session = useSessionCourante();
  const droits: Droits = {
    ecriture: niveauSuffisant(session, 'finances_factures', 'ecriture'),
    validation: niveauSuffisant(session, 'finances_factures', 'validation'),
  };
  // Régler un bureau d'études = une charge (finances_charges), pas une facture.
  const peutReglerBureau = niveauSuffisant(session, 'finances_charges', 'validation');
  const [etudesChoisies, setEtudesChoisies] = useState<Set<string>>(new Set());
  const [factu, setFactu] = useState<Facturation | null>(null);
  // En-tête : fourni par la réponse Facturation elle-même (pas d'appel aux
  // routes Projets, fermées aux rôles de direction).
  const projet = factu?.projet;
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [paiementsId, setPaiementsId] = useState<string | null>(null);

  useEffect(() => {
    getFacturation(params.slug, params.projetId).then(setFactu);
  }, [params.slug, params.projetId]);

  const factureEditee = useMemo(
    () => factu?.factures.find((f) => f.id === editId) ?? null,
    [factu, editId],
  );
  const facturePaiements = useMemo(
    () => factu?.factures.find((f) => f.id === paiementsId) ?? null,
    [factu, paiementsId],
  );

  // Retour vers la fiche projet si le rôle voit la section Projets, sinon
  // vers la Facturation centrale (CFO, Dir. GC…).
  const retour = sectionAccessible(session, 'projets')
    ? `/admin/${params.slug}/projets/${params.projetId}`
    : `/admin/${params.slug}/facturation`;
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
    <>
      <Link href={retour} className="lien-retour lien-retour--facturation">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!factu || !projet ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
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
              <h2>
                <span className="module-icone module-icone--facturation" aria-hidden>
                  <ReceiptText size={17} strokeWidth={1.75} />
                </span>
                Facturation client
              </h2>
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

          {/* Facturation mensuelle — SU / EX de l'offre acceptée, au mois, à la
              main (pas de scheduler : le rappel est dérivé à la lecture). */}
          {factu.mensualites.length > 0 && (
            <section className="panel">
              <h3 className="panel-title">Facturation mensuelle</h3>
              <ul className="mensualites-liste">
                {factu.mensualites.map((m) => (
                  <li key={m.ligneDevisId} className="mensualites-ligne">
                    <span className="mensualites-nom">
                      {m.libelle}
                      <span className="cell-sub">
                        {formatMontantCompact(m.prixMensuelHt)} HT / mois · {m.moisFactures}/
                        {m.moisPrevus} mois facturés
                      </span>
                    </span>
                    {m.aFacturerCeMois && (
                      <span className="pill pill--attention">À facturer ce mois</span>
                    )}
                    <button
                      type="button"
                      className={m.aFacturerCeMois ? 'btn-primary' : 'btn-ghost btn-ghost--sm'}
                      disabled={busy || !droits.ecriture || m.moisFactures >= m.moisPrevus}
                      onClick={() =>
                        action(() => creerMensualite(params.slug, params.projetId, m.ligneDevisId))
                      }
                    >
                      Facturer le mois
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Études techniques (étape H3, CGV art. 5) — une facture, une ligne
              par étude (bureau × 1,10) ; le bureau se règle après
              encaissement du client. Montants de bureau saisis dans Études. */}
          {factu.etudes.length > 0 && (
            <section className="panel">
              <h3 className="panel-title">Études techniques — refacturation</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th aria-label="Sélection" />
                      <th>Étude</th>
                      <th>Facture du bureau (HT)</th>
                      <th>Refacturé HT (+10 %)</th>
                      <th>Statut</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {factu.etudes.map((e) => (
                      <tr key={e.blocId}>
                        <td data-label="">
                          {e.refacturable && droits.ecriture && (
                            <input
                              type="checkbox"
                              aria-label={`Refacturer ${e.libelle}`}
                              checked={etudesChoisies.has(e.blocId)}
                              onChange={(ev) =>
                                setEtudesChoisies((s) => {
                                  const n = new Set(s);
                                  if (ev.target.checked) n.add(e.blocId);
                                  else n.delete(e.blocId);
                                  return n;
                                })
                              }
                            />
                          )}
                        </td>
                        <td data-label="Étude">
                          {e.libelle}
                          <span className="cell-sub">{e.bureau || 'Bureau non renseigné'}</span>
                        </td>
                        <td data-label="Facture du bureau (HT)">
                          {e.montantBureauHt != null ? formatMontantCompact(e.montantBureauHt) : '—'}
                        </td>
                        <td data-label="Refacturé HT (+10 %)">
                          {e.montantRefactureHt != null ? formatMontantCompact(e.montantRefactureHt) : '—'}
                          {e.facture?.reference && <span className="cell-sub">{e.facture.reference}</span>}
                        </td>
                        <td data-label="Statut">
                          <span className={`pill ${PILL_REGLEMENT[e.statutReglement]}`}>
                            {STATUTS_REGLEMENT_BUREAU[e.statutReglement]}
                          </span>
                          {e.statutReglement === 'non_refacture' && !e.refacturable && (
                            <span className="cell-sub">Bureau et montant à saisir dans Études</span>
                          )}
                        </td>
                        <td data-label="" className="cell-actions">
                          {e.statutReglement === 'a_regler' && peutReglerBureau && (
                            <button
                              type="button"
                              className="lien-inline"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Confirmer le règlement de ${e.bureau} (${e.libelle}) par Grey Concrete ?`,
                                  )
                                ) {
                                  void action(() =>
                                    marquerBureauRegle(params.slug, params.projetId, e.blocId),
                                  );
                                }
                              }}
                            >
                              Bureau réglé
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {droits.ecriture && factu.etudes.some((e) => e.refacturable) && (
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || etudesChoisies.size === 0}
                    onClick={async () => {
                      const ok = await action(() =>
                        refacturerEtudes(params.slug, params.projetId, [...etudesChoisies]),
                      );
                      if (ok) setEtudesChoisies(new Set());
                    }}
                  >
                    Refacturer la sélection ({etudesChoisies.size})
                  </button>
                </div>
              )}
            </section>
          )}

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
                      const a = actionsPossibles(f, droits);
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
                            <span className="cell-stack">
                              <span>{f.libelle || <span className="cell-sub">—</span>}</span>
                              {f.jalon && (
                                <span className="chip factu-chip">
                                  {JALONS_FACTURE.find((j) => j.cle === f.jalon)?.libelle}
                                </span>
                              )}
                            </span>
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

          {/* Création — préparer une facture = écriture (Dir. GC, CFO, admin). */}
          {droits.ecriture && (
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
          )}
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
    </>
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
    montantHt?: number; // absent pour une facture à lignes (somme des lignes)
    tauxTva: number;
    echeanceLe: string | null;
    libelle: string;
  }) => void;
}) {
  const [montant, setMontant] = useState(String(facture.montantHt || ''));
  // Facture à lignes (refacturation d'études) : montant = somme des lignes.
  const aLignes = facture.lignes.length > 0;
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
                disabled={aLignes}
                onChange={(e) => setMontant(e.target.value)}
              />
              {aLignes && (
                <span className="field-aide">Somme des lignes de la facture — non modifiable.</span>
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
                  ...(!aLignes && { montantHt: Number(montant) }),
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
