'use client';

import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { formatMontant } from '@/lib/format';
import {
  finDeMois,
  formatTaux,
  getCoutSalaries,
  getFicheRentabilite,
  LIBELLE_ETAT,
  LIBELLE_STATUT,
  PILL_STATUT,
  type CoutSalarie,
  type FicheRentabilite,
} from '@/lib/rentabilite';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const libelleMois = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const message = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : repli);

// Fiche de rentabilité d'un projet (lot 7, phase 1), en panneau latéral :
// synthèse, factures et avoirs, temps par mois, coût par salarié à la
// demande (CFO, CEO ; affichage tracé), qualité des données.
export function FicheRentabilitePanneau({ slug, projetId, onClose }: { slug: string; projetId: string; onClose: () => void }) {
  const [f, setF] = useState<FicheRentabilite | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [salaries, setSalaries] = useState<CoutSalarie[] | null>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    getFicheRentabilite(slug, projetId)
      .then(setF)
      .catch((e) => setErreur(message(e, 'Fiche indisponible.')));
  }, [slug, projetId]);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose]);

  async function afficherSalaries() {
    setChargement(true);
    try {
      setSalaries(await getCoutSalaries(slug, projetId));
    } catch (e) {
      setErreur(message(e, 'Détail indisponible.'));
    } finally {
      setChargement(false);
    }
  }

  const montants = f?.acces === 'montants';

  return (
    <div className="fiche-crm-fond" onClick={onClose}>
      <aside className="fiche-crm rtf" role="dialog" aria-modal="true" aria-labelledby="rtf-titre" onClick={(e) => e.stopPropagation()}>
        <header className="fiche-crm-entete">
          <div>
            <p className="fiche-crm-titre">Rentabilité · provisoire</p>
            <h2 id="rtf-titre" className="fiche-crm-code">
              {f?.projet.code ?? '…'}
            </h2>
            {f && (
              <p className="fiche-crm-meta">
                {f.projet.client}
                {f.projet.programme ? ` · ${f.projet.programme}` : ''}
              </p>
            )}
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {erreur && <p className="field-erreur">{erreur}</p>}
        {!f && !erreur && <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />}
        {f && (
          <>
            <section className="fiche-crm-section">
              <h3 className="fiche-crm-titre">
                Synthèse · {f.arreteAu ? `cumul arrêté au ${finDeMois(f.arreteAu)}` : 'aucun mois entièrement contrôlé'}
              </h3>
              <dl className="rtf-synthese">
                {montants && (
                  <>
                    <div>
                      <dt>Montant HT facturé</dt>
                      <dd>{formatMontant(f.ht ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>Coût salarial direct</dt>
                      <dd>{formatMontant(f.cout ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>Marge directe provisoire</dt>
                      <dd className={(f.marge ?? 0) < 0 ? 'rt-negatif' : undefined}>
                        <strong>{f.marge === null ? 'Non calculable : données insuffisantes' : formatMontant(f.marge)}</strong>
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Taux</dt>
                  <dd className="rt-taux-ligne">
                    {f.etat === 'complet' ? formatTaux(f.taux) : 'Non calculable'}
                    {f.statut && <span className={`pill ${PILL_STATUT[f.statut]}`}>{LIBELLE_STATUT[f.statut]}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Signaux de dépassement</dt>
                  <dd>
                    {f.prolongations} prolongation{f.prolongations > 1 ? 's' : ''} · {f.reprises} reprise{f.reprises > 1 ? 's' : ''}
                  </dd>
                </div>
                {montants && f.aFacturer ? (
                  <div>
                    <dt>Encore à facturer (hors marge)</dt>
                    <dd>{formatMontant(f.aFacturer)}</dd>
                  </div>
                ) : null}
                {f.parHeure && (
                  <div>
                    <dt>Par heure contrôlée</dt>
                    <dd>
                      {formatMontant(f.parHeure.honoraires)} facturés · {formatMontant(f.parHeure.cout)} de coût
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="fiche-crm-section">
              <h3 className="fiche-crm-titre">Qualité des données · {LIBELLE_ETAT[f.etat]}</h3>
              {f.qualite.length ? (
                <ul className="rtf-qualite">
                  {f.qualite.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              ) : (
                <p className="dmd-note">Heures contrôlées et salaires validés pour tout le temps imputé.</p>
              )}
            </section>

            <section className="fiche-crm-section">
              <h3 className="fiche-crm-titre">Temps et coût par mois</h3>
              {f.mois.length === 0 ? (
                <p className="dmd-note">Aucune heure contrôlée ni facture émise.</p>
              ) : (
                <ul className="rtf-mois">
                  {f.mois.map((m) => (
                    <li key={m.mois}>
                      <span className="rtf-mois-nom">{libelleMois(m.mois)}</span>
                      <span>{m.heures.toLocaleString('fr-FR')} h</span>
                      {montants && <span>{formatMontant(m.cout ?? 0)} de coût</span>}
                      {montants && <span>{formatMontant(m.ht ?? 0)} facturés</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {montants && f.factures && (
              <section className="fiche-crm-section">
                <h3 className="fiche-crm-titre">Factures et avoirs émis</h3>
                {f.factures.length === 0 ? (
                  <p className="dmd-note">Aucune facture émise.</p>
                ) : (
                  <ul className="rtf-mois">
                    {f.factures.map((x) => (
                      <li key={x.id}>
                        <span className="rtf-mois-nom">{x.reference ?? '—'}</span>
                        <span>{jjmmaaaa(x.emiseLe)}</span>
                        <span className={x.ht < 0 ? 'rt-negatif' : undefined}>{formatMontant(x.ht)} HT</span>
                        <span className="cell-sub">
                          {x.estAvoir ? 'avoir' : x.annulee ? 'annulée par avoir' : x.libelle}
                          {x.horsCumul && ' · hors cumul (émise après l’arrêté)'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {montants && (
              <section className="fiche-crm-section">
                <h3 className="fiche-crm-titre">Coût par salarié · {f.salaries} salarié{f.salaries > 1 ? 's' : ''}</h3>
                {salaries === null ? (
                  <>
                    <p className="dmd-note">Masqué par défaut : chaque affichage est inscrit au journal de la paie.</p>
                    <button type="button" className="btn-ghost btn-ghost--sm" disabled={chargement} onClick={afficherSalaries}>
                      <Eye size={14} aria-hidden /> Afficher le détail
                    </button>
                  </>
                ) : salaries.length === 0 ? (
                  <p className="dmd-note">Aucune heure contrôlée.</p>
                ) : (
                  <ul className="rtf-mois">
                    {salaries.map((s) => (
                      <li key={s.nom}>
                        <span className="rtf-mois-nom">{s.nom}</span>
                        <span>{s.heures === null ? '—' : `${s.heures.toLocaleString('fr-FR')} h`}</span>
                        <span>{s.sansSalaire ? <span className="pill pill--attention">sans salaire validé</span> : formatMontant(s.cout ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="fiche-crm-section">
              <h3 className="fiche-crm-titre">Dépenses directes</h3>
              <p className="dmd-note">Phase 2 : bureaux d’études d’abord, puis le modèle de dépenses (D8). Non déduites aujourd’hui.</p>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
