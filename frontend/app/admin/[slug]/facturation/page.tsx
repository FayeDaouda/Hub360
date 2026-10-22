'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Banknote, Clock, FileSpreadsheet, FileText, Lock, Package, Plus, Settings2, TrendingUp } from 'lucide-react';
import { useSessionCourante, useSocieteCourante, useTitrePage } from '@/lib/layout-contexte';
import { getClients, getProjets } from '@/lib/crm';
import {
  getBureauxARegler,
  getFacturesCentrale,
  getParametresFacturation,
  getProjetsFacturation,
  lienFacturationProjet,
  PREFIXE_TEST,
  type ParametresFacturation,
} from '@/lib/facturation';
import { niveauSuffisant } from '@/lib/auth';
import { ROLE_CEO } from '@/lib/acces-back-office';
import { useSeuilCeo, valideAffaire } from '@/lib/seuil-ceo';
import { getDevisListe, getProduitsServices } from '@/lib/devis';
import { dansListeFactures, indicateursFinances, statutDevis, statutFacture } from '@/lib/finances';
import {
  TAUX_TVA_DEFAUT,
  TYPES_BIEN,
  type BureauARegler,
  type Client,
  type Devis,
  type FactureCentrale,
  type ProduitService,
  type Projet,
  type ProjetRef,
} from '@/lib/types';
import { formatMontant, formatMontantCompact } from '@/lib/format';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { DEGRADE_ETAT, etatEnRetard } from '@/lib/couleurs-etat';
import { NouveauDevisModal } from '@/components/admin/nouveau-devis-modal';
import { CatalogueProduitsModal } from '@/components/admin/catalogue-produits-modal';
import { ImpressionDocument } from '@/components/impression-document';
import { CGV_PAR_SOCIETE } from '@/lib/cgv';
import type { FactureDocumentProps } from '@/components/finances/facture-document';
import type { DocumentFacturationProps } from '@/components/document-facturation';
import { NouvelleFactureDirecte } from '@/components/finances/nouvelle-facture-directe';
import { FacturePanneau } from '@/components/finances/facture-panneau';
import { DevisPanneau } from '@/components/finances/devis-panneau';
import { OngletDevis } from '@/components/finances/onglet-devis';
import { OngletFactures } from '@/components/finances/onglet-factures';
import { TableauDeBordFinances } from '@/components/finances/tableau-de-bord';
import { GrilleTarifaire } from '@/components/finances/grille-tarifaire';
import { OffrePanneau } from '@/components/finances/offre-panneau';
import { OngletFeuilleTemps } from '@/components/finances/onglet-feuille-temps';
import { AValiderCfo } from '@/components/finances/a-valider-cfo';
import { Clotures } from '@/components/finances/clotures';
import { ExportComptable } from '@/components/finances/export-comptable';
import { ParametresFacturationFenetre } from '@/components/finances/parametres-facturation';
import { OngletTresorerie } from '@/components/finances/onglet-tresorerie';
import { OngletRentabilite } from '@/components/finances/onglet-rentabilite';

type Onglet = 'tableau' | 'tresorerie' | 'rentabilite' | 'devis' | 'factures' | 'temps';
type Props = { params: { slug: string } };

function formatDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Finances · Devis et factures (maquette du boss, oct. 2026) : direction
// seulement (matrice finances_*), les équipes ne voient aucun montant.
export default function FinancesPage({ params }: Props) {
  useTitrePage('Finances · Devis et factures');
  const societe = useSocieteCourante();
  const session = useSessionCourante();
  // Droits par la matrice — affichage seulement, le serveur revérifie.
  // Catalogue : gestion confiée au CEO (14/10/2026) ; le compte de secours la garde.
  const droits = {
    devisEcriture: niveauSuffisant(session, 'finances_devis', 'ecriture'),
    devisValidation: niveauSuffisant(session, 'finances_devis', 'validation'),
    facturesEcriture: niveauSuffisant(session, 'finances_factures', 'ecriture'),
    facturesValidation: niveauSuffisant(session, 'finances_factures', 'validation'),
    catalogue: session.role === ROLE_CEO || session.role === 'societe_admin',
    // Bureaux d'études à régler : donnée de charges (CFO).
    charges: niveauSuffisant(session, 'finances_charges', 'lecture'),
    // Tableau de bord et rentabilité : CFO, CEO, CTO, CIO (sous-titre de la maquette).
    tableauDeBord: niveauSuffisant(session, 'finances_marges', 'lecture'),
    // Rentabilité par projet (lot 7, décision 8) : CFO, CEO (montants), CTO (taux).
    // La matrice fait foi (revue CIO) : marges en lecture = Rentabilité (montants au CFO et au CEO, taux aux autres).
    rentabilite: niveauSuffisant(session, 'finances_marges', 'lecture') && session.role !== 'societe_admin',
  };
  const validateur = droits.devisValidation || droits.facturesValidation;
  // CEO : validation des seules affaires au-delà du seuil de contresignature.
  const seuilCeo = useSeuilCeo(params.slug, session);
  const searchParams = useSearchParams();
  const projetFiltre = searchParams.get('projetId') ?? undefined;

  const [clients, setClients] = useState<Client[]>([]);
  const [projets, setProjets] = useState<ProjetRef[]>([]);
  const [catalogue, setCatalogue] = useState<ProduitService[]>([]);
  const [devis, setDevis] = useState<Devis[] | null>(null);
  const [factures, setFactures] = useState<FactureCentrale[] | null>(null);
  const [bureaux, setBureaux] = useState<BureauARegler[]>([]);
  // ?onglet=factures : notification « contrat signé » (factures brouillon de
  // l'Onboard). ?nouvelle=<dossier> : « Émettre une facture directe » depuis la
  // fiche CRM. ?facture=<id> : notification « facture à valider » (CFO).
  // ?offre=<dossier> / ?devis=<id> : offre d'un lead à préparer / à reprendre,
  // depuis la fiche CRM (« Continuer vers le devis », « Modifier l'offre »).
  const nouvelleDemandee = searchParams.get('nouvelle');
  const factureDemandee = searchParams.get('facture');
  const offreDemandee = searchParams.get('offre');
  const devisDemande = searchParams.get('devis');
  const ongletDemande: Onglet | null =
    searchParams.get('onglet') === 'tresorerie' && droits.tableauDeBord
      ? 'tresorerie'
      : searchParams.get('onglet') === 'rentabilite' && droits.rentabilite
      ? 'rentabilite'
      : searchParams.get('onglet') === 'factures' || nouvelleDemandee || factureDemandee
      ? 'factures'
      : offreDemandee || devisDemande
        ? 'devis'
        : null;
  const [onglet, setOnglet] = useState<Onglet>(ongletDemande ?? (droits.tableauDeBord ? 'tableau' : 'devis'));
  useEffect(() => {
    if (ongletDemande) setOnglet(ongletDemande);
  }, [ongletDemande]);
  const [modalDevis, setModalDevis] = useState(false);
  const [modalCatalogue, setModalCatalogue] = useState(false);
  const [grille, setGrille] = useState(false);
  // Contrôle interne : fenêtre des clôtures mensuelles ; relecture du bloc
  // « À valider » après une clôture.
  const [clotures, setClotures] = useState(false);
  // Export comptable générique (lot 4) : journaux des ventes et des encaissements.
  const [exportComptable, setExportComptable] = useState(false);
  const [versionControle, setVersionControle] = useState(0);
  const [nouvelle, setNouvelle] = useState<{ dossier?: string } | null>(null);
  const [factureOuverte, setFactureOuverte] = useState<string | null>(null);
  const [devisOuvert, setDevisOuvert] = useState<string | null>(null);
  // Offre d'un lead en préparation (panneau « Nouvelle offre ») ; leads du CRM
  // chargés à la première ouverture.
  const [offre, setOffre] = useState<{ devisId?: string; dossier?: string } | null>(null);
  const [leads, setLeads] = useState<Projet[] | null>(null);
  useEffect(() => {
    if (nouvelleDemandee) setNouvelle({ dossier: nouvelleDemandee });
  }, [nouvelleDemandee]);
  useEffect(() => {
    if (offreDemandee) setOffre({ dossier: offreDemandee });
  }, [offreDemandee]);
  // ?devis=<id> : un brouillon d'offre de lead se retravaille dans l'éditeur ;
  // toute autre offre s'ouvre en document (ex. offre acceptée, depuis le CRM).
  const devisCharges = devis !== null;
  useEffect(() => {
    if (!devisDemande || !devisCharges) return;
    const d = (devis ?? []).find((x) => x.id === devisDemande);
    if (d?.statut === 'brouillon' && d.dossierCrm?.statut === 'nouveau_projet') setOffre({ devisId: d.id });
    else if (d) setDevisOuvert(d.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devisDemande, devisCharges]);
  useEffect(() => {
    if ((offre || onglet === 'temps') && !leads) getProjets(params.slug).then(setLeads).catch(() => setLeads([]));
  }, [offre, onglet, leads, params.slug]);
  useEffect(() => {
    if (factureDemandee) setFactureOuverte(factureDemandee);
  }, [factureDemandee]);
  const [documentAImprimer, setDocumentAImprimer] = useState<DocumentFacturationProps | null>(null);
  const [factureAImprimer, setFactureAImprimer] = useState<FactureDocumentProps | null>(null);
  // Paramètres de facturation (lot 6) : profil imprimé, préfixe TEST.
  const [paramsFacturation, setParamsFacturation] = useState<ParametresFacturation | null>(null);
  const [parametresOuverts, setParametresOuverts] = useState(false);
  useEffect(() => {
    getParametresFacturation(params.slug)
      .then(setParamsFacturation)
      .catch(() => setParamsFacturation(null));
  }, [params.slug]);

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

  const devisFiltres = useMemo(() => (devis ?? []).filter((d) => !projetFiltre || d.projetId === projetFiltre), [devis, projetFiltre]);
  const facturesFiltrees = useMemo(
    () => (factures ?? []).filter((f) => dansListeFactures(f) && (!projetFiltre || f.projetId === projetFiltre)),
    [factures, projetFiltre],
  );
  const nomsProjets = useMemo(() => new Map(projets.map((p) => [p.id, p.code])), [projets]);
  const projetFiltreNom = projets.find((p) => p.id === projetFiltre)?.programme;
  const kpi = useMemo(() => indicateursFinances(devisFiltres, facturesFiltrees), [devisFiltres, facturesFiltrees]);

  function documentDepuisDevis(d: Devis): DocumentFacturationProps | null {
    if (!societe) return null;
    const s = statutDevis(d);
    return {
      typeDocument: 'Devis',
      societe,
      reference: d.reference,
      statutLabel: s.libelle,
      statutClasse: `pill--${s.ton}`,
      dateEmission: formatDate(d.dateEnvoi ?? d.creeLe),
      dateValidite: d.dateValidite ? formatDate(d.dateValidite) : null,
      clientNom: d.client.nom,
      objet: d.objet,
      lignes: d.lignes,
      montantHt: d.montantHt,
      montantTva: d.montantTva,
      montantTtc: d.montantTtc,
    };
  }

  // Facture ou avoir au modèle imprimé (lot 6) : profil de facturation de la
  // société, numéro figé, somme en lettres ; « essai » sous le préfixe TEST.
  function documentDepuisFacture(f: FactureCentrale): FactureDocumentProps | null {
    if (!societe || !paramsFacturation) return null;
    const origine = f.factureOrigineId ? (factures ?? []).find((x) => x.id === f.factureOrigineId) : null;
    const prefixe = f.reference ? f.reference.split(/[-/.]/)[0] : paramsFacturation.format.prefixe;
    // Un avoir reprend ce que le client reconnaît sur la facture qu'il annule.
    const source = f.estAvoir && origine ? origine : f;
    const doc = source.pourDocument;
    // CGV complètes : sur la 1re facture du projet par défaut, ensuite citées.
    const reglageCgv = paramsFacturation.profil.cgvAnnexe ?? 'premiere_facture';
    const annexeCgv =
      reglageCgv === 'toujours' ? 'jointe' : reglageCgv === 'jamais' ? 'non_jointe' : f.pourDocument?.premiereDuProjet ? 'jointe' : 'deja_remise';
    const recap = f.estAvoir ? null : f.pourDocument?.echeancier;
    const offreRef = doc?.offre?.reference;
    return {
      estAvoir: f.estAvoir,
      reference: f.reference,
      factureOrigine: origine?.reference ?? null,
      dateEmission: f.emiseLe ? formatDate(f.emiseLe) : null,
      dateEcheance: f.echeanceLe ? formatDate(f.echeanceLe) : null,
      // Payable à réception : sans échéance, ou échéance le jour de l'émission.
      aReception: !f.echeanceLe || (!!f.emiseLe && f.echeanceLe.slice(0, 10) === f.emiseLe.slice(0, 10)),
      // Ce que le client reconnaît : « Villa — Yoff », le code en rappel.
      projet: {
        nom: doc?.typeBien ? [TYPES_BIEN[doc.typeBien], doc.localite].filter(Boolean).join(' — ') : null,
        code: f.dossierCrm?.code ?? f.projet?.code ?? null,
      },
      tranche: source.tranche ? [doc?.tranche, `${source.tranche.rang} sur ${source.tranche.total}`].filter(Boolean).join(' · ') : (doc?.tranche ?? null),
      offre: doc?.offre?.reference ? { reference: doc.offre.reference, accepteeLe: doc.offre.accepteeLe ? formatDate(doc.offre.accepteeLe) : null } : null,
      objet: f.estAvoir ? null : f.libelle || null, // l'avoir cite déjà la facture annulée
      client: { nom: f.client?.nom ?? '—', adresse: f.client?.adresse, ninea: f.client?.ninea, email: f.client?.email, telephone: f.client?.telephone },
      // Facture à lignes (refacturation d'études) : une ligne par étude,
      // « lignes distinctes de la facture » (CGV art. 5) ; sinon montant unique.
      lignes:
        f.lignes.length > 0
          ? f.lignes.map((l) => ({
              id: l.id,
              designation: l.designation,
              detail: l.montantBase != null ? `Facture du bureau ${formatMontantCompact(l.montantBase)} HT + 10 % de coordination` : null,
              quantite: 1,
              prixUnitaire: l.montantHt,
              montantHt: l.montantHt,
            }))
          : [{ id: f.id, designation: (f.estAvoir && origine?.libelle ? `Annulation · ${origine.libelle}` : f.libelle) || (f.estAvoir ? 'Avoir' : 'Prestation'), quantite: 1, prixUnitaire: f.montantHt, montantHt: f.montantHt }],
      montantHt: f.montantHt,
      tauxTva: f.tauxTva,
      montantTva: f.montantTva,
      montantTtc: f.montantTtc,
      emetteur: { ...paramsFacturation.profil, logoUrl: societe.logoUrl },
      penaliteRetardMensuelle: paramsFacturation.penaliteRetardMensuelle,
      essai: prefixe.toUpperCase() === PREFIXE_TEST,
      cgv: CGV_PAR_SOCIETE[params.slug] ?? null,
      annexeCgv,
      echeancier: recap
        ? {
            ...recap,
            libelle: `${recap.famille === 'CO' ? 'Honoraires totaux' : `Total ${recap.famille}`}${offreRef ? ` (offre ${offreRef})` : ''}`,
          }
        : null,
    };
  }


  const pluriel = (n: number, mot: string) => `${n} ${mot}(s)`;
  const devisPanneau = devisOuvert ? (devis ?? []).find((d) => d.id === devisOuvert) : undefined;
  const facturePanneau = factureOuverte ? (factures ?? []).find((f) => f.id === factureOuverte) : undefined;

  return (
    <>
      <div className="fin-entete">
        <p className="fin-sous-titre">
          Direction {societe?.nom ?? ''} : devis et factures. CFO, CEO, CTO, CIO : tout, y compris tableau de bord et
          rentabilité. Les équipes ne voient aucun montant.
        </p>
        <div className="factu-actions-tete">
          <button type="button" className="btn-ghost fin-bouton-grille" onClick={() => setGrille(true)}>
            Grille tarifaire
          </button>
          {validateur && (
            <button type="button" className="btn-ghost" onClick={() => setClotures(true)}>
              <Lock size={15} strokeWidth={1.75} aria-hidden /> Clôtures
            </button>
          )}
          {paramsFacturation && (
            <button type="button" className="btn-ghost" onClick={() => setParametresOuverts(true)}>
              <Settings2 size={15} strokeWidth={1.75} aria-hidden /> Paramètres de facturation
            </button>
          )}
          {validateur && (
            <button type="button" className="btn-ghost" disabled={!factures} onClick={() => setExportComptable(true)}>
              <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden /> Export comptable
            </button>
          )}
          {droits.catalogue && (
            <button type="button" className="btn-ghost" onClick={() => setModalCatalogue(true)}>
              <Package size={15} strokeWidth={1.75} aria-hidden /> Catalogue
            </button>
          )}
          {droits.facturesEcriture && (
            <button type="button" className="btn-ghost" onClick={() => setNouvelle({})}>
              <Plus size={15} strokeWidth={2} aria-hidden /> Nouvelle facture
            </button>
          )}
          {droits.devisEcriture && (
            // Filtré sur un projet : devis complémentaire (TS) ; sinon offre d'un lead.
            <button type="button" className="btn-primary" onClick={() => (projetFiltre ? setModalDevis(true) : setOffre({}))}>
              <Plus size={15} strokeWidth={2} aria-hidden /> Nouveau devis
            </button>
          )}
        </div>
      </div>

      {/* Qui valide (CFO ; CEO au-delà du seuil) : ce qui attend sa décision,
          avec l'encaissé du mois et le retard (revue CFO 20/10/2026). */}
      {validateur && (
        <AValiderCfo
          slug={params.slug}
          factures={factures}
          bureaux={bureaux}
          onOuvrirFacture={setFactureOuverte}
          onOuvrirClotures={() => setClotures(true)}
          version={versionControle}
        />
      )}
      {exportComptable && factures && <ExportComptable factures={factures} onClose={() => setExportComptable(false)} />}
      {parametresOuverts && paramsFacturation && (
        <ParametresFacturationFenetre
          slug={params.slug}
          parametres={paramsFacturation}
          onMaj={(p) => {
            setParamsFacturation(p);
            recharger();
          }}
          onClose={() => setParametresOuverts(false)}
        />
      )}
      {clotures && (
        <Clotures
          slug={params.slug}
          estCeo={session.role === ROLE_CEO}
          onClose={() => {
            setClotures(false);
            setVersionControle((v) => v + 1);
            recharger();
          }}
        />
      )}

      {/* Bureaux d'études à régler (CGV art. 5 : après encaissement du client) — dans « À valider » pour qui valide. */}
      {!validateur && bureaux.length > 0 && (
        <div className="crm-banner" role="status">
          <span>
            <strong>
              {bureaux.length} bureau{bureaux.length > 1 ? 'x' : ''} d’études à régler
            </strong>{' '}
            (client encaissé) :{' '}
            {bureaux.map((b, i) => (
              <span key={b.blocId}>
                {i > 0 && ' · '}
                <Link href={lienFacturationProjet(params.slug, b.projet.id)} className="lien-inline">
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

      <div className="fin-kpi">
        <KpiStrip
          tuiles={[
            {
              cle: 'offres',
              label: 'Offres en cours',
              valeur: formatMontant(kpi.offresEnCours.montant),
              sousTexte: `${pluriel(kpi.offresEnCours.nombre, 'offre')} en validation ou chez le client`,
              icone: FileText,
              degrade: DEGRADE_ETAT.marque,
            },
            {
              cle: 'transformation',
              label: 'Taux de transformation',
              valeur: kpi.transformation.pct == null ? '—' : `${kpi.transformation.pct} %`,
              sousTexte: `${pluriel(kpi.transformation.acceptes, 'acceptée')} · ${pluriel(kpi.transformation.refuses, 'refusée')}`,
              icone: TrendingUp,
              degrade: DEGRADE_ETAT.marque,
            },
            {
              cle: 'facture',
              label: 'Facturé TTC',
              valeur: formatMontant(kpi.facture.montant),
              sousTexte: `${pluriel(kpi.facture.emises, 'facture')} émise(s)${kpi.facture.aValider ? ` · ${kpi.facture.aValider} à valider CFO` : ''}`,
              icone: FileText,
              degrade: DEGRADE_ETAT.marque,
            },
            {
              cle: 'encaisse',
              label: 'Encaissé',
              valeur: formatMontant(kpi.encaisse.montant),
              sousTexte: kpi.encaisse.pct == null ? undefined : `${kpi.encaisse.pct} % du facturé`,
              icone: Banknote,
              degrade: DEGRADE_ETAT.marque,
            },
            {
              cle: 'reste',
              label: 'Reste à encaisser',
              valeur: formatMontant(kpi.resteAEncaisser.montant),
              sousTexte: `${pluriel(kpi.resteAEncaisser.enRetard, 'facture')} en retard`,
              icone: Clock,
              degrade: DEGRADE_ETAT[etatEnRetard(kpi.resteAEncaisser.enRetard)],
            },
          ]}
        />
      </div>

      <div className="fin-onglets">
        <div className="vue-toggle" role="tablist" aria-label="Finances">
          {droits.tableauDeBord && (
            <button
              type="button"
              role="tab"
              aria-selected={onglet === 'tableau'}
              className={onglet === 'tableau' ? 'is-active' : ''}
              onClick={() => setOnglet('tableau')}
            >
              Tableau de bord
            </button>
          )}
          {/* Balance âgée et encaissements attendus (revue CFO 20/10/2026). */}
          {droits.tableauDeBord && (
            <button
              type="button"
              role="tab"
              aria-selected={onglet === 'tresorerie'}
              className={onglet === 'tresorerie' ? 'is-active' : ''}
              onClick={() => setOnglet('tresorerie')}
            >
              Trésorerie
            </button>
          )}
          {droits.rentabilite && (
            <button
              type="button"
              role="tab"
              aria-selected={onglet === 'rentabilite'}
              className={onglet === 'rentabilite' ? 'is-active' : ''}
              onClick={() => setOnglet('rentabilite')}
            >
              Rentabilité
            </button>
          )}
          <button type="button" role="tab" aria-selected={onglet === 'devis'} className={onglet === 'devis' ? 'is-active' : ''} onClick={() => setOnglet('devis')}>
            Devis · {devis ? devisFiltres.length : '…'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={onglet === 'factures'}
            className={onglet === 'factures' ? 'is-active' : ''}
            onClick={() => setOnglet('factures')}
          >
            Factures · {factures ? facturesFiltrees.length : '…'}
          </button>
          {droits.tableauDeBord && (
            <button type="button" role="tab" aria-selected={onglet === 'temps'} className={onglet === 'temps' ? 'is-active' : ''} onClick={() => setOnglet('temps')}>
              Feuille de temps
            </button>
          )}
        </div>
        <span className="pill pill--neutre fin-devise">Montants en FCFA · TVA {TAUX_TVA_DEFAUT} %</span>
      </div>

      {onglet === 'tableau' ? (
        !devis || !factures ? (
          <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
        ) : (
          <TableauDeBordFinances devis={devisFiltres} factures={facturesFiltrees} catalogue={catalogue} />
        )
      ) : onglet === 'tresorerie' ? (
        !factures ? (
          <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
        ) : (
          <OngletTresorerie slug={params.slug} factures={factures} peutRelancer={droits.facturesEcriture} onOuvrirFacture={setFactureOuverte} />
        )
      ) : onglet === 'rentabilite' ? (
        <OngletRentabilite slug={params.slug} />
      ) : onglet === 'temps' ? (
        <OngletFeuilleTemps
          slug={params.slug}
          dossiers={leads}
          onVoirFactures={() => setOnglet('factures')}
          onOuvrirOffre={(id) => setDevisOuvert(id)}
        />
      ) : onglet === 'devis' ? (
        !devis ? (
          <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
        ) : (
          <OngletDevis
            devis={devisFiltres}
            projets={nomsProjets}
            // Brouillon d'offre d'un lead encore en « Nouveau projet » : il se retravaille.
            onOuvrir={(d) =>
              d.statut === 'brouillon' && d.dossierCrm?.statut === 'nouveau_projet' ? setOffre({ devisId: d.id }) : setDevisOuvert(d.id)
            }
          />
        )
      ) : !factures ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : (
        <OngletFactures
          factures={facturesFiltrees}
          onOuvrir={(f) => setFactureOuverte(f.id)}
          filtreInitial={searchParams.get('filtre') === 'en_retard' ? 'en_retard' : 'tout'}
        />
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
        <CatalogueProduitsModal slug={params.slug} produits={catalogue} onClose={() => setModalCatalogue(false)} onChange={setCatalogue} />
      )}

      {grille && societe && <GrilleTarifaire societe={societe} catalogue={catalogue} onClose={() => setGrille(false)} />}
      {nouvelle && (
        <NouvelleFactureDirecte
          slug={params.slug}
          dossierPresel={nouvelle.dossier}
          onClose={() => setNouvelle(null)}
          onCreee={(f) => {
            setNouvelle(null);
            setFactures((l) => [f, ...(l ?? []).filter((x) => x.id !== f.id)]);
            setFactureOuverte(f.id);
          }}
        />
      )}
      {offre && societe && (
        <OffrePanneau
          slug={params.slug}
          societe={societe}
          catalogue={catalogue}
          leads={leads}
          devisId={offre.devisId}
          dossierPresel={offre.dossier}
          onMaj={() => {
            recharger();
            setLeads(null);
          }}
          onClose={() => {
            setOffre(null);
            recharger();
          }}
        />
      )}
      {devisPanneau && (
        <DevisPanneau
          slug={params.slug}
          devis={devisPanneau}
          document={documentDepuisDevis(devisPanneau)}
          droits={{ ...droits, devisValidation: droits.devisValidation && valideAffaire(session, seuilCeo, devisPanneau.montantTtc) }}
          onMaj={recharger}
          onClose={() => setDevisOuvert(null)}
          onTelecharger={() => setDocumentAImprimer(documentDepuisDevis(devisPanneau))}
        />
      )}
      {facturePanneau && (
        <FacturePanneau
          slug={params.slug}
          facture={facturePanneau}
          document={documentDepuisFacture(facturePanneau)}
          statut={{ libelle: statutFacture(facturePanneau).libelle, classe: `pill--${statutFacture(facturePanneau).ton}` }}
          societeNom={societe?.nom ?? 'la société'}
          droits={{
            ecriture: droits.facturesEcriture,
            validation: droits.facturesValidation && valideAffaire(session, seuilCeo, facturePanneau.affaireTtc),
          }}
          onMaj={(maj) => setFactures((l) => (l ?? []).map((x) => (x.id === maj.id ? maj : x)))}
          onSupprimee={() => {
            setFactureOuverte(null);
            setFactures((l) => (l ?? []).filter((x) => x.id !== facturePanneau.id));
          }}
          onTelecharger={() => setFactureAImprimer(documentDepuisFacture(facturePanneau))}
          onClose={() => setFactureOuverte(null)}
        />
      )}

      <ImpressionDocument
        doc={documentAImprimer}
        facture={factureAImprimer}
        onImprime={() => {
          setDocumentAImprimer(null);
          setFactureAImprimer(null);
        }}
      />
    </>
  );
}
