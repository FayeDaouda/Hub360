'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState, use } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  FileStack,
  FileWarning,
  Inbox,
  Paperclip,
  Plus,
  Timer,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { KpiStrip } from '@/components/ui/kpi';
import { BoutonExport } from '@/components/bouton-export';
import { dateExport, exporterCsv } from '@/lib/export-csv';
import { etatATraiter, etatEnRetard, type EtatTuile } from '@/lib/couleurs-etat';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { ApiError } from '@/lib/client-api';
import { lireFichier, telechargerFichier, FICHIERS_ACCEPTES } from '@/lib/fichiers';
import {
  archiverDossier,
  deciderPaiement,
  creerDossier,
  deposerBulletin,
  getBulletin,
  retirerBulletin,
  finProche,
  getDossiers,
  getAlertesRh,
  getIntegrations,
  getMasseSalariale,
  getOptionsDossiers,
  getPieceDossier,
  getTachesOuvertes,
  joindrePieceDossier,
  LIBELLE_CONTRAT,
  majDossier,
  PIECES,
  type MajDossier,
  type TachesOuvertes,
} from '@/lib/rh';
import { getFeuillesTemps } from '@/lib/temps';
import { getDemandesRh } from '@/lib/demandes';
import { LIBELLE_PAIEMENT_SALAIRE } from '@/lib/mon-espace';
import type { DossierPersonnel, OptionsDossiers, TypePieceDossier } from '@/lib/types';
import { DemandesRh } from '@/components/absences/demandes-rh';
import { IntegrationRh } from '@/components/rh/integration-rh';
import { FeuillesTempsRh } from '@/components/rh/feuilles-temps-rh';
import { ATraiterRh, type DonneesRh } from '@/components/rh/a-traiter-rh';
import { getQuestionsOuvertes, getReportingsADeposer } from '@/lib/pilotage';
import { DepotBulletins } from '@/components/rh/depot-bulletins';
import { SalaireDossier } from '@/components/rh/salaire-dossier';
import { SalairesAValider } from '@/components/rh/salaires-a-valider';
import { useConfirmer } from '@/components/confirmation';
import { addMonths, formatDate, formatMonthYear, plural, todayIso } from '@hub/domain';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, FieldError } from '@/components/ui/field';

type Props = { params: Promise<{ slug: string }> };

// Mois de paie par défaut : le mois précédent (AAAA-MM).
function moisPrecedent(): string {
  return addMonths(todayIso().slice(0, 7), -1);
}

function messageErreur(e: unknown, repli: string) {
  return e instanceof ApiError ? e.message : repli;
}

type Onglet = 'personnel' | 'temps' | 'integration' | 'demandes';
type Compteurs = { feuilles: number; demandes: number; integrations: number; points: number };

// « Grey Concrete » → « Concrete » (tuile Effectif, maquette).
const nomCourt = (nom: string) => nom.trim().split(/\s+/).at(-1) ?? nom;

