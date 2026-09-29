'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, HeartPulse, Hourglass } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { lireFichier } from '@/lib/fichiers';
import {
  deposerAbsence,
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
} from '@/lib/demandes';
import { formatMontant } from '@/lib/format';
import type { CategorieSoins, DemandeAbsence, DemandeRemboursement, SoldeConges, TypeAbsence } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';

type Fichier = { nom: string; url: string };
type MesDemandes = { solde: SoldeConges; absences: DemandeAbsence[]; remboursements: DemandeRemboursement[] };

const msg = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : repli);

function useMesDemandes(slug: string) {
  const [donnees, setDonnees] = useState<MesDemandes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(() => {
    getMesDemandes(slug)
      .then(setDonnees)
      .catch((e) => setErreur(msg(e, 'Impossible de charger tes demandes.')));
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

// « Mon espace » · Congés et absences (RH lot 2) : solde, demande, suivi (la
// file du N+1 vit dans l'onglet « À valider »). Règles de solde = hypothèses
// de travail (cf. regles-conges.ts).
export function CongesAbsences({ slug }: { slug: string }) {
  const { donnees, erreur, charger } = useMesDemandes(slug);
  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (!donnees) return <Chargement />;
  const { solde, absences } = donnees;

  return (
    <>
      <KpiStrip
        tuiles={[
          { cle: 'dispo', label: 'Congés disponibles', valeur: solde.disponible, sousTexte: 'jours ouvrables', icone: CalendarCheck },
          { cle: 'acquis', label: 'Acquis', valeur: solde.acquis, sousTexte: '2 j par mois complet (hypothèse)', icone: CalendarDays },
          { cle: 'attente', label: 'En attente', valeur: solde.enAttente, sousTexte: `${solde.pris} j déjà pris`, icone: Hourglass },
        ]}
      />

      <div className="dmd-grille">
        <FormAbsence slug={slug} onFait={charger} />
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Mes absences</h2>
          {absences.length === 0 ? (
            <p className="empty-state">Aucune demande pour l’instant.</p>
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

// « Mon espace » · Remboursements santé (RH lot 2) : soumise → transmise →
// remboursée / rejetée, sans aucune donnée médicale.
export function RemboursementsSante({ slug }: { slug: string }) {
  const { donnees, erreur, charger } = useMesDemandes(slug);
  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (!donnees) return <Chargement />;
  const { remboursements } = donnees;

  return (
    <div className="dmd-grille">
      <FormRemboursement slug={slug} onFait={charger} />
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Mes remboursements santé</h2>
        {remboursements.length === 0 ? (
          <p className="empty-state">Aucune demande de remboursement.</p>
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

function FormAbsence({ slug, onFait }: { slug: string; onFait: () => void }) {
  const [type, setType] = useState<TypeAbsence>('conge_paye');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEtat({ envoi: true, erreur: null });
    try {
      await deposerAbsence(slug, { type, dateDebut: debut, dateFin: fin, commentaire: commentaire || undefined, justificatif: fichier ?? undefined });
      setDebut('');
      setFin('');
      setCommentaire('');
      setFichier(null);
      setEtat({ envoi: false, erreur: null });
      onFait();
    } catch (err) {
      setEtat({ envoi: false, erreur: msg(err, 'Demande non envoyée.') });
    }
  }

  return (
    <form className="panel glass-panel dmd-section" onSubmit={envoyer}>
      <h2 className="dmd-titre">
        <CalendarDays size={18} strokeWidth={1.75} aria-hidden /> Demander une absence
      </h2>
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
          <input type="date" className="field-input" required value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Au</span>
          <input type="date" className="field-input" required min={debut || undefined} value={fin} onChange={(e) => setFin(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Commentaire (facultatif)</span>
        <textarea className="field-input" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      </label>
      {type !== 'conge_paye' && (
        <label className="field">
          <span className="field-label">Justificatif (facultatif)</span>
          <input
            type="file"
            className="field-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) lireFichier(f).then(setFichier).catch((err) => setEtat({ envoi: false, erreur: msg(err, 'Fichier illisible.') }));
            }}
          />
        </label>
      )}
      <p className="dmd-note">Dimanches exclus, samedi compté. Jours fériés pas encore déduits.</p>
      {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
      <button type="submit" className="btn-primary" disabled={etat.envoi}>
        {etat.envoi ? 'Envoi…' : 'Envoyer au N+1'}
      </button>
    </form>
  );
}

function FormRemboursement({ slug, onFait }: { slug: string; onFait: () => void }) {
  const [categorie, setCategorie] = useState<CategorieSoins>('pharmacie');
  const [beneficiaire, setBeneficiaire] = useState('moi');
  const [dateSoins, setDateSoins] = useState('');
  const [montant, setMontant] = useState('');
  const [fichiers, setFichiers] = useState<Fichier[]>([]);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEtat({ envoi: true, erreur: null });
    try {
      await deposerRemboursement(slug, { categorie, beneficiaire, dateSoins, montant: Number(montant), justificatifs: fichiers });
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
      <h2 className="dmd-titre">
        <HeartPulse size={18} strokeWidth={1.75} aria-hidden /> Remboursement santé
      </h2>
      <div className="rh-grille">
        <label className="field">
          <span className="field-label">Catégorie</span>
          <select className="field-input" value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieSoins)}>
            {Object.entries(LIBELLE_SOINS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
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
          <span className="field-label">Date des soins</span>
          <input type="date" className="field-input" required value={dateSoins} onChange={(e) => setDateSoins(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Montant (FCFA)</span>
          <input type="number" min={1} step={1} className="field-input" required value={montant} onChange={(e) => setMontant(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Factures / ordonnances (facultatif)</span>
        <input
          type="file"
          multiple
          className="field-input"
          onChange={(e) =>
            Promise.all(Array.from(e.target.files ?? []).map(lireFichier))
              .then((l) => setFichiers(l.map(({ nom, url }) => ({ nom, url }))))
              .catch((err) => setEtat({ envoi: false, erreur: msg(err, 'Fichier illisible.') }))
          }
        />
      </label>
      <p className="dmd-note">Aucun diagnostic ni information médicale : seulement la catégorie et le montant.</p>
      {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
      <button type="submit" className="btn-primary" disabled={etat.envoi}>
        {etat.envoi ? 'Envoi…' : 'Soumettre à la RH'}
      </button>
    </form>
  );
}
