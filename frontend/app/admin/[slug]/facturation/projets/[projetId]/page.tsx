'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { DemandeAvoir } from '@/components/finances/demande-avoir';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, ReceiptText, Send, Trash2, Undo2, Wallet } from 'lucide-react';
import {
  ajouterPaiement,
  creerEcheancier,
  creerFacture,
  creerMensualite,
  emettreFacture,
  marquerBureauRegle,
  refacturerEtudes,
  getFacturation,
  majFacture,
  supprimerFacture,
  saisirFactureBureau,
  supprimerPaiement,
} from '@/lib/facturation';
import { lireFichier, FICHIERS_ACCEPTES } from '@/lib/fichiers';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { contresigneAffaire, useContresignature, useSeuilCeo, valideAffaire } from '@/lib/seuil-ceo';
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
import { formatAmount, formatCompactAmount } from '@/lib/format';
import { useConfirmer } from '@/components/confirmation';
import { daysSince, todayIso } from '@/lib/dates';
import { Modal } from '@/components/ui/dialog';

type Props = { params: Promise<{ slug: string; projetId: string }> };

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

function actionsPossibles(
  f: Facture,
  droits: Droits,
  valide: (montantTtc: number) => boolean,
  contresigne: (montantTtc: number) => boolean,
) {
  // CEO : validation des seules affaires au-delà du seuil de contresignature ;
  // émission exclusive au-delà du seuil (le CEO ou son délégataire, revue CEO).
  const d = { ...droits, validation: droits.validation && valide(f.affaireTtc) };
  return {
    modifiable: f.statut === 'brouillon' && d.ecriture,
    emissible: f.statut === 'brouillon' && droits.validation && contresigne(f.affaireTtc),
    encaissable: f.statut === 'emise' && !f.estAvoir && d.validation,
    annulable: f.statut === 'emise' && !f.estAvoir && d.validation,
  };
}