// RH · Groupe (maquette du boss) : six tuiles et quatre onglets — dossiers du
// personnel, feuilles de temps, intégration, demandes. Module « rh » de la
// matrice : RH en écriture, CFO et CEO en lecture. Le serveur revérifie tout.
export default function RhPage(props: Props) {
  const params = use(props.params);
  useTitrePage('Ressources humaines · Groupe');
  const session = useSessionCourante();
  const ecriture = session.role === 'societe_admin' || niveauSuffisant(session, 'rh', 'ecriture');

  const [dossiers, setDossiers] = useState<DossierPersonnel[] | null>(null);
  const [options, setOptions] = useState<OptionsDossiers | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [societe, setSociete] = useState<string>('tous');
  const [filtre, setFiltre] = useState<'incomplets' | 'fins' | null>(null);
  const [archives, setArchives] = useState(false);
  const [ouvert, setOuvert] = useState<DossierPersonnel | 'nouveau' | null>(null);
  const [depotBulletins, setDepotBulletins] = useState(false);
  // ?onglet= : lien direct (tuiles RH du Pilotage) ; ?dossier= : fiche
  // ouverte (recherche globale).
  const parametres = useSearchParams();
  const ongletDemande = parametres.get('onglet');
  const dossierDemande = parametres.get('dossier');
  const [onglet, setOnglet] = useState<Onglet>(
    ongletDemande === 'temps' || ongletDemande === 'integration' || ongletDemande === 'demandes'
      ? ongletDemande
      : 'personnel',
  );
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);
  // Données brutes des onglets : tuiles et « À traiter aujourd'hui ».
  const [brut, setBrut] = useState<DonneesRh | null>(null);
  // Masse salariale : total calculé par le serveur (aucun salaire individuel
  // ne part avec la liste), relu quand les dossiers changent.
  const [masse, setMasse] = useState<{ masse: number; renseignes: number; total: number } | null>(null);
  useEffect(() => {
    if (!dossiers) return;
    getMasseSalariale(params.slug)
      .then(setMasse)
      .catch(() => setMasse(null));
  }, [params.slug, dossiers]);

  // Tuiles des autres onglets : relues à chaque changement d'onglet, pour
  // refléter ce qui vient d'y être traité.
  const chargerCompteurs = useCallback(() => {
    Promise.all([
      getFeuillesTemps(params.slug),
      getDemandesRh(params.slug),
      getIntegrations(params.slug),
      getAlertesRh(params.slug),
      // Facultatif : sans accès au Pilotage, pas de ligne « reporting ».
      getReportingsADeposer(params.slug).catch(() => []),
      getQuestionsOuvertes(params.slug).catch(() => []),
    ])
      .then(([f, d, i, al, rp, qs]) => {
        setBrut({ feuilles: f, demandes: d, integrations: i, alertes: al, reportings: rp, questions: qs });
        setCompteurs({
          feuilles: f.periodes.reduce((n, p) => n + p.aControler, 0),
          demandes:
            d.absences.filter((a) => a.statut === 'accord_n1' && a.valideurFinal !== 'ceo').length +
            d.remboursements.filter((r) => r.statut === 'soumise' || r.statut === 'transmise').length +
            d.attestations.filter((a) => !a.delivreeLe).length,
          integrations: i.length,
          points: i.reduce((n, x) => n + x.aTraiter, 0),
        });
      })
      .catch(() => setCompteurs(null));
  }, [params.slug]);
  useEffect(chargerCompteurs, [chargerCompteurs, onglet]);

  useEffect(() => {
    Promise.all([getDossiers(params.slug), getOptionsDossiers(params.slug)])
      .then(([d, o]) => {
        setDossiers(d);
        setOptions(o);
      })
      .catch((e) => setErreur(messageErreur(e, 'Impossible de charger les dossiers.')));
  }, [params.slug]);

  useEffect(() => {
    const d = dossierDemande ? dossiers?.find((x) => x.id === dossierDemande) : undefined;
    if (!d) return;
    setOnglet('personnel');
    setArchives(!!d.archiveLe);
    setOuvert(d);
    // Une seule ouverture par lien : pas à chaque rechargement de la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierDemande, dossiers === null]);

  const actifs = useMemo(() => (dossiers ?? []).filter((d) => !d.archiveLe), [dossiers]);
  const visibles = useMemo(() => {
    let l = (dossiers ?? []).filter((d) => (archives ? !!d.archiveLe : !d.archiveLe));
    if (societe !== 'tous') l = l.filter((d) => d.societeId === societe);
    if (filtre === 'incomplets') l = l.filter((d) => d.completude.pourcentage < 100);
    if (filtre === 'fins') l = l.filter((d) => finProche(d));
    return l;
  }, [dossiers, archives, societe, filtre]);

  function remplacer(d: DossierPersonnel) {
    setDossiers((l) => {
      const liste = l ?? [];
      return liste.some((x) => x.id === d.id) ? liste.map((x) => (x.id === d.id ? d : x)) : [...liste, d];
    });
    setOuvert(d);
  }

  if (erreur) return <FieldError>{erreur}</FieldError>;
  if (!dossiers || !options) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }

  const parSociete = options.societes.map((s) => ({ ...s, n: actifs.filter((d) => d.societeId === s.id).length }));
  const incomplets = actifs.filter((d) => d.completude.pourcentage < 100).length;
  const fins = actifs.filter((d) => finProche(d)).length;

  const paiementsAValider = actifs.filter((d) => d.paiementDemandeMode).length;

  const ouvrir = (o: Onglet, f: 'incomplets' | 'fins' | null = null) => {
    setOnglet(o);
    setFiltre(f);
  };
  // Couleur = sens (lib/couleurs-etat.ts) : ambre à traiter, rouge en
  // retard / hors objectif, vert rien en attente, iris sans objectif.
  const tuiles: {
    cle: string;
    libelle: string;
    valeur: number | string | null;
    montant?: number;
    aide: string;
    actif: boolean;
    onClick: () => void;
    icone: LucideIcon;
    etat: EtatTuile;
  }[] = [
    {
      cle: 'effectif',
      libelle: 'Effectif du groupe',
      valeur: actifs.length,
      aide: parSociete.map((s) => `${nomCourt(s.nom)} ${s.n}`).join(' · '),
      actif: onglet === 'personnel' && !filtre,
      onClick: () => ouvrir('personnel'),
      icone: Users,
      etat: 'marque',
    },
    {
      // Seule source du salaire : le dossier RH (D19, 20/10/2026) — la
      // rémunération saisie dans l'administration du HUB a été retirée.
      cle: 'masse',
      libelle: 'Masse salariale brute / mois',
      valeur: masse ? (masse.renseignes ? null : '—') : null,
      montant: masse?.renseignes ? masse.masse : undefined,
      aide: masse ? `${masse.renseignes}/${masse.total} salaires renseignés` : 'calcul…',
      actif: false,
      onClick: () => ouvrir('personnel'),
      icone: Wallet,
      etat: 'marque',
    },
    {
      cle: 'incomplets',
      libelle: 'Dossiers incomplets',
      valeur: incomplets,
      aide: 'pièces ou champs manquants',
      actif: onglet === 'personnel' && filtre === 'incomplets',
      onClick: () => ouvrir('personnel', filtre === 'incomplets' ? null : 'incomplets'),
      icone: FileWarning,
      etat: etatATraiter(incomplets),
    },
    {
      cle: 'feuilles',
      libelle: 'Feuilles de temps à contrôler',
      valeur: compteurs?.feuilles ?? null,
      aide: 'mois clos · calcul automatique',
      actif: onglet === 'temps',
      onClick: () => ouvrir('temps'),
      icone: Timer,
      // Objectif du Pilotage : 100 % des mois clos contrôlés.
      etat: compteurs ? etatEnRetard(compteurs.feuilles) : 'marque',
    },
    {
      cle: 'demandes',
      libelle: 'Demandes à traiter',
      valeur: compteurs ? compteurs.demandes + paiementsAValider : null,
      aide: 'absences, remboursements, paie, attestations',
      actif: onglet === 'demandes',
      onClick: () => ouvrir('demandes'),
      icone: Inbox,
      etat: compteurs ? etatATraiter(compteurs.demandes + paiementsAValider) : 'marque',
    },
    {
      cle: 'integration',
      libelle: 'Intégrations en cours',
      valeur: compteurs?.integrations ?? null,
      aide: `${compteurs?.points ?? 0} point(s) à traiter · cap des 90 jours`,
      actif: onglet === 'integration',
      onClick: () => ouvrir('integration'),
      icone: UserPlus,
      // Point J+30 / 60 / 90 échu non fait = en retard.
      etat: compteurs ? etatEnRetard(compteurs.points) : 'marque',
    },
    {
      cle: 'fins',
      libelle: 'Fins de contrat < 6 mois',
      valeur: fins,
      aide: 'CDD et stages à anticiper',
      actif: onglet === 'personnel' && filtre === 'fins',
      onClick: () => ouvrir('personnel', filtre === 'fins' ? null : 'fins'),
      icone: CalendarClock,
      etat: etatATraiter(fins),
    },
  ];
  const compte = (n: number | undefined | null) => (n == null ? '' : ` · ${n}`);

  const entete = (
    <>
      <div className="rh-entete">
        <p className="rh-sous-titre">
          Dossiers du personnel des sociétés du groupe. Accès : RH, CFO et CEO (manuel §3.7, League Admin).
        </p>
        {ecriture && (
          <span className="rh-entete-actions">
            {/* Tous les bulletins du mois en une fois (revue RH 20/10/2026). */}
            <button type="button" className="btn-ghost" onClick={() => setDepotBulletins(true)}>
              <FileStack size={16} aria-hidden /> Bulletins du mois
            </button>
            <button type="button" className="btn-primary" onClick={() => setOuvert('nouveau')}>
              <Plus size={16} aria-hidden /> Nouveau salarié
            </button>
          </span>
        )}
      </div>
      {/* CFO (CEO pour le salaire du CFO) : changements de salaire à décider. */}
      <SalairesAValider slug={params.slug} />
      {/* Qui traite (RH, admin) : ce qui attend, par urgence, avant les tuiles. */}
      {ecriture && (
        <ATraiterRh
          slug={params.slug}
          donnees={brut}
          dossiers={actifs}
          onOuvrir={(o, opt) => {
            ouvrir(o, opt?.filtre ?? null);
            if (opt?.dossier) setOuvert(opt.dossier);
          }}
        />
      )}
      <div className="rh-kpi">
        <KpiStrip
          tiles={tuiles.map((t) => ({
            id: t.cle,
            label: t.libelle,
            value: t.valeur ?? '…',
            amount: t.montant,
            hint: t.aide,
            icon: t.icone,
            state: t.etat,
            action: { type: 'filter' as const, active: t.actif, onClick: t.onClick },
          }))}
        />
      </div>
      <div className="fin-onglets">
        <div className="vue-toggle rh-onglets" role="tablist" aria-label="Rubrique RH">
          {(
            [
              ['personnel', 'Personnel'],
              ['temps', `Feuilles de temps${compte(compteurs?.feuilles)}`],
              ['integration', `Intégration${compte(compteurs?.integrations)}`],
              ['demandes', `Demandes${compte(compteurs ? compteurs.demandes + paiementsAValider : null)}`],
            ] as const
          ).map(([o, libelle]) => (
            <button
              key={o}
              type="button"
              role="tab"
              aria-selected={onglet === o}
              className={onglet === o ? 'is-active' : ''}
              onClick={() => ouvrir(o)}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>
    </>
  );
  const depot = depotBulletins && (
    <DepotBulletins
      slug={params.slug}
      dossiers={dossiers}
      moisParDefaut={moisPrecedent()}
      // Bulletins déposés : la liste (et les fiches) relues.
      onFait={() =>
        getDossiers(params.slug)
          .then(setDossiers)
          .catch(() => undefined)
      }
      onClose={() => setDepotBulletins(false)}
    />
  );
  const fiche = ouvert && (
    <FicheDossier
      slug={params.slug}
      dossier={ouvert === 'nouveau' ? null : ouvert}
      options={options}
      ecriture={ecriture}
      onChange={remplacer}
      onClose={() => setOuvert(null)}
    />
  );
  if (onglet !== 'personnel') {
    return (
      <>
        {entete}
        {onglet === 'temps' && <FeuillesTempsRh slug={params.slug} ecriture={ecriture} />}
        {onglet === 'integration' && <IntegrationRh slug={params.slug} ecriture={ecriture} />}
        {onglet === 'demandes' && <DemandesRh slug={params.slug} ecriture={ecriture} />}
        {fiche}
        {depot}
      </>
    );
  }

  // Une seule société dans la liste : la colonne répéterait le même nom sur
  // chaque ligne — elle ne s'affiche que si la liste en mélange plusieurs.
  const colonneSociete = new Set(visibles.map((d) => d.societeId)).size > 1;

  return (
    <>
      {entete}

      <section className="panel glass-panel rh-liste liste-collee">
        <div className="rh-outils liste-collee-outils">
          <div className="vue-toggle" role="group" aria-label="Société">
            <button type="button" className={societe === 'tous' ? 'is-active' : ''} onClick={() => setSociete('tous')}>
              Tous · {actifs.length}
            </button>
            {parSociete.map((s) => (
              <button
                key={s.id}
                type="button"
                className={societe === s.id ? 'is-active' : ''}
                onClick={() => setSociete(s.id)}
              >
                {s.nom} · {s.n}
              </button>
            ))}
          </div>
          <label className="rh-archives">
            <input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} />
            Dossiers archivés
          </label>
          {/* Coordonnées professionnelles seulement : ni salaire ni coordonnées de paiement. */}
          <BoutonExport
            desactive={!visibles.length}
            onExporter={() =>
              exporterCsv(
                archives ? 'dossiers-personnel-archives' : 'dossiers-personnel',
                [
                  { titre: 'Matricule', valeur: (d) => d.matricule },
                  { titre: 'Prénom', valeur: (d) => d.prenom },
                  { titre: 'Nom', valeur: (d) => d.nom },
                  { titre: 'Poste', valeur: (d) => d.poste },
                  { titre: 'Société', valeur: (d) => d.societe.nom },
                  { titre: 'Équipe', valeur: (d) => d.cellule },
                  { titre: 'Contrat', valeur: (d) => LIBELLE_CONTRAT[d.typeContrat] },
                  { titre: 'Fin de contrat', valeur: (d) => (d.typeContrat !== 'cdi' ? dateExport(d.dateFin) : null) },
                  { titre: 'Entrée', valeur: (d) => dateExport(d.dateEntree) },
                  { titre: 'Téléphone', valeur: (d) => d.telephone },
                  { titre: 'E-mail pro', valeur: (d) => d.emailPro },
                  { titre: 'Dossier complet (%)', valeur: (d) => d.completude.pourcentage },
                  { titre: 'Archivé le', valeur: (d) => dateExport(d.archiveLe) },
                ],
                visibles,
              )
            }
          />
        </div>

        {visibles.length === 0 ? (
          <EmptyState>Aucun dossier.</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table rh-table">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Salarié</th>
                  {colonneSociete && <th>Société</th>}
                  <th>Équipe</th>
                  <th>Contrat</th>
                  <th>Dossier</th>
                  <th>Entrée</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((d) => (
                  <tr key={d.id}>
                    <td className="rh-matricule">{d.matricule}</td>
                    <td data-label="Salarié" className="rh-c-salarie">
                      <button type="button" className="rh-nom" onClick={() => setOuvert(d)}>
                        {`${d.prenom} ${d.nom}`.trim() || 'Sans nom'}
                      </button>
                      <span className="cell-sub">{d.poste || 'poste à renseigner'}</span>
                      {d.paiementDemandeMode && <Pill tone="attention">Moyen de paiement à valider</Pill>}
                    </td>
                    {colonneSociete && (
                      <td data-label="Société" className="rh-c-societe">
                        {d.societe.nom}
                      </td>
                    )}
                    <td data-label="Équipe" className="rh-c-equipe">
                      {d.cellule ?? <span className="cell-sub">à affecter par la direction</span>}
                    </td>
                    <td data-label="Contrat" className="rh-c-contrat">
                      {LIBELLE_CONTRAT[d.typeContrat]}
                      {d.typeContrat !== 'cdi' && d.dateFin && ` → ${formatDate(d.dateFin)}`}
                    </td>
                    <td data-label="Dossier" className="rh-c-dossier">
                      <span className="progress">
                        <span className="progress-track">
                          <span
                            className={`progress-fill progress-fill--${d.completude.pourcentage === 100 ? 'succes' : 'attention'}`}
                            style={{ width: `${d.completude.pourcentage}%` }}
                          />
                        </span>
                        {d.completude.pourcentage} %
                      </span>
                    </td>
                    <td data-label="Entrée" className="rh-c-entree">
                      {formatDate(d.dateEntree)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fiche}
      {depot}
    </>
  );
}

const CHAMPS_VIDES: MajDossier = {
  poste: '',
  typeContrat: 'cdi',
  dateEntree: todayIso(),
  dateFin: null,
  finEssai: null,
  visiteMedicale: null,
  expirationPiece: null,
  prenom: '',
  nom: '',
  dateNaissance: null,
  lieuNaissance: '',
  nationalite: 'Sénégalaise',
  numeroPiece: '',
  telephone: '',
  emailPro: '',
  contactUrgence: '',
  modePaiement: 'virement',
  coordonneesPaiement: '',
  numeroIpm: '',
  missionResultat: '',
  missionLivrables: '',
  missionKpi: '',
  missionSignalAlerte: '',
  societeId: '',
  collaborateurId: null,
  utilisateurId: null,
};

function versFormulaire(d: DossierPersonnel): MajDossier {
  const f: MajDossier = {};
  for (const cle of Object.keys(CHAMPS_VIDES) as (keyof MajDossier)[]) {
    (f as Record<string, unknown>)[cle] = d[cle as keyof DossierPersonnel] ?? null;
  }
  return f;
}

function FicheDossier({
  slug,
  dossier,
  options,
  ecriture,
  onChange,
  onClose,
}: {
  slug: string;
  dossier: DossierPersonnel | null;
  options: OptionsDossiers;
  ecriture: boolean;
  onChange: (d: DossierPersonnel) => void;
  onClose: () => void;
}) {
  const confirmer = useConfirmer();
  const [form, setForm] = useState<MajDossier>(dossier ? versFormulaire(dossier) : CHAMPS_VIDES);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [moisBulletin, setMoisBulletin] = useState(moisPrecedent);
  // Départ en cours : tâches de projet à confier avant l'archivage.
  const [depart, setDepart] = useState<TachesOuvertes | null>(null);
  const [confies, setConfies] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!dossier) return;
    setForm(versFormulaire(dossier));
  }, [dossier]);

  const maj =
    (cle: keyof MajDossier) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      const valeur = [
        'dateEntree',
        'dateFin',
        'finEssai',
        'visiteMedicale',
        'expirationPiece',
        'dateNaissance',
        'collaborateurId',
        'utilisateurId',
      ].includes(cle)
        ? v || null
        : v;
      // Une fiche d'équipe porte son propre compte : relier une fiche retire le compte direct.
      setForm((f) => ({
        ...f,
        [cle]: valeur,
        ...(cle === 'collaborateurId' && valeur ? { utilisateurId: null } : {}),
      }));
      setEnregistre(false);
    };

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const d = dossier ? await majDossier(slug, dossier.id, form) : await creerDossier(slug, form);
      onChange(d);
      setEnregistre(true);
    } catch (e) {
      setErreur(messageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnvoi(false);
    }
  }

  async function joindre(type: TypePieceDossier, fichier?: File) {
    if (!dossier || !fichier) return;
    setErreur(null);
    try {
      const lu = await lireFichier(fichier);
      onChange(await joindrePieceDossier(slug, dossier.id, type, lu.nom, lu.url));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Pièce non jointe.');
    }
  }

  async function ouvrirPiece(type: TypePieceDossier) {
    if (!dossier) return;
    telechargerFichier(await getPieceDossier(slug, dossier.id, type));
  }

  // Bulletins de paie (lot 5b) : un dépôt sur un mois déjà servi le remplace.
  async function deposer(fichier?: File) {
    if (!dossier || !fichier) return;
    setErreur(null);
    try {
      const lu = await lireFichier(fichier);
      onChange(await deposerBulletin(slug, dossier.id, moisBulletin, lu.nom, lu.url));
    } catch (e) {
      setErreur(messageErreur(e, 'Bulletin non déposé.'));
    }
  }

  async function retirer(mois: string) {
    if (!dossier) return;
    if (
      !(await confirmer({
        titre: `Retirer le bulletin de ${formatMonthYear(mois)} ?`,
        message: 'Le salarié ne le verra plus.',
        confirmer: 'Retirer',
        danger: true,
      }))
    )
      return;
    setErreur(null);
    try {
      onChange(await retirerBulletin(slug, dossier.id, mois));
    } catch (e) {
      setErreur(messageErreur(e, 'Retrait impossible.'));
    }
  }

  async function decider(valide: boolean) {
    if (!dossier) return;
    setErreur(null);
    try {
      onChange(await deciderPaiement(slug, dossier.id, valide));
    } catch (e) {
      setErreur(messageErreur(e, 'Décision non enregistrée.'));
    }
  }

  async function archiver() {
    if (!dossier) return;
    setErreur(null);
    try {
      if (!dossier.archiveLe) {
        const ouvertes = await getTachesOuvertes(slug, dossier.id);
        if (ouvertes.taches.length) {
          setConfies({});
          setDepart(ouvertes);
          return;
        }
        if (
          !(await confirmer({
            titre: 'Archiver ce dossier (départ) ?',
            message: 'Le compte HUB du salarié sera désactivé immédiatement.',
            confirmer: 'Archiver',
            danger: true,
          }))
        )
          return;
      }
      onChange(await archiverDossier(slug, dossier.id, !dossier.archiveLe));
    } catch (e) {
      setErreur(messageErreur(e, 'Action impossible.'));
    }
  }

  async function confirmerDepart() {
    if (!dossier || !depart) return;
    if (
      !(await confirmer({
        titre: 'Confirmer le départ ?',
        message: 'Les tâches sont confiées et le compte HUB du salarié est désactivé immédiatement.',
        confirmer: 'Confirmer le départ',
        danger: true,
      }))
    )
      return;
    setErreur(null);
    try {
      const reaffectations = depart.taches.map((t) => ({ tacheId: t.id, collaborateurId: confies[t.id] }));
      onChange(await archiverDossier(slug, dossier.id, true, reaffectations));
      setDepart(null);
    } catch (e) {
      setErreur(messageErreur(e, 'Départ non enregistré.'));
    }
  }

  const collabs = options.collaborateursSansDossier.filter((c) => c.societeId === form.societeId);
  const titre = dossier ? `${dossier.prenom} ${dossier.nom}`.trim() || 'Sans nom' : 'Nouveau salarié';
  const societeNom = options.societes.find((s) => s.id === form.societeId)?.nom;
  const sousTitre = `${form.poste?.trim() || 'poste à renseigner'} · ${societeNom ?? 'société à renseigner'}`;
  const champ = (cle: keyof MajDossier, libelle: string, props: Record<string, unknown> = {}) => (
    <Field label={libelle}>
      <input className="field-input" value={(form[cle] as string | null) ?? ''} onChange={maj(cle)} {...props} />
    </Field>
  );
  const zone = (cle: keyof MajDossier, libelle: string) => (
    <Field label={libelle}>
      <textarea className="field-input" rows={2} value={(form[cle] as string) ?? ''} onChange={maj(cle)} />
    </Field>
  );

  return (
    <Modal onClose={onClose} closeOnEscape={false} backdropClassName="rh-tiroir" className="rh-fiche" label={titre}>
      <header className="modal-header">
        <div>
          <span className="po-kicker">Dossier du personnel{dossier ? ` · ${dossier.matricule}` : ''}</span>
          <h2>{titre}</h2>
          <span className="cell-sub">{sousTitre}</span>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="modal-body">
        {dossier && (
          <div className="rh-completude">
            <span>Complétude du dossier</span>
            <span className="progress">
              <span className="progress-track rh-completude-piste">
                <span
                  className={`progress-fill progress-fill--${dossier.completude.pourcentage === 100 ? 'succes' : 'attention'}`}
                  style={{ width: `${dossier.completude.pourcentage}%` }}
                />
              </span>
              {dossier.completude.pourcentage} %
            </span>
            {dossier.archiveLe && <Pill tone="neutre">Archivé</Pill>}
          </div>
        )}
        <p className="rh-note">
          Nouvel arrivant : la carte de mission doit être validée (budget CFO, décision d’embauche) avant l’affectation
          à une cellule (manuel §3.3).
        </p>

        <fieldset disabled={!ecriture} className="fieldset-nu">
          <h3 className="rh-section">Affectation et contrat</h3>
          <div className="rh-grille">
            <Field label="Société">
              <select className="field-input" value={form.societeId ?? ''} onChange={maj('societeId')}>
                <option value="">À choisir</option>
                {options.societes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </Field>
            {champ('poste', 'Poste', { placeholder: 'ex. Architecte' })}
            <Field label="Type de contrat">
              <select className="field-input" value={form.typeContrat} onChange={maj('typeContrat')}>
                {Object.entries(LIBELLE_CONTRAT).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            {champ('dateEntree', 'Date d’entrée', { type: 'date' })}
            {form.typeContrat !== 'cdi' && champ('dateFin', 'Fin (CDD, stage)', { type: 'date' })}
            {champ('finEssai', 'Fin de la période d’essai', { type: 'date' })}
            <Field label="Fiche d’équipe liée">
              <select className="field-input" value={form.collaborateurId ?? ''} onChange={maj('collaborateurId')}>
                <option value="">Aucune (à affecter par la direction)</option>
                {dossier?.collaborateurId && (
                  <option value={dossier.collaborateurId}>{dossier.cellule ?? 'Fiche actuelle'}</option>
                )}
                {collabs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle}
                    {c.cellule ? ` · ${c.cellule}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Compte HUB (Mon espace)">
              {form.collaborateurId ? (
                <input
                  className="field-input"
                  disabled
                  value={
                    dossier?.compte?.viaFiche && dossier.collaborateurId === form.collaborateurId
                      ? `${dossier.compte.libelle} · via la fiche d’équipe`
                      : 'Celui de la fiche d’équipe'
                  }
                />
              ) : (
                <select className="field-input" value={form.utilisateurId ?? ''} onChange={maj('utilisateurId')}>
                  <option value="">Aucun</option>
                  {dossier?.compte && !dossier.compte.viaFiche && (
                    <option value={dossier.compte.id}>
                      {dossier.compte.libelle} · {dossier.compte.email}
                    </option>
                  )}
                  {options.comptesSansDossier.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle} · {c.email}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <h3 className="rh-section">Salaire</h3>
          {dossier ? (
            <SalaireDossier slug={slug} dossier={dossier} ecriture={ecriture} />
          ) : (
            <p className="rh-note">
              Le salaire d’entrée se propose une fois le dossier créé ; il entre en vigueur après validation du CFO.
            </p>
          )}

          <h3 className="rh-section">Identité</h3>
          <div className="rh-grille">
            {champ('prenom', 'Prénom(s)')}
            {champ('nom', 'Nom')}
            {champ('dateNaissance', 'Date de naissance', { type: 'date' })}
            {champ('lieuNaissance', 'Lieu de naissance')}
            {champ('nationalite', 'Nationalité')}
            {champ('numeroPiece', 'N° CNI ou passeport')}
            {champ('expirationPiece', 'Expiration de la pièce', { type: 'date' })}
          </div>

          <h3 className="rh-section">Contact, paie, prévoyance</h3>
          {dossier?.paiementDemandeMode && (
            <div className="rh-paiement-demande" role="status">
              <span>
                <strong>Changement de moyen de paiement demandé</strong> le {formatDate(dossier.paiementDemandeLe, '')}{' '}
                : {LIBELLE_PAIEMENT_SALAIRE[dossier.paiementDemandeMode]} · {dossier.paiementDemandeCoordonnees}
              </span>
              {ecriture && (
                <span className="dmd-actions">
                  <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => decider(false)}>
                    Refuser
                  </button>
                  <button type="button" className="btn-primary btn-primary--sm" onClick={() => decider(true)}>
                    Valider pour la paie
                  </button>
                </span>
              )}
            </div>
          )}
          <div className="rh-grille">
            {champ('telephone', 'Téléphone', { type: 'tel' })}
            {champ('emailPro', 'E-mail professionnel', { type: 'email', placeholder: 'prenom.nom@…' })}
            {champ('contactUrgence', 'Contact d’urgence')}
            <Field label="Paiement du salaire">
              <select className="field-input" value={form.modePaiement} onChange={maj('modePaiement')}>
                <option value="virement">Virement</option>
                <option value="wave">Wave</option>
                <option value="orange_money">Orange Money</option>
              </select>
            </Field>
            {champ('coordonneesPaiement', 'RIB ou numéro')}
            {champ('numeroIpm', 'N° adhérent IPM / assurance')}
            {champ('visiteMedicale', 'Prochaine visite médicale', { type: 'date' })}
          </div>

          <h3 className="rh-section">Carte de mission · nouvel arrivant</h3>
          <div className="rh-grille rh-grille--2">
            {zone('missionResultat', 'Résultat attendu')}
            {zone('missionLivrables', 'Livrables')}
            {zone('missionKpi', 'KPI')}
            {zone('missionSignalAlerte', 'Signal d’alerte')}
          </div>
        </fieldset>

        <h3 className="rh-section">Pièces jointes</h3>
        {!dossier ? (
          <p className="cell-sub">Enregistrez le dossier pour joindre les pièces.</p>
        ) : (
          <ul className="rh-pieces">
            {PIECES.map((p) => {
              const piece = dossier.pieces.find((x) => x.type === p.type);
              return (
                <li key={p.type} className="rh-piece">
                  <span className={`rh-piece-point${piece?.nom ? ' est-joint' : ''}`} aria-hidden />
                  <span className="rh-piece-libelle">
                    <strong>{p.libelle}</strong>
                    {p.aide && <span className="cell-sub">{p.aide}</span>}
                  </span>
                  {piece?.nom ? (
                    <button type="button" className="lien-inline" onClick={() => ouvrirPiece(p.type)}>
                      {piece.nom}
                    </button>
                  ) : (
                    <span className="rh-manquant">manquant</span>
                  )}
                  {ecriture && (
                    <label className="btn-ghost btn-ghost--sm">
                      <Paperclip size={14} aria-hidden />
                      {piece?.nom ? 'Remplacer' : 'Joindre'}
                      <input
                        type="file"
                        accept={FICHIERS_ACCEPTES.rh}
                        hidden
                        onChange={(e) => joindre(p.type, e.target.files?.[0])}
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="rh-section">Bulletins de paie</h3>
        {!dossier ? (
          <p className="cell-sub">Enregistrez le dossier pour déposer les bulletins.</p>
        ) : (
          <>
            {ecriture && (
              <div className="rh-bulletin-depot">
                <Field label="Mois de paie">
                  <input
                    type="month"
                    className="field-input"
                    placeholder="AAAA-MM"
                    max={new Date().toISOString().slice(0, 7)}
                    value={moisBulletin}
                    onChange={(e) => setMoisBulletin(e.target.value)}
                  />
                </Field>
                <label className={`btn-ghost btn-ghost--sm${moisBulletin ? '' : ' is-disabled'}`}>
                  <Paperclip size={14} aria-hidden />
                  {dossier.bulletins.some((b) => b.mois === moisBulletin)
                    ? 'Remplacer le bulletin'
                    : 'Déposer le bulletin'}
                  <input
                    type="file"
                    accept={FICHIERS_ACCEPTES.rh}
                    hidden
                    disabled={!moisBulletin}
                    onChange={(e) => {
                      deposer(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            )}
            {dossier.bulletins.length === 0 ? (
              <p className="cell-sub">Aucun bulletin déposé.</p>
            ) : (
              <ul className="rh-pieces">
                {dossier.bulletins.map((b) => (
                  <li key={b.mois} className="rh-piece">
                    <span className="rh-piece-point est-joint" aria-hidden />
                    <span className="rh-piece-libelle">
                      <strong className="mes-mois">{formatMonthYear(b.mois)}</strong>
                      <span className="cell-sub">déposé le {formatDate(b.deposeLe)}</span>
                    </span>
                    <button
                      type="button"
                      className="lien-inline"
                      onClick={() =>
                        getBulletin(slug, dossier.id, b.mois)
                          .then(telechargerFichier)
                          .catch((e) => setErreur(messageErreur(e, 'Téléchargement impossible.')))
                      }
                    >
                      {b.nom}
                    </button>
                    {ecriture && (
                      <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => retirer(b.mois)}>
                        Retirer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="cell-sub">
              Le salarié retrouve ses bulletins dans Mon espace · Mes documents. Un nouveau dépôt sur le même mois
              remplace le précédent.
            </p>
          </>
        )}
        <p className="cell-sub">Un dossier n’est jamais supprimé : en cas de départ, il est archivé.</p>

        {depart && (
          <>
            <h3 className="rh-section">Départ · {plural(depart.taches.length, 'tâche')} de projet à confier</h3>
            <p className="rh-note">
              Le départ n’est enregistré qu’une fois chaque tâche confiée à un collègue de la société. Chaque nouveau
              titulaire est prévenu ; les échéances ne bougent pas.
            </p>
            {depart.candidats.length === 0 && (
              <FieldError>
                Aucun collègue en poste dans cette société : créez d’abord la fiche du remplaçant.
              </FieldError>
            )}
            {depart.taches.map((t) => (
              <label key={t.id} className="field">
                <span className="field-label">
                  {t.projet} · {t.carte} · {t.libelle}
                  {t.finLe && ` · échéance ${formatDate(t.finLe)}`}
                  {t.statut === 'a_valider' && ' · remise en attente de validation'}
                </span>
                <select
                  className="field-input"
                  value={confies[t.id] ?? ''}
                  onChange={(e) => setConfies((c) => ({ ...c, [t.id]: e.target.value }))}
                >
                  <option value="">Confier à…</option>
                  {depart.candidats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDepart(null)}>
                Annuler le départ
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={confirmerDepart}
                disabled={depart.taches.some((t) => !confies[t.id])}
              >
                Confirmer le départ
              </button>
            </div>
          </>
        )}

        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          {ecriture && dossier && !depart && (
            <button type="button" className="btn-ghost" onClick={archiver}>
              {dossier.archiveLe ? (
                <>
                  <ArchiveRestore size={14} aria-hidden /> Réactiver
                </>
              ) : (
                <>
                  <Archive size={14} aria-hidden /> Archiver (départ)
                </>
              )}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
          {ecriture && (
            <button type="button" className="btn-primary" onClick={enregistrer} disabled={envoi}>
              {envoi ? 'Enregistrement…' : enregistre ? 'Enregistré' : dossier ? 'Enregistrer' : 'Créer le dossier'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
