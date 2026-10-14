'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, Download, X } from 'lucide-react';
import { ajouterPaiementCentrale, emettreFactureCentrale, lienFacturationProjet, relancerFacture, supprimerFactureCentrale } from '@/lib/facturation';
import { formatMontant } from '@/lib/format';
import { MODES_PAIEMENT, type FactureCentrale, type ModePaiement } from '@/lib/types';
import { DocumentFacturation, type DocumentFacturationProps } from '@/components/document-facturation';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const aujourdhui = () => new Date().toISOString().slice(0, 10);

type Props = {
  slug: string;
  facture: FactureCentrale;
  document: DocumentFacturationProps | null; // aperçu (mise en page de la société)
  statut: { libelle: string; classe: string };
  societeNom: string;
  droits: { ecriture: boolean; validation: boolean };
  onMaj: (f: FactureCentrale) => void;
  onSupprimee: () => void;
  onTelecharger: () => void;
  onClose: () => void;
};

// Facture en panneau latéral (maquette Finances, oct. 2026) : statut,
// bandeau « à valider par le CFO » d'une facture directe préparée, document,
// encaissements. Le CFO (validation) l'émet et enregistre les encaissements.
export function FacturePanneau({ slug, facture: f, document, statut, societeNom, droits, onMaj, onSupprimee, onTelecharger, onClose }: Props) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [paiement, setPaiement] = useState<{ date: string; montant: string; mode: ModePaiement | '' } | null>(null);
  const [relance, setRelance] = useState<string | null>(null);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose]);

  async function agir(fn: () => Promise<void>) {
    setEnCours(true);
    setErreur(null);
    try {
      await fn();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  const brouillon = f.statut === 'brouillon';
  const directeAValider = brouillon && !!f.dossierCrm;
  const pct = f.montantTtc > 0 ? Math.min(100, Math.round((f.montantPaye / f.montantTtc) * 100)) : 0;
  const encaissable = f.statut === 'emise' && !f.estAvoir && f.resteAPayer > 0;
  const montantSaisi = paiement ? Number(paiement.montant.replace(/\s/g, '')) : 0;

  return (
    <div className="fiche-crm-fond" onClick={onClose}>
      <aside className="fiche-crm" role="dialog" aria-modal="true" aria-labelledby="fp-facture" onClick={(e) => e.stopPropagation()}>
        <header className="fiche-crm-entete">
          <div>
            <p className="fiche-crm-titre">{f.estAvoir ? 'Avoir' : 'Facture'}</p>
            <h2 id="fp-facture" className="fiche-crm-code fac-titre">
              {f.reference ?? 'Brouillon'}
              <span className={`pill ${statut.classe}`}>{statut.libelle}</span>
            </h2>
            <p className="fiche-crm-meta">
              {[
                f.client?.nom,
                f.dossierCrm?.code ?? f.projet?.code,
                f.emiseLe ? `émise le ${jjmmaaaa(f.emiseLe)}` : `préparée le ${jjmmaaaa(f.creeLe)} · référence attribuée à la validation`,
                f.echeanceLe && `échéance ${jjmmaaaa(f.echeanceLe)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {directeAValider && (
          <div className="fiche-crm-alerte" role="note">
            <strong>
              Préparée par {societeNom} · à valider par le CFO avant émission. Elle n’est ni envoyée ni comptée tant qu’elle
              n’est pas validée.
            </strong>
          </div>
        )}

        {document && (
          <div className="fac-document">
            <DocumentFacturation {...document} />
          </div>
        )}

        {!f.estAvoir && f.statut !== 'brouillon' && (
          <section className="fiche-crm-section">
            <div className="fiche-crm-titre-ligne">
              <h3 className="fiche-crm-titre">Encaissements</h3>
              <strong>
                {formatMontant(f.montantPaye)} / {formatMontant(f.montantTtc)}
              </strong>
            </div>
            <div className="po-barre" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="fiche-crm-titre-ligne">
              <span>Reste dû</span>
              <strong className="nfd-ttc">{formatMontant(f.resteAPayer)}</strong>
            </div>
            {f.paiements.length === 0 ? (
              <p className="fiche-crm-aide">Aucun encaissement enregistré.</p>
            ) : (
              <ul className="fiche-crm-historique">
                {f.paiements.map((p) => (
                  <li key={p.id}>
                    <time>{jjmmaaaa(p.date)}</time>
                    <span>
                      {formatMontant(p.montant)}
                      {p.mode && ` · ${MODES_PAIEMENT[p.mode]}`}
                      {p.reference && ` · ${p.reference}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {droits.validation && encaissable && !paiement && (
              <button type="button" className="btn-ghost fac-bouton" onClick={() => setPaiement({ date: aujourdhui(), montant: String(f.resteAPayer), mode: '' })}>
                Enregistrer un encaissement
              </button>
            )}
            {paiement && (
              <div className="fac-paiement">
                <input type="date" className="field-input" aria-label="Date" value={paiement.date} onChange={(e) => setPaiement({ ...paiement, date: e.target.value })} />
                <input className="field-input" aria-label="Montant" inputMode="numeric" value={paiement.montant} onChange={(e) => setPaiement({ ...paiement, montant: e.target.value })} />
                <select className="field-input" aria-label="Mode" value={paiement.mode} onChange={(e) => setPaiement({ ...paiement, mode: e.target.value as ModePaiement | '' })}>
                  <option value="">Mode…</option>
                  {Object.entries(MODES_PAIEMENT).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <span className="dmd-actions">
                  <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setPaiement(null)}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-primary--sm"
                    disabled={enCours || !(montantSaisi > 0) || !paiement.date}
                    onClick={() =>
                      agir(async () => {
                        onMaj(await ajouterPaiementCentrale(slug, f.id, { date: paiement.date, montant: montantSaisi, mode: paiement.mode || undefined }));
                        setPaiement(null);
                      })
                    }
                  >
                    Enregistrer
                  </button>
                </span>
              </div>
            )}
          </section>
        )}

        {relance && <p className="fiche-crm-aide" role="status">{relance}</p>}
        {erreur && <p className="field-erreur">{erreur}</p>}
        <div className="fac-actions">
          {brouillon && droits.validation && (
            <button type="button" className="btn-primary" disabled={enCours} onClick={() => agir(async () => onMaj(await emettreFactureCentrale(slug, f.id)))}>
              Valider et émettre
            </button>
          )}
          {directeAValider && droits.ecriture && (
            <button
              type="button"
              className="btn-ghost"
              disabled={enCours}
              onClick={() =>
                window.confirm('Supprimer ce brouillon de facture ? Aucun numéro n’a encore été attribué.') &&
                agir(async () => {
                  await supprimerFactureCentrale(slug, f.id);
                  onSupprimee();
                })
              }
            >
              Supprimer le brouillon
            </button>
          )}
          {f.statutEffectif === 'en_retard' && droits.ecriture && (
            <button
              type="button"
              className="btn-ghost"
              disabled={enCours}
              onClick={() =>
                agir(async () => {
                  const { envoye } = await relancerFacture(slug, f.id);
                  const client = f.client?.nom ?? 'ce client';
                  setRelance(envoye ? `Relance envoyée à ${client}.` : `E-mail non envoyé (transport indisponible) : contactez ${client} autrement.`);
                })
              }
            >
              <BellRing size={14} strokeWidth={2} aria-hidden /> Relancer
            </button>
          )}
          {f.projet && (
            <Link className="btn-ghost" href={lienFacturationProjet(slug, f.projet.id)}>
              Facturation du projet
            </Link>
          )}
          <button type="button" className="btn-ghost" onClick={onTelecharger}>
            <Download size={14} strokeWidth={2} aria-hidden /> Télécharger
          </button>
        </div>
      </aside>
    </div>
  );
}
