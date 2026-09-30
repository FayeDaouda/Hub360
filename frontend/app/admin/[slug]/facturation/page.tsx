'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  BellRing,
  CheckCircle2,
  Copy,
  Download,
  FileWarning,
  Package,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useSessionCourante, useSocieteCourante, useTitrePage } from '@/lib/layout-contexte';
import { getClients } from '@/lib/crm';
import {
  getBureauxARegler,
  getFacturesCentrale,
  getProjetsFacturation,
  relancerFacture,
} from '@/lib/facturation';
import { niveauSuffisant } from '@/lib/auth';
import {
  convertirDevis,
  envoyerDevis,
  getDevisListe,
  getProduitsServices,
  marquerReponseDevis,
  supprimerDevis,
} from '@/lib/devis';
import {
  STATUTS_DEVIS,
  STATUTS_FACTURE,
  type Client,
  type Devis,
  type FactureCentrale,
  type ProduitService,
  type BureauARegler,
  type ProjetRef,
  type StatutDevisEffectif,
  type StatutFactureEffectif,
} from '@/lib/types';
import { formatMontantCompact } from '@/lib/format';
import { KpiStrip } from '@/components/admin/kpi-strip';

// Même palette de dégradés que le tableau de bord, le CRM et les projets
// (demande boss, sept. 2026) — « Retards » garde le dégradé chaud qui
// portait auparavant `alerte`/`attenue` conditionnels ; le dégradé porte
// maintenant lui-même le signal, plus besoin de bascule selon `kpi.retards`.
const DEGRADE_KPI: Record<string, { a: string; b: string }> = {
  'devis-attente': { a: '#2e3192', b: '#1bffff' }, // Ocean Blue
  'factures-impayees': { a: '#764ba2', b: '#667eea' }, // Plum Plate
  'ca-facture': { a: '#11998e', b: '#38ef7d' }, // Quepal
  retards: { a: '#ff5f6d', b: '#ffc371' }, // Sweet Morning
};
import { NouveauDevisModal } from '@/components/admin/nouveau-devis-modal';
import { CatalogueProduitsModal } from '@/components/admin/catalogue-produits-modal';
import { ImpressionDocument } from '@/components/impression-document';
import type { DocumentFacturationProps } from '@/components/document-facturation';

type Props = { params: { slug: string } };

const PILL_DEVIS: Record<StatutDevisEffectif, string> = {
  brouillon: 'pill--neutre',
  envoye: 'pill--info',
  accepte: 'pill--succes',
  refuse: 'pill--risque',
  expire: 'pill--risque',
  transforme: 'pill--succes',
};

const PILL_FACTURE: Record<StatutFactureEffectif, string> = {
  brouillon: 'pill--neutre',
  emise: 'pill--info',
  partiellement_payee: 'pill--attention',
  payee: 'pill--succes',
  en_retard: 'pill--risque',
  annulee: 'pill--neutre',
};

function moisCourant(): string {
  return new Date().toISOString().slice(0, 7); // AAAA-MM
}

function formatDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function FacturationCentralePage({ params }: Props) {
  useTitrePage('Facturation');
  const societe = useSocieteCourante();
  const session = useSessionCourante();
  // Droits par la matrice (étape H5) — affichage seulement, le serveur
  // revérifie. Catalogue : gestion réservée à l'administration.
  const droits = {
    devisEcriture: niveauSuffisant(session, 'finances_devis', 'ecriture'),
    devisValidation: niveauSuffisant(session, 'finances_devis', 'validation'),
    facturesEcriture: niveauSuffisant(session, 'finances_factures', 'ecriture'),
    catalogue: session.role === 'societe_admin',
    // Bureaux d'études à régler : donnée de charges (CFO).
    charges: niveauSuffisant(session, 'finances_charges', 'lecture'),
  };
  const [bureaux, setBureaux] = useState<BureauARegler[]>([]);
  const searchParams = useSearchParams();
  const projetFiltre = searchParams.get('projetId') ?? undefined;

  const [clients, setClients] = useState<Client[]>([]);
  const [projets, setProjets] = useState<ProjetRef[]>([]);
  const [catalogue, setCatalogue] = useState<ProduitService[]>([]);
  const [devis, setDevis] = useState<Devis[] | null>(null);
  const [factures, setFactures] = useState<FactureCentrale[] | null>(null);
  // ?onglet=factures : arrivée depuis la notification « contrat signé » (les
  // factures brouillon de l'Onboard) — aussi quand la page est déjà ouverte.
  const ongletDemande = searchParams.get('onglet') === 'factures' ? 'factures' : null;
  const [onglet, setOnglet] = useState<'devis' | 'factures'>(ongletDemande ?? 'devis');
  useEffect(() => {
    if (ongletDemande) setOnglet(ongletDemande);
  }, [ongletDemande]);
  const [modalDevis, setModalDevis] = useState(false);
  const [modalCatalogue, setModalCatalogue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lienEnvoye, setLienEnvoye] = useState<{
    reference: string | null;
    lien: string;
    emailEnvoye: boolean;
  } | null>(null);
  const [documentAImprimer, setDocumentAImprimer] = useState<DocumentFacturationProps | null>(null);
  const [relanceMsg, setRelanceMsg] = useState<string | null>(null);

  useEffect(() => {
    getClients(params.slug).then(setClients);
    getProjetsFacturation(params.slug).then(setProjets);
    getProduitsServices(params.slug).then(setCatalogue);
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  function recharger() {
    getDevisListe(params.slug).then(setDevis);
    getFacturesCentrale(params.slug).then(setFactures);
    if (droits.charges) getBureauxARegler(params.slug).then(setBureaux).catch(() => setBureaux([]));
  }

  const devisFiltres = useMemo(
    () => (devis ?? []).filter((d) => !projetFiltre || d.projetId === projetFiltre),
    [devis, projetFiltre],
  );
  const facturesFiltrees = useMemo(
    () => (factures ?? []).filter((f) => !projetFiltre || f.projetId === projetFiltre),
    [factures, projetFiltre],
  );
  const projetFiltreNom = useMemo(
    () => projets.find((p) => p.id === projetFiltre)?.programme,
    [projets, projetFiltre],
  );

  const kpi = useMemo(() => {
    const d = devis ?? [];
    const f = factures ?? [];
    const mois = moisCourant();
    return {
      devisEnAttente: d.filter((x) => x.statutEffectif === 'envoye').length,
      avenantsEnRetard: d.filter((x) => x.alerteAvenant).length,
      facturesImpayees: f.filter(
        (x) => x.statutEffectif === 'emise' || x.statutEffectif === 'partiellement_payee',
      ).length,
      caFacturePeriode: f
        .filter((x) => x.statut === 'emise' && !x.estAvoir && (x.emiseLe ?? '').slice(0, 7) === mois)
        .reduce((s, x) => s + x.montantTtc, 0),
      retards: f.filter((x) => x.statutEffectif === 'en_retard').length,
    };
  }, [devis, factures]);

  function documentDepuisDevis(d: Devis): DocumentFacturationProps | null {
    if (!societe) return null;
    return {
      typeDocument: 'Devis',
      societe,
      reference: d.reference,
      statutLabel: STATUTS_DEVIS[d.statutEffectif],
      statutClasse: PILL_DEVIS[d.statutEffectif],
      dateEmission: d.dateEnvoi ? formatDate(d.dateEnvoi) : formatDate(d.creeLe),
      dateValidite: d.dateValidite ? formatDate(d.dateValidite) : null,
      clientNom: d.client.nom,
      objet: d.objet,
      lignes: d.lignes,
      montantHt: d.montantHt,
      montantTva: d.montantTva,
      montantTtc: d.montantTtc,
    };
  }

  function documentDepuisFacture(f: FactureCentrale): DocumentFacturationProps | null {
    if (!societe) return null;
    return {
      typeDocument: 'Facture',
      societe,
      reference: f.reference,
      statutLabel: f.estAvoir ? 'Avoir' : STATUTS_FACTURE[f.statutEffectif],
      statutClasse: f.estAvoir ? 'pill--neutre' : PILL_FACTURE[f.statutEffectif],
      dateEmission: formatDate(f.emiseLe ?? f.creeLe),
      dateEcheance: f.echeanceLe ? formatDate(f.echeanceLe) : null,
      estAvoir: f.estAvoir,
      clientNom: f.client?.nom ?? '—',
      objet: f.libelle,
      // Facture à lignes (refacturation d'études) : une ligne par étude,
      // « lignes distinctes de la facture » (CGV art. 5) ; sinon montant unique.
      lignes:
        f.lignes.length > 0
          ? f.lignes.map((l) => ({
              id: l.id,
              designation: l.designation,
              detail:
                l.montantBase != null
                  ? `Facture du bureau ${formatMontantCompact(l.montantBase)} HT + 10 % de coordination`
                  : null,
              quantite: 1,
              prixUnitaire: l.montantHt,
              montantHt: l.montantHt,
            }))
          : [
              {
                id: f.id,
                designation: f.libelle || (f.estAvoir ? 'Avoir' : 'Prestation'),
                quantite: 1,
                prixUnitaire: f.montantHt,
                montantHt: f.montantHt,
              },
            ],
      montantHt: f.montantHt,
      montantTva: f.montantTva,
      montantTtc: f.montantTtc,
    };
  }

  async function action<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setErreur(null);
    try {
      const r = await fn();
      recharger();
      return r;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Une erreur est survenue.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function relancer(f: FactureCentrale) {
    setBusy(true);
    setErreur(null);
    setRelanceMsg(null);
    try {
      const { envoye } = await relancerFacture(params.slug, f.id);
      setRelanceMsg(
        envoye
          ? `Relance envoyée à ${f.client?.nom ?? 'ce client'}.`
          : `Email non envoyé (transport indisponible) — contactez ${f.client?.nom ?? 'ce client'} autrement.`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La relance a échoué.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-tete">
        {/* Pas de titre ici : le topbar (useTitrePage) affiche déjà "Facturation" —
            même convention que CRM/Projets/Équipe, qui ne le répètent pas. */}
        <div className="factu-actions-tete">
          {droits.catalogue && (
            <button type="button" className="btn-ghost" onClick={() => setModalCatalogue(true)}>
              <Package size={15} strokeWidth={1.75} aria-hidden /> Catalogue
            </button>
          )}
          {droits.devisEcriture && (
            <button type="button" className="btn-primary" onClick={() => setModalDevis(true)}>
              <Plus size={15} strokeWidth={2} aria-hidden /> Nouveau devis
            </button>
          )}
        </div>
      </div>
      {/* Bureaux d'études à régler (CGV art. 5 : après encaissement du
          client) — rappel pour la CFO, toute la société. */}
      {bureaux.length > 0 && (
        <div className="crm-banner" role="status">
          <span>
            <strong>
              {bureaux.length} bureau{bureaux.length > 1 ? 'x' : ''} d’études à régler
            </strong>{' '}
            (client encaissé) :{' '}
            {bureaux.map((b, i) => (
              <span key={b.blocId}>
                {i > 0 && ' · '}
                <Link
                  href={`/admin/${params.slug}/projets/${b.projet.id}/facturation`}
                  className="lien-inline"
                >
                  {b.bureau} — {b.libelle} ({b.projet.code}
                  {b.montantBureauHt != null && `, ${formatMontantCompact(b.montantBureauHt)} HT`})
                </Link>
              </span>
            ))}
          </span>
        </div>
      )}
      {projetFiltre && (
        <p className="projet-entete-meta">
          Filtré sur {projetFiltreNom ?? 'ce projet'} ·{' '}
          <Link href={`/admin/${params.slug}/facturation`} className="lien-inline">
            retirer le filtre
          </Link>
        </p>
      )}

      <KpiStrip
        tuiles={[
          {
            cle: 'devis-attente',
            label: 'Devis en attente de réponse',
            valeur: kpi.devisEnAttente,
            sousTexte: kpi.avenantsEnRetard
              ? `${kpi.avenantsEnRetard} avenant(s) non accepté(s) hors délai`
              : undefined,
            alerte: kpi.avenantsEnRetard > 0,
            icone: Send,
            degrade: DEGRADE_KPI['devis-attente'],
          },
          {
            cle: 'factures-impayees',
            label: 'Factures impayées',
            valeur: kpi.facturesImpayees,
            icone: FileWarning,
            degrade: DEGRADE_KPI['factures-impayees'],
          },
          {
            cle: 'ca-facture',
            label: 'CA facturé (ce mois)',
            valeur: formatMontantCompact(kpi.caFacturePeriode),
            degrade: DEGRADE_KPI['ca-facture'],
          },
          {
            cle: 'retards',
            label: 'Retards',
            valeur: kpi.retards,
            degrade: DEGRADE_KPI.retards,
          },
        ]}
      />

      {erreur && <p className="field-erreur">{erreur}</p>}
      {lienEnvoye && (
        <div className="crm-banner" role="status">
          <span>
            {lienEnvoye.emailEnvoye
              ? `Devis ${lienEnvoye.reference} envoyé par email au client.`
              : `Devis ${lienEnvoye.reference} créé — email non envoyé (client sans adresse, ou envoi indisponible).`}{' '}
            Lien de secours (ne sera plus réaffiché ensuite) :{' '}
            <code>{lienEnvoye.lien}</code>{' '}
            <button
              type="button"
              className="lien-inline"
              onClick={() => navigator.clipboard?.writeText(lienEnvoye.lien)}
            >
              <Copy size={12} strokeWidth={2} aria-hidden /> Copier
            </button>
          </span>
          <button type="button" aria-label="Fermer" onClick={() => setLienEnvoye(null)}>
            ×
          </button>
        </div>
      )}
      {relanceMsg && (
        <div className="crm-banner" role="status">
          <span>{relanceMsg}</span>
          <button type="button" aria-label="Fermer" onClick={() => setRelanceMsg(null)}>
            ×
          </button>
        </div>
      )}

      <div className="vue-toggle" role="tablist">
        <button
          type="button"
          className={onglet === 'devis' ? 'is-active' : ''}
          onClick={() => setOnglet('devis')}
        >
          Devis {devis ? `(${devisFiltres.length})` : ''}
        </button>
        <button
          type="button"
          className={onglet === 'factures' ? 'is-active' : ''}
          onClick={() => setOnglet('factures')}
        >
          Factures {factures ? `(${facturesFiltrees.length})` : ''}
        </button>
      </div>

      {onglet === 'devis' ? (
        !devis ? (
          <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
        ) : devisFiltres.length === 0 ? (
          <p className="images-vide">Aucun devis. Créez-en un ci-dessus.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Client</th>
                  <th>Projet</th>
                  <th>Objet</th>
                  <th>Statut</th>
                  <th>TTC</th>
                  <th>Validité</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {devisFiltres.map((d) => {
                  const projet = projets.find((p) => p.id === d.projetId);
                  const factureLiee = (factures ?? []).find((f) => f.devisOrigineId === d.id);
                  return (
                    <tr key={d.id}>
                      <td data-label="Réf.">
                        {d.reference ?? <span className="cell-sub">brouillon</span>}
                      </td>
                      <td data-label="Client">{d.client.nom}</td>
                      <td data-label="Projet">
                        {projet ? (
                          projet.programme
                        ) : d.dossierCrm ? (
                          <span className="cell-sub">Offre CRM · {d.dossierCrm.code}</span>
                        ) : (
                          <span className="cell-sub">libre</span>
                        )}
                      </td>
                      <td data-label="Objet">{d.objet || <span className="cell-sub">—</span>}</td>
                      <td data-label="Statut">
                        <span className={`pill ${PILL_DEVIS[d.statutEffectif]}`}>
                          {STATUTS_DEVIS[d.statutEffectif]}
                        </span>
                        {d.alerteAvenant && (
                          <span
                            className="pill pill--risque factu-alerte-avenant"
                            title={`Délai d’acceptation réglé : ${d.alerteAvenant.seuil} jours (Réglages)`}
                          >
                            Avenant non accepté · {d.alerteAvenant.jours} j
                          </span>
                        )}
                      </td>
                      <td data-label="TTC">{formatMontantCompact(d.montantTtc)}</td>
                      <td data-label="Validité">{d.dateValidite ?? '—'}</td>
                      <td data-label="" className="cell-actions">
                        <span className="factu-actions">
                          {/* Offre d'un dossier CRM : préparée et envoyée depuis la
                              fiche du dossier (validation DAF), jamais d'ici. */}
                          {d.statut === 'brouillon' && d.dossierCrm && (
                            <span className="cell-sub">via le CRM</span>
                          )}
                          {d.statut === 'brouillon' && !d.dossierCrm && droits.devisEcriture && (
                            <>
                              {droits.devisValidation && (
                                <button
                                  type="button"
                                  className="lien-inline"
                                  disabled={busy}
                                  onClick={async () => {
                                    const r = await action(() => envoyerDevis(params.slug, d.id));
                                    if (r) {
                                      setLienEnvoye({
                                        reference: r.reference,
                                        lien: r.lienPublic,
                                        emailEnvoye: r.emailEnvoye,
                                      });
                                    }
                                  }}
                                >
                                  <Send size={12} strokeWidth={2} aria-hidden /> Envoyer
                                </button>
                              )}
                              <button
                                type="button"
                                className="lien-inline btn-ghost--danger"
                                disabled={busy}
                                onClick={() => {
                                  if (window.confirm('Supprimer ce brouillon ?')) {
                                    void action(() => supprimerDevis(params.slug, d.id));
                                  }
                                }}
                              >
                                <Trash2 size={12} strokeWidth={2} aria-hidden />
                              </button>
                            </>
                          )}
                          {d.statut === 'envoye' && droits.devisEcriture && (
                            <>
                              <button
                                type="button"
                                className="lien-inline"
                                disabled={busy}
                                onClick={() =>
                                  action(() => marquerReponseDevis(params.slug, d.id, 'accepte'))
                                }
                              >
                                <CheckCircle2 size={12} strokeWidth={2} aria-hidden /> Accepté
                              </button>
                              <button
                                type="button"
                                className="lien-inline"
                                disabled={busy}
                                onClick={() =>
                                  action(() => marquerReponseDevis(params.slug, d.id, 'refuse'))
                                }
                              >
                                <XCircle size={12} strokeWidth={2} aria-hidden /> Refusé
                              </button>
                            </>
                          )}
                          {d.statut === 'accepte' && droits.facturesEcriture && (
                            <button
                              type="button"
                              className="lien-inline"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm('Convertir ce devis en facture ?')) {
                                  void action(() => convertirDevis(params.slug, d.id));
                                }
                              }}
                            >
                              <ReceiptText size={12} strokeWidth={2} aria-hidden /> Convertir en
                              facture
                            </button>
                          )}
                          {d.statut === 'transforme' && factureLiee && (
                            <span className="cell-sub">→ {factureLiee.reference}</span>
                          )}
                          <button
                            type="button"
                            className="lien-inline"
                            onClick={() => setDocumentAImprimer(documentDepuisDevis(d))}
                          >
                            <Download size={12} strokeWidth={2} aria-hidden /> Télécharger
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : !factures ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : facturesFiltrees.length === 0 ? (
        <p className="images-vide">Aucune facture émise.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Réf.</th>
                <th>Client</th>
                <th>Projet</th>
                <th>Statut</th>
                <th>TTC</th>
                <th>Payé</th>
                <th>Reste</th>
                <th>Échéance</th>
                <th aria-label="Voir" />
              </tr>
            </thead>
            <tbody>
              {facturesFiltrees.map((f) => (
                <tr key={f.id}>
                  <td data-label="Réf.">
                    {f.reference ?? <span className="cell-sub">brouillon</span>}
                  </td>
                  <td data-label="Client">{f.client?.nom ?? <span className="cell-sub">—</span>}</td>
                  <td data-label="Projet">
                    {f.projet ? f.projet.programme : <span className="cell-sub">libre</span>}
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
                    {f.estAvoir || f.statut === 'annulee' ? '—' : formatMontantCompact(f.resteAPayer)}
                  </td>
                  <td data-label="Échéance">{f.echeanceLe ?? '—'}</td>
                  <td data-label="" className="cell-actions">
                    <span className="factu-actions">
                      {f.projet && (
                        <Link
                          href={`/admin/${params.slug}/projets/${f.projet.id}/facturation`}
                          className="lien-inline"
                        >
                          Gérer
                        </Link>
                      )}
                      {f.statutEffectif === 'en_retard' && droits.facturesEcriture && (
                        <button
                          type="button"
                          className="lien-inline"
                          disabled={busy}
                          onClick={() => relancer(f)}
                        >
                          <BellRing size={12} strokeWidth={2} aria-hidden /> Relancer
                        </button>
                      )}
                      <button
                        type="button"
                        className="lien-inline"
                        onClick={() => setDocumentAImprimer(documentDepuisFacture(f))}
                      >
                        <Download size={12} strokeWidth={2} aria-hidden /> Télécharger
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalDevis && (
        <NouveauDevisModal
          slug={params.slug}
          clients={clients}
          projets={projets}
          catalogue={catalogue}
          projetPresel={projetFiltre}
          onClose={() => setModalDevis(false)}
          onCree={recharger}
        />
      )}
      {modalCatalogue && (
        <CatalogueProduitsModal
          slug={params.slug}
          produits={catalogue}
          onClose={() => setModalCatalogue(false)}
          onChange={setCatalogue}
        />
      )}

      <ImpressionDocument doc={documentAImprimer} onImprime={() => setDocumentAImprimer(null)} />
    </>
  );
}