export default function FacturationPage(props: Props) {
  const params = use(props.params);
  const confirmer = useConfirmer();
  useTitrePage('Facturation');
  const session = useSessionCourante();
  const droits: Droits = {
    ecriture: niveauSuffisant(session, 'finances_factures', 'ecriture'),
    validation: niveauSuffisant(session, 'finances_factures', 'validation'),
  };
  // Régler un bureau d'études = une charge (finances_charges), pas une facture.
  const peutReglerBureau = niveauSuffisant(session, 'finances_charges', 'validation');
  const seuilCeo = useSeuilCeo(params.slug, session);
  const valide = (montantTtc: number) => valideAffaire(session, seuilCeo, montantTtc);
  const contresignature = useContresignature(params.slug, session);
  const contresigne = (montantTtc: number) => contresigneAffaire(session, contresignature, montantTtc);
  const [etudesChoisies, setEtudesChoisies] = useState<Set<string>>(new Set());
  // Facture du bureau d'études en cours de saisie (une étude de l'étape 05).
  const [saisieBureau, setSaisieBureau] = useState<{
    carteId: string;
    libelle: string;
    bureau: string;
    montant: string;
    fichier?: File;
  } | null>(null);
  const [factu, setFactu] = useState<Facturation | null>(null);
  // En-tête : fourni par la réponse Facturation elle-même (pas d'appel aux
  // routes Projets, fermées aux rôles de direction).
  const projet = factu?.projet;
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [paiementsId, setPaiementsId] = useState<string | null>(null);
  const [avoirPour, setAvoirPour] = useState<{ id: string; reference: string | null; montantTtc: number } | null>(null);

  useEffect(() => {
    getFacturation(params.slug, params.projetId).then(setFactu);
  }, [params.slug, params.projetId]);

  const factureEditee = useMemo(() => factu?.factures.find((f) => f.id === editId) ?? null, [factu, editId]);
  const facturePaiements = useMemo(
    () => factu?.factures.find((f) => f.id === paiementsId) ?? null,
    [factu, paiementsId],
  );

  // Page de Finances (phase 1) : le retour mène à Finances.
  const retour = `/admin/${params.slug}/facturation`;
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
        <ArrowLeft size={15} aria-hidden />
        <span>Finances</span>
      </Link>

      {!factu || !projet ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : (
        <>
          <header className="projet-entete">
            <div className="projet-entete-titre">
              <span className="projet-entete-sur">
                <span className="dossier-code">{projet.code}</span>
                <span className={`pill pill--nature-${projet.nature}`}>{NATURES_DOSSIER[projet.nature]}</span>
                <span className={`pill pill--cat-${projet.categorie}`}>{CATEGORIES[projet.categorie]}</span>
              </span>
              <h2>
                <span className="module-icone module-icone--facturation" aria-hidden>
                  <ReceiptText size={17} />
                </span>
                Facturation client
              </h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation} · {TYPES_BIEN[projet.type]}
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
                <span className="factu-resume-val">{formatCompactAmount(factu.resume.totalFactureTtc)}</span>
              </div>
              <div>
                <span className="factu-resume-label">Encaissé</span>
                <span className="factu-resume-val">{formatCompactAmount(factu.resume.totalEncaisse)}</span>
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
                  {formatCompactAmount(factu.resume.totalDu)}
                </span>
              </div>
              <div>
                <span className="factu-resume-label">En retard</span>
                <span className={`factu-resume-val ${factu.resume.nbEnRetard > 0 ? 'prebilan-delta--mauvais' : ''}`}>
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
                        {formatCompactAmount(m.prixMensuelHt)} HT / mois · {m.moisFactures}/{m.moisPrevus} mois facturés
                      </span>
                    </span>
                    {m.aFacturerCeMois && <span className="pill pill--attention">À facturer ce mois</span>}
                    <button
                      type="button"
                      className={m.aFacturerCeMois ? 'btn-primary' : 'btn-ghost btn-ghost--sm'}
                      disabled={busy || !droits.ecriture || m.moisFactures >= m.moisPrevus}
                      onClick={() => action(() => creerMensualite(params.slug, params.projetId, m.ligneDevisId))}
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
              encaissement du client. La facture du bureau se saisit ici, une
              ligne par étude de l'étape 05 du gabarit. */}
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
                      <tr key={e.carteId ?? e.blocId}>
                        <td data-label="">
                          {e.refacturable && e.blocId && droits.ecriture && (
                            <input
                              type="checkbox"
                              aria-label={`Refacturer ${e.libelle}`}
                              checked={etudesChoisies.has(e.blocId)}
                              onChange={(ev) =>
                                setEtudesChoisies((s) => {
                                  const n = new Set(s);
                                  if (ev.target.checked) n.add(e.blocId!);
                                  else n.delete(e.blocId!);
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
                          {e.montantBureauHt != null ? formatCompactAmount(e.montantBureauHt) : '—'}
                        </td>
                        <td data-label="Refacturé HT (+10 %)">
                          {e.montantRefactureHt != null ? formatCompactAmount(e.montantRefactureHt) : '—'}
                          {e.facture?.reference && <span className="cell-sub">{e.facture.reference}</span>}
                        </td>
                        <td data-label="Statut">
                          <span className={`pill ${PILL_REGLEMENT[e.statutReglement]}`}>
                            {STATUTS_REGLEMENT_BUREAU[e.statutReglement]}
                          </span>
                          {e.statutReglement === 'non_refacture' && !e.refacturable && (
                            <span className="cell-sub">Facture du bureau à saisir</span>
                          )}
                        </td>
                        <td data-label="" className="cell-actions">
                          {e.carteId && e.statutReglement === 'non_refacture' && droits.ecriture && (
                            <button
                              type="button"
                              className="lien-inline"
                              disabled={busy}
                              onClick={() =>
                                setSaisieBureau({
                                  carteId: e.carteId!,
                                  libelle: e.libelle,
                                  bureau: e.bureau,
                                  montant: e.montantBureauHt != null ? String(e.montantBureauHt) : '',
                                })
                              }
                            >
                              {e.montantBureauHt != null
                                ? 'Modifier la facture du bureau'
                                : 'Saisir la facture du bureau'}
                            </button>
                          )}
                          {e.statutReglement === 'a_regler' && peutReglerBureau && e.blocId && (
                            <button
                              type="button"
                              className="lien-inline"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await confirmer({
                                    titre: `Confirmer le règlement de ${e.bureau} ?`,
                                    message: `${e.libelle} : réglé par Grey Concrete.`,
                                    confirmer: 'Confirmer le règlement',
                                  })
                                ) {
                                  void action(() => marquerBureauRegle(params.slug, params.projetId, e.blocId!));
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
              {saisieBureau && (
                <form
                  className="factu-saisie-bureau"
                  onSubmit={async (ev) => {
                    ev.preventDefault();
                    let fichier: { nom: string; url: string } | undefined;
                    try {
                      fichier = saisieBureau.fichier ? await lireFichier(saisieBureau.fichier) : undefined;
                    } catch (err) {
                      setErreur(err instanceof Error ? err.message : 'Fichier illisible.');
                      return;
                    }
                    const ok = await action(() =>
                      saisirFactureBureau(params.slug, params.projetId, saisieBureau.carteId, {
                        bureau: saisieBureau.bureau.trim(),
                        montantHt: Number(saisieBureau.montant),
                        ...(fichier && { fichier: { nom: fichier.nom, url: fichier.url } }),
                      }),
                    );
                    if (ok) setSaisieBureau(null);
                  }}
                >
                  <h4 className="exec-sous-titre">Facture du bureau · {saisieBureau.libelle}</h4>
                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Bureau d’études</span>
                      <input
                        className="field-input"
                        value={saisieBureau.bureau}
                        maxLength={120}
                        onChange={(ev) => setSaisieBureau({ ...saisieBureau, bureau: ev.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Montant HT (FCFA)</span>
                      <input
                        type="number"
                        min="1"
                        className="field-input"
                        value={saisieBureau.montant}
                        onChange={(ev) => setSaisieBureau({ ...saisieBureau, montant: ev.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Facture (PDF, facultatif)</span>
                      <input
                        type="file"
                        accept={FICHIERS_ACCEPTES.contrat}
                        className="field-input"
                        onChange={(ev) => setSaisieBureau({ ...saisieBureau, fichier: ev.target.files?.[0] })}
                      />
                    </label>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setSaisieBureau(null)}>
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={busy || saisieBureau.bureau.trim().length < 2 || !(Number(saisieBureau.montant) > 0)}
                    >
                      Enregistrer
                    </button>
                  </div>
                </form>
              )}
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
                      const a = actionsPossibles(f, droits, valide, contresigne);
                      const cls = f.estAvoir
                        ? 'factu-l--avoir'
                        : f.statut === 'annulee'
                          ? 'factu-l--annulee'
                          : undefined;
                      return (
                        <tr key={f.id} className={cls}>
                          <td data-label="Réf.">{f.reference ?? <span className="cell-sub">brouillon</span>}</td>
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
                          <td data-label="TTC">{formatCompactAmount(f.montantTtc)}</td>
                          <td data-label="Payé">{f.montantPaye ? formatCompactAmount(f.montantPaye) : '—'}</td>
                          <td data-label="Reste">
                            {f.estAvoir || f.statut === 'annulee' ? '—' : formatCompactAmount(f.resteAPayer)}
                            {f.statutEffectif === 'en_retard' && (
                              <span className="cell-sub">{f.joursRetard} j de retard</span>
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
                                  <Pencil size={12} aria-hidden /> Modifier
                                </button>
                              )}
                              {a.emissible && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (
                                      await confirmer({
                                        titre: 'Émettre la facture ?',
                                        message:
                                          'Un numéro définitif lui est attribué et elle ne sera plus modifiable (correction par avoir).',
                                        confirmer: 'Émettre',
                                      })
                                    ) {
                                      void action(() => emettreFacture(params.slug, params.projetId, f.id));
                                    }
                                  }}
                                >
                                  <Send size={12} aria-hidden /> Émettre
                                </button>
                              )}
                              {a.encaissable && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={() => setPaiementsId(f.id)}
                                >
                                  <Wallet size={12} aria-hidden /> Paiements
                                  {f.paiements.length > 0 && ` (${f.paiements.length})`}
                                </button>
                              )}
                              {/* Avoir motivé (contrôle interne) ; au-delà du seuil, en attente du CEO. */}
                              {a.annulable && f.avoirEnAttente && (
                                <span className="pill pill--attention">
                                  Avoir en attente du CEO
                                  {f.avoirEnAttenteDepuis
                                    ? ` depuis ${Math.max(0, daysSince(f.avoirEnAttenteDepuis))} j`
                                    : ''}
                                </span>
                              )}
                              {a.annulable && !f.avoirEnAttente && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={() => setAvoirPour(f)}
                                >
                                  <Undo2 size={12} aria-hidden /> Avoir
                                </button>
                              )}
                              {a.modifiable && (
                                <button
                                  type="button"
                                  className="lien-inline btn-ghost--danger"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (
                                      await confirmer({
                                        titre: 'Supprimer ce brouillon ?',
                                        message: 'Le brouillon de facture sera supprimé.',
                                        confirmer: 'Supprimer',
                                        danger: true,
                                      })
                                    ) {
                                      void action(() => supprimerFacture(params.slug, params.projetId, f.id));
                                    }
                                  }}
                                >
                                  <Trash2 size={12} aria-hidden />
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
              busy={busy}
              onFacture={(body) => action(() => creerFacture(params.slug, params.projetId, body))}
              onEcheancier={(body) => action(() => creerEcheancier(params.slug, params.projetId, body))}
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
            const ok = await action(() => majFacture(params.slug, params.projetId, factureEditee.id, patch));
            if (ok) setEditId(null);
          }}
        />
      )}

      {avoirPour && (
        <DemandeAvoir
          slug={params.slug}
          projetId={params.projetId}
          facture={avoirPour}
          onFait={setFactu}
          onClose={() => setAvoirPour(null)}
        />
      )}
      {facturePaiements && (
        <ModalePaiements
          facture={facturePaiements}
          busy={busy}
          onClose={() => setPaiementsId(null)}
          onAjouter={(body) => action(() => ajouterPaiement(params.slug, params.projetId, facturePaiements.id, body))}
          onSupprimer={(paiementId, motif) =>
            action(() => supprimerPaiement(params.slug, params.projetId, facturePaiements.id, paiementId, motif))
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
  busy,
  onFacture,
  onEcheancier,
}: {
  mandat: boolean;
  echeancierPose: boolean;
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
            <button type="button" className="btn-primary" disabled={busy || !Number(montant)} onClick={soumettreUnique}>
              <Plus size={15} aria-hidden /> Créer le brouillon
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
            Les 3 factures sont créées en brouillon. Vous les émettez ensuite une par une, au fur et à mesure que le
            projet atteint chaque jalon.
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
              <Plus size={15} aria-hidden /> Créer l’échéancier
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
    <Modal onClose={onClose} closeOnEscape={false}>
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
            {aLignes && <span className="field-aide">Somme des lignes de la facture — non modifiable.</span>}
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
            <input type="date" className="field-input" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Libellé</span>
            <input className="field-input" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
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
    </Modal>
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
  onAjouter: (body: { date: string; montant: number; mode?: ModePaiement; reference?: string }) => Promise<boolean>;
  onSupprimer: (paiementId: string, motif: string) => Promise<boolean>;
}) {
  const [date, setDate] = useState(todayIso());
  // Suppression = correction tracée : le motif est demandé avant d'envoyer.
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [montant, setMontant] = useState(facture.resteAPayer > 0 ? String(facture.resteAPayer) : '');
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
    <Modal onClose={onClose} closeOnEscape={false}>
      <header className="modal-header">
        <h2>Paiements — {facture.reference}</h2>
        <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="modal-body">
        <p className="factu-pai-resume">
          TTC {formatAmount(facture.montantTtc)} · payé {formatAmount(facture.montantPaye)} · reste{' '}
          <strong>{formatAmount(facture.resteAPayer)}</strong>
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
                  <td data-label="Montant">{formatCompactAmount(p.montant)}</td>
                  <td data-label="Mode">{p.mode ? MODES_PAIEMENT[p.mode] : '—'}</td>
                  <td data-label="Référence">{p.reference || '—'}</td>
                  <td data-label="">
                    <button
                      type="button"
                      className="lien-inline"
                      aria-label="Supprimer le paiement"
                      disabled={busy}
                      onClick={() => {
                        setASupprimer(p.id);
                        setMotif('');
                      }}
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {aSupprimer && (
          <div className="field" style={{ display: 'grid', gap: '0.5rem' }}>
            <label className="field">
              <span className="field-label">Motif de la suppression</span>
              <input
                className="field-input"
                value={motif}
                maxLength={300}
                placeholder="ex. versement saisi deux fois"
                autoFocus
                onChange={(e) => setMotif(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setASupprimer(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || motif.trim().length < 3}
                onClick={async () => {
                  if (await onSupprimer(aSupprimer, motif.trim())) setASupprimer(null);
                }}
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        )}

        <h4 className="exec-sous-titre">Enregistrer un versement</h4>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
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
            <select className="field-input" value={mode} onChange={(e) => setMode(e.target.value as ModePaiement | '')}>
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
          <button type="button" className="btn-primary" disabled={busy || !Number(montant)} onClick={ajouter}>
            <Plus size={15} aria-hidden /> Ajouter le versement
          </button>
        </div>
      </div>
    </Modal>
  );
}
