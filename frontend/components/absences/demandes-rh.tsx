'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendrierCellule } from './calendrier-cellule';
import { Paperclip } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { lireFichier } from '@/lib/fichiers';
import {
  delivrerAttestation,
  getDemandesRh,
  type AttestationRh,
  jjmm,
  LIBELLE_SOINS,
  LIBELLE_TYPE_ABSENCE,
  marquerRembourse,
  rejeterRemboursement,
  STATUT_ABSENCE,
  STATUT_REMBOURSEMENT,
  telechargerJustificatif,
  transmettreRemboursement,
  validerAbsenceRh,
} from '@/lib/demandes';
import { formatMontant } from '@/lib/format';
import type { DemandeAbsence, DemandeRemboursement } from '@/lib/types';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Action impossible.');

// Onglet « Demandes » de la page RH (lot 2) : validation finale des absences
// (après accord du N+1), suivi des remboursements santé, et attestations de
// travail demandées dans « Mon espace » (la RH dépose le document signé).
export function DemandesRh({ slug, ecriture }: { slug: string; ecriture: boolean }) {
  const [donnees, setDonnees] = useState<{
    absences: DemandeAbsence[];
    remboursements: DemandeRemboursement[];
    attestations: AttestationRh[];
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [toutes, setToutes] = useState(false);
  // Demande dont on regarde le calendrier de la cellule.
  const [cellule, setCellule] = useState<string | null>(null);

  const charger = useCallback(() => {
    getDemandesRh(slug)
      .then(setDonnees)
      .catch((e) => setErreur(msg(e)));
  }, [slug]);
  useEffect(charger, [charger]);

  async function agir(p: () => Promise<unknown>) {
    setErreur(null);
    try {
      await p();
      charger();
    } catch (e) {
      setErreur(msg(e));
    }
  }

  if (!donnees) return erreur ? <p className="field-erreur">{erreur}</p> : <div className="skeleton admin-skeleton-panel" aria-hidden />;

  // Une demande de la RH attend le CEO : elle n'est pas « à traiter » ici.
  const absencesATraiter = donnees.absences.filter((d) => d.statut === 'accord_n1' && d.valideurFinal !== 'ceo');
  const rembATraiter = donnees.remboursements.filter((r) => r.statut === 'soumise' || r.statut === 'transmise');
  const absences = toutes ? donnees.absences : absencesATraiter;
  const remboursements = toutes ? donnees.remboursements : rembATraiter;
  const attestATraiter = donnees.attestations.filter((a) => !a.delivreeLe);
  const attestations = toutes ? donnees.attestations : attestATraiter;
  const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

  return (
    <>
      <div className="rh-outils">
        <label className="rh-archives">
          <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} />
          Afficher l’historique complet
        </label>
      </div>
      {erreur && <p className="field-erreur">{erreur}</p>}

      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Absences</h2>
        {absences.length === 0 ? (
          <p className="empty-state">Rien à valider.</p>
        ) : (
          <ul className="dmd-liste">
            {absences.map((d) => (
              <li key={d.id} className="dmd-ligne rh-absence">
                <span>
                  <strong>{d.salarie ? `${d.salarie.prenom} ${d.salarie.nom}` : '—'}</strong>
                  <span className="cell-sub">
                    {d.salarie?.matricule} · {LIBELLE_TYPE_ABSENCE[d.type]} · {d.jours} j · {jjmm(d.dateDebut)} → {jjmm(d.dateFin)}
                    {d.commentaireRefus && ` — ${d.commentaireRefus}`}
                  </span>
                </span>
                <span className="dmd-actions">
                  {d.aJustificatif && (
                    <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => agir(() => telechargerJustificatif(slug, `/rh/demandes/absences/${d.id}/justificatif`))}>
                      <Paperclip size={14} aria-hidden /> Justificatif
                    </button>
                  )}
                  <span className={`pill ${STATUT_ABSENCE[d.statut].pill}`}>{STATUT_ABSENCE[d.statut].libelle}</span>
                  {d.statut === 'accord_n1' && d.valideurFinal === 'ceo' && <span className="cell-sub">validation finale : CEO</span>}
                  {d.statut === 'accord_n1' && (
                    <button type="button" className="btn-ghost btn-ghost--sm" aria-expanded={cellule === d.id} onClick={() => setCellule((x) => (x === d.id ? null : d.id))}>
                      {cellule === d.id ? 'Masquer la cellule' : 'Voir la cellule'}
                    </button>
                  )}
                  {ecriture && d.statut === 'accord_n1' && d.valideurFinal !== 'ceo' && (
                    <>
                      <button type="button" className="btn-primary btn-primary--sm" onClick={() => agir(() => validerAbsenceRh(slug, d.id, true))}>
                        Valider
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => {
                          const motif = window.prompt('Motif du refus');
                          if (motif?.trim()) agir(() => validerAbsenceRh(slug, d.id, false, motif.trim()));
                        }}
                      >
                        Refuser
                      </button>
                    </>
                  )}
                </span>
                {cellule === d.id && (
                  <div className="rh-absence-cellule">
                    <CalendrierCellule slug={slug} demandeId={d.id} source="rh" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Remboursements santé</h2>
        {remboursements.length === 0 ? (
          <p className="empty-state">Aucun remboursement en cours.</p>
        ) : (
          <ul className="dmd-liste">
            {remboursements.map((r) => (
              <li key={r.id} className="dmd-ligne">
                <span>
                  <strong>
                    {r.dossier ? `${r.dossier.prenom} ${r.dossier.nom}` : '—'} · {formatMontant(r.montant)}
                  </strong>
                  <span className="cell-sub">
                    {LIBELLE_SOINS[r.categorie]} · soins du {jjmm(r.dateSoins)}
                    {r.montantRembourse != null && ` · remboursé ${formatMontant(r.montantRembourse)}`}
                    {r.motifRejet && ` · ${r.motifRejet}`}
                  </span>
                </span>
                <span className="dmd-actions">
                  {r.justificatifs.map((j) => (
                    <button key={j.id} type="button" className="btn-ghost btn-ghost--sm" onClick={() => agir(() => telechargerJustificatif(slug, `/rh/demandes/justificatifs/${j.id}`))}>
                      <Paperclip size={14} aria-hidden /> {j.nom}
                    </button>
                  ))}
                  <span className={`pill ${STATUT_REMBOURSEMENT[r.statut].pill}`}>{STATUT_REMBOURSEMENT[r.statut].libelle}</span>
                  {ecriture && r.statut === 'soumise' && (
                    <button type="button" className="btn-primary btn-primary--sm" onClick={() => agir(() => transmettreRemboursement(slug, r.id))}>
                      Transmettre
                    </button>
                  )}
                  {ecriture && r.statut === 'transmise' && (
                    <button
                      type="button"
                      className="btn-primary btn-primary--sm"
                      onClick={() => {
                        const m = window.prompt('Montant remboursé (FCFA)', String(r.montant));
                        if (m && Number(m) >= 0) agir(() => marquerRembourse(slug, r.id, Math.round(Number(m))));
                      }}
                    >
                      Remboursée
                    </button>
                  )}
                  {ecriture && (r.statut === 'soumise' || r.statut === 'transmise') && (
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      onClick={() => {
                        const motif = window.prompt('Motif du rejet');
                        if (motif?.trim()) agir(() => rejeterRemboursement(slug, r.id, motif.trim()));
                      }}
                    >
                      Rejeter
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Attestations de travail</h2>
        {attestations.length === 0 ? (
          <p className="empty-state">Aucune attestation à délivrer.</p>
        ) : (
          <ul className="dmd-liste">
            {attestations.map((a) => (
              <li key={a.id} className="dmd-ligne">
                <span>
                  <strong>
                    {a.dossier.prenom} {a.dossier.nom}
                  </strong>
                  <span className="cell-sub">
                    {a.dossier.matricule} · demandée le {jjmmaaaa(a.demandeLe)}
                    {a.delivreeLe && ` · délivrée le ${jjmmaaaa(a.delivreeLe)} (${a.nom})`}
                  </span>
                </span>
                <span className="dmd-actions">
                  {a.delivreeLe ? (
                    <span className="pill pill--succes">Délivrée</span>
                  ) : (
                    ecriture && (
                      <label className="btn-primary btn-primary--sm">
                        <Paperclip size={14} aria-hidden /> Joindre l’attestation signée
                        <input
                          type="file"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f)
                              agir(async () => {
                                const { nom, url } = await lireFichier(f);
                                return delivrerAttestation(slug, a.id, { nom, url });
                              });
                          }}
                        />
                      </label>
                    )
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
