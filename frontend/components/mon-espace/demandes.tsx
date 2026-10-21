'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarPlus, Hourglass, Plane } from 'lucide-react';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { ApiError } from '@/lib/client-api';
import { lireFichier } from '@/lib/fichiers';
import {
  deposerAbsence,
  getSuppleants,
  deposerRemboursement,
  getMesDemandes,
  jjmm,
  LIBELLE_MOTIF_REFUS,
  LIBELLE_SOINS,
  LIBELLE_TYPE_ABSENCE,
  repondreAutresDates,
  retirerAbsence,
  STATUT_ABSENCE,
  STATUT_REMBOURSEMENT,
  type Suppleant,
} from '@/lib/demandes';
import { formatMontant } from '@/lib/format';
import type { CategorieSoins, DemandeAbsence, DemandeRemboursement, SoldeConges, TypeAbsence } from '@/lib/types';

type Fichier = { nom: string; url: string };
type MesDemandes = { solde: SoldeConges; absences: DemandeAbsence[]; remboursements: DemandeRemboursement[] };

const msg = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : repli);

// Dates saisies au format de la maquette (JJ/MM/AAAA) ; null si invalide.
function versIso(jjmmaaaa: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(jjmmaaaa.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

// Saisie JJ/MM/AAAA au clavier numérique : les « / » sont posés pendant la
// frappe — le pavé numérique d'un iPhone n'en a pas (revue mobile 20/10/2026).
function formaterDate(saisie: string): string {
  const c = saisie.replace(/\D/g, '').slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}` : c.length > 2 ? `${c.slice(0, 2)}/${c.slice(2)}` : c;
}

// Pièce jointe présentée comme la case de la maquette (« Justificatif joint ») :
// cocher ouvre le sélecteur de fichiers ; la case est cochée dès qu'un fichier
// est joint (décocher le retire).
function CaseJointe({
  libelle,
  fichiers,
  multiple,
  onChange,
  onErreur,
}: {
  libelle: string;
  fichiers: Fichier[];
  multiple?: boolean;
  onChange: (f: Fichier[]) => void;
  onErreur: (m: string) => void;
}) {
  return (
    <label className="me-case-jointe">
      <input
        type="checkbox"
        checked={fichiers.length > 0}
        onChange={(e) => {
          if (!e.target.checked) onChange([]);
        }}
        onClick={(e) => {
          if (fichiers.length === 0) {
            e.preventDefault();
            (e.currentTarget.parentElement?.querySelector('input[type=file]') as HTMLInputElement | null)?.click();
          }
        }}
      />
      <span>
        {libelle}
        {fichiers.length > 0 && <span className="cell-sub"> · {fichiers.map((f) => f.nom).join(', ')}</span>}
      </span>
      <input
        type="file"
        hidden
        multiple={multiple}
        onChange={(e) =>
          Promise.all(Array.from(e.target.files ?? []).map(lireFichier))
            .then((l) => onChange(l.map(({ nom, url }) => ({ nom, url }))))
            .catch((err) => onErreur(msg(err, 'Fichier illisible.')))
        }
      />
    </label>
  );
}

function useMesDemandes(slug: string) {
  const [donnees, setDonnees] = useState<MesDemandes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(() => {
    getMesDemandes(slug)
      .then(setDonnees)
      .catch((e) => setErreur(msg(e, 'Impossible de charger vos demandes.')));
  }, [slug]);
  useEffect(charger, [charger]);
  return { donnees, erreur, charger };
}

function Chargement() {
  return (
    <div className="admin-skeleton" aria-hidden>
      <div className="skeleton admin-skeleton-panel" />
    </div>
  );
}

// « Mon espace » · Congés et absences (RH lot 2, maquette du boss) : solde
// de l'année en tête, demande, suivi (la file du N+1 vit dans « À valider »).
// Règles de solde : regles-conges.ts (2 j/mois, report plafonné — 19/10/2026).
export function CongesAbsences({ slug }: { slug: string }) {
  const { donnees, erreur, charger } = useMesDemandes(slug);
  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (!donnees) return <Chargement />;
  const { solde, absences } = donnees;

  return (
    <>
      <KpiStrip
        tuiles={[
          {
            cle: 'restant',
            label: 'Restant',
            valeur: `${solde.disponible} j`,
            sousTexte: solde.enAttente ? `dont ${solde.enAttente} j réservés par vos demandes en attente` : 'à poser cette année',
            icone: Plane,
          },
          {
            cle: 'acquis',
            label: `Acquis ${solde.annee}`,
            valeur: `${solde.acquis} j`,
            sousTexte: '2 jours ouvrables par mois de service',
            icone: CalendarPlus,
          },
          {
            cle: 'report',
            label: `Report de ${solde.annee - 1}`,
            valeur: `${solde.report} j`,
            sousTexte: solde.plafondReport ? `plafonné à ${solde.plafondReport} j` : 'aucun report',
            icone: Hourglass,
          },
          {
            cle: 'pris',
            label: 'Pris',
            valeur: `${solde.pris} j`,
            sousTexte: 'congés payés validés',
            icone: CalendarCheck,
          },
        ]}
      />
    <div className="me-colonnes me-colonnes--egales">
      <FormAbsence slug={slug} solde={solde} onFait={charger} />
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Mes demandes</h2>
        {absences.length === 0 ? (
          <p className="dmd-note">Aucune demande.</p>
        ) : (
          <ul className="dmd-liste">
            {absences.map((d) => (
              <LigneAbsence key={d.id} slug={slug} d={d} onFait={charger} />
            ))}
          </ul>
        )}
      </section>
    </div>
    </>
  );
}

// « Mon espace » · Remboursements santé (RH lot 2, maquette du boss) :
// soumise → transmise → remboursée / rejetée, sans aucune donnée médicale.
export function RemboursementsSante({ slug }: { slug: string }) {
  const { donnees, erreur, charger } = useMesDemandes(slug);
  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (!donnees) return <Chargement />;
  const { remboursements } = donnees;

  return (
    <div className="me-colonnes me-colonnes--egales">
      <FormRemboursement slug={slug} onFait={charger} />
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Mes demandes de remboursement</h2>
        {remboursements.length === 0 ? (
          <p className="dmd-note">Aucune demande.</p>
        ) : (
          <ul className="dmd-liste">
            {remboursements.map((r) => (
              <li key={r.id} className="dmd-ligne">
                <span>
                  <strong>
                    {LIBELLE_SOINS[r.categorie]} · {formatMontant(r.montant)}
                  </strong>
                  <span className="cell-sub">
                    Soins du {jjmm(r.dateSoins)}
                    {r.montantRembourse != null && ` · remboursé ${formatMontant(r.montantRembourse)}`}
                    {r.motifRejet && ` · ${r.motifRejet}`}
                  </span>
                </span>
                <span className={`pill ${STATUT_REMBOURSEMENT[r.statut].pill}`}>{STATUT_REMBOURSEMENT[r.statut].libelle}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LigneAbsence({ slug, d, onFait }: { slug: string; d: DemandeAbsence; onFait: () => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const agir = (p: Promise<unknown>) => p.then(onFait).catch((e) => setErreur(msg(e, 'Action impossible.')));
  const statut = STATUT_ABSENCE[d.statut];
  return (
    <li className="dmd-ligne">
      <span>
        <strong>
          {LIBELLE_TYPE_ABSENCE[d.type]} · {d.jours} j
        </strong>
        <span className="cell-sub">
          {jjmm(d.dateDebut)} → {jjmm(d.dateFin)}
          {d.statut === 'attente_n1' && d.n1Role && ` · chez ${d.n1Role}`}
          {d.statut === 'accord_n1' && !d.decisionN1 && ' · sans N+1, transmise à la RH'}
          {d.motifRefus && ` · ${LIBELLE_MOTIF_REFUS[d.motifRefus]}`}
          {d.commentaireRefus && ` — ${d.commentaireRefus}`}
        </span>
        {d.statut === 'autres_dates' && d.datesProposeesDebut && (
          <span className="dmd-proposition">
            Dates proposées : {jjmm(d.datesProposeesDebut)} → {jjmm(d.datesProposeesFin!)}
          </span>
        )}
        {erreur && <span className="field-erreur">{erreur}</span>}
      </span>
      <span className="dmd-actions">
        <span className={`pill ${statut.pill}`}>{statut.libelle}</span>
        {d.statut === 'autres_dates' && (
          <>
            <button type="button" className="btn-primary btn-primary--sm" onClick={() => agir(repondreAutresDates(slug, d.id, true))}>
              Accepter
            </button>
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => agir(repondreAutresDates(slug, d.id, false))}>
              Retirer
            </button>
          </>
        )}
        {d.statut === 'attente_n1' && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => agir(retirerAbsence(slug, d.id))}>
            Retirer
          </button>
        )}
      </span>
    </li>
  );
}

function FormAbsence({ slug, solde, onFait }: { slug: string; solde: SoldeConges; onFait: () => void }) {
  const [type, setType] = useState<TypeAbsence>('conge_paye');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [motif, setMotif] = useState('');
  const [fichiers, setFichiers] = useState<Fichier[]>([]);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  // Dir. GC (revue du 21/10/2026) : qui tient sa place pendant l'absence.
  const [suppleants, setSuppleants] = useState<Suppleant[]>([]);
  const [suppleantId, setSuppleantId] = useState('');
  useEffect(() => {
    getSuppleants(slug)
      .then(setSuppleants)
      .catch(() => setSuppleants([]));
  }, [slug]);
  const isoDebut = versIso(debut);
  const isoFin = versIso(fin);
  const motifRequis = type !== 'conge_paye';
  const pret = !!isoDebut && !!isoFin && (!motifRequis || !!motif.trim());

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!isoDebut || !isoFin) return;
    setEtat({ envoi: true, erreur: null });
    try {
      await deposerAbsence(slug, {
        type,
        dateDebut: isoDebut,
        dateFin: isoFin,
        commentaire: motif.trim() || undefined,
        justificatif: fichiers[0],
        suppleantId: suppleantId || undefined,
      });
      setDebut('');
      setFin('');
      setMotif('');
      setFichiers([]);
      setEtat({ envoi: false, erreur: null });
      onFait();
    } catch (err) {
      setEtat({ envoi: false, erreur: msg(err, 'Demande non envoyée.') });
    }
  }

  return (
    <form className="panel glass-panel dmd-section" onSubmit={envoyer}>
      <h2 className="dmd-titre">Demander une absence ou un congé</h2>
      <p className="dmd-note">
        Restant : <strong>{solde.disponible} j</strong>
        {solde.enAttente > 0 && ` (dont ${solde.enAttente} j en attente de décision, réservés)`}. Décompte hors dimanches et jours
        fériés des Réglages.
      </p>
      <label className="field">
        <span className="field-label">Type</span>
        <select className="field-input" value={type} onChange={(e) => setType(e.target.value as TypeAbsence)}>
          {Object.entries(LIBELLE_TYPE_ABSENCE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="rh-grille">
        <label className="field">
          <span className="field-label">Du</span>
          <input className="field-input" inputMode="numeric" placeholder="JJ/MM/AAAA" value={debut} onChange={(e) => setDebut(formaterDate(e.target.value))} />
        </label>
        <label className="field">
          <span className="field-label">Au (inclus)</span>
          <input className="field-input" inputMode="numeric" placeholder="JJ/MM/AAAA" value={fin} onChange={(e) => setFin(formaterDate(e.target.value))} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Motif</span>
        <textarea
          className="field-input"
          rows={2}
          maxLength={1000}
          placeholder={motifRequis ? 'Obligatoire pour ce type d’absence' : 'Facultatif pour un congé payé'}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />
      </label>
      <CaseJointe libelle="Justificatif joint" fichiers={fichiers} onChange={setFichiers} onErreur={(m) => setEtat({ envoi: false, erreur: m })} />
      {suppleants.length > 0 && (
        <label className="field">
          <span className="field-label">Suppléant pendant votre absence</span>
          <select className="field-input" value={suppleantId} onChange={(e) => setSuppleantId(e.target.value)}>
            <option value="">Le CTO (par défaut)</option>
            {suppleants.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} · {s.role.replace(/\s*\(transverse\)$/, '')}
              </option>
            ))}
          </select>
          <span className="cell-sub">Remises, prolongations et TS lui reviennent tant que votre absence validée dure ; il est prévenu dès l’envoi.</span>
        </label>
      )}
      {/* Seulement une date complète mais invalide (pas avant toute saisie). */}
      {((debut.length === 10 && !isoDebut) || (fin.length === 10 && !isoFin)) && <p className="me-consigne">Date invalide : JJ/MM/AAAA.</p>}
      {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
      <button type="submit" className="btn-primary me-envoyer" disabled={etat.envoi || !pret}>
        {etat.envoi ? 'Envoi…' : 'Envoyer à mon N+1'}
      </button>
      <p className="dmd-note me-pied">Circuit : vous → votre N+1 (décision) → RH Holding (validation finale et paie).</p>
    </form>
  );
}

function FormRemboursement({ slug, onFait }: { slug: string; onFait: () => void }) {
  const [categorie, setCategorie] = useState<CategorieSoins>('consultation');
  const [beneficiaire, setBeneficiaire] = useState('moi');
  const [dateSoins, setDateSoins] = useState('');
  const [montant, setMontant] = useState('');
  const [fichiers, setFichiers] = useState<Fichier[]>([]);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  const isoSoins = versIso(dateSoins);
  const somme = Number(montant.replace(/\s/g, ''));
  const pret = !!isoSoins && Number.isInteger(somme) && somme > 0 && fichiers.length > 0;

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!isoSoins) return;
    setEtat({ envoi: true, erreur: null });
    try {
      await deposerRemboursement(slug, { categorie, beneficiaire, dateSoins: isoSoins, montant: somme, justificatifs: fichiers });
      setDateSoins('');
      setMontant('');
      setFichiers([]);
      setEtat({ envoi: false, erreur: null });
      onFait();
    } catch (err) {
      setEtat({ envoi: false, erreur: msg(err, 'Demande non envoyée.') });
    }
  }

  return (
    <form className="panel glass-panel dmd-section" onSubmit={envoyer}>
      <h2 className="dmd-titre">Demander un remboursement santé</h2>
      <p className="dmd-note">
        Frais médicaux avancés par vous ou vos ayants droit, transmis par la RH à l’assurance (IPM ou assureur). Aucun
        diagnostic n’est demandé ; la demande n’est visible que par vous et la RH.
      </p>
      <div className="rh-grille">
        <label className="field">
          <span className="field-label">Date des soins</span>
          <input className="field-input" inputMode="numeric" placeholder="JJ/MM/AAAA" value={dateSoins} onChange={(e) => setDateSoins(formaterDate(e.target.value))} />
        </label>
        <label className="field">
          <span className="field-label">Bénéficiaire</span>
          <select className="field-input" value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)}>
            <option value="moi">Moi</option>
            <option value="conjoint">Conjoint(e)</option>
            <option value="enfant">Enfant</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Nature des frais</span>
          <select className="field-input" value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieSoins)}>
            {Object.entries(LIBELLE_SOINS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Montant payé (FCFA)</span>
          <input className="field-input" inputMode="numeric" placeholder="ex. 25000" value={montant} onChange={(e) => setMontant(e.target.value)} />
        </label>
      </div>
      <CaseJointe
        libelle="Facture et ordonnance jointes (obligatoire)"
        multiple
        fichiers={fichiers}
        onChange={setFichiers}
        onErreur={(m) => setEtat({ envoi: false, erreur: m })}
      />
      {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
      <button type="submit" className="btn-primary me-envoyer" disabled={etat.envoi || !pret}>
        {etat.envoi ? 'Envoi…' : 'Envoyer à la RH'}
      </button>
      <p className="dmd-note me-pied">
        Suivi : soumise → transmise à l’assurance → remboursée (montant crédité sur votre moyen de paiement enregistré).
      </p>
    </form>
  );
}
