'use client';

import { useEffect, useState } from 'react';
import {
  getCommissions,
  getCoordonneesApporteur,
  LIBELLES_COORDONNEES,
  modifierCoordonneesApporteur,
  type CommissionApporteur,
  type CoordonneesApporteur,
  type FicheCoordonnees,
} from '@/lib/commissions';
import { formatAmount, formatNumber } from '@/lib/format';
import { MODES_PAIEMENT } from '@/lib/types';
import { formatDate } from '@/lib/dates';
import { Pill } from '@/components/ui/pill';

const CHAMPS = Object.keys(LIBELLES_COORDONNEES) as (keyof CoordonneesApporteur)[];

// Paiement de l'apporteur sur la fiche du dossier (revue COO, 22/10/2026) :
// ses commissions (le COO suit, le CFO paie) et ses coordonnées de paiement,
// saisies par le COO et protégées comme celles de la société. Sans le droit,
// la partie concernée n'apparaît pas.
export function PaiementApporteur({ slug, dossierId }: { slug: string; dossierId: string }) {
  const [fiche, setFiche] = useState<FicheCoordonnees | null>(null);
  const [commissions, setCommissions] = useState<CommissionApporteur[] | null>(null);
  const [saisie, setSaisie] = useState<CoordonneesApporteur | null>(null); // null = lecture
  const [confirmer, setConfirmer] = useState(false);
  const [preuve, setPreuve] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getCoordonneesApporteur(slug, dossierId)
      .then(setFiche)
      .catch(() => setFiche(null));
    getCommissions(slug)
      .then((l) => setCommissions(l.lignes.filter((c) => c.dossierId === dossierId)))
      .catch(() => setCommissions(null));
  }, [slug, dossierId]);

  if (!fiche && !commissions) return null;
  const changes = saisie && fiche ? CHAMPS.filter((c) => saisie[c].trim() !== fiche.coordonnees[c]) : [];

  async function enregistrer() {
    if (!saisie) return;
    if (!confirmer) {
      setConfirmer(true);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      setFiche(await modifierCoordonneesApporteur(slug, dossierId, { ...saisie, confirmation: preuve }));
      setSaisie(null);
      setConfirmer(false);
      setPreuve('');
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’enregistrement a échoué.');
    } finally {
      setEnvoi(false);
    }
  }

  const versees = (commissions ?? []).filter((c) => c.statut === 'payee').reduce((s, c) => s + c.montant, 0);
  const aPayer = (commissions ?? []).filter((c) => c.statut === 'a_payer').reduce((s, c) => s + c.montant, 0);

  return (
    <div className="pa-apporteur">
      {commissions && (
        <div className="pa-apporteur-bloc">
          <p className="pa-apporteur-titre">
            Commissions · {formatAmount(versees)} versées{aPayer ? ` · ${formatAmount(aPayer)} à payer` : ''}
          </p>
          {commissions.length === 0 ? (
            <p className="fiche-crm-aide">
              Aucune commission pour l’instant : elles naissent des encaissements d’honoraires (ou de la signature,
              selon le réglage du CFO).
            </p>
          ) : (
            <ul className="pa-apporteur-liste">
              {commissions.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{formatAmount(c.montant)}</strong>
                    <span className="cell-sub">
                      {formatNumber(c.taux)} % de {formatAmount(c.baseHt)} HT · exigible le {formatDate(c.exigibleLe)}
                    </span>
                  </span>
                  {c.statut === 'payee' ? (
                    <Pill tone="succes" title={c.reference || undefined}>
                      Payée le {formatDate(c.payeeLe ?? '')}
                      {c.modePaiement ? ` · ${MODES_PAIEMENT[c.modePaiement]}` : ''}
                    </Pill>
                  ) : (
                    <Pill tone="attention">À payer</Pill>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {fiche && (
        <div className="pa-apporteur-bloc">
          <p className="pa-apporteur-titre">Coordonnées de paiement</p>
          {saisie ? (
            <div className="pa-apporteur-edition">
              {CHAMPS.map((c) => (
                <label key={c} className="field">
                  <span className="field-label">{LIBELLES_COORDONNEES[c]}</span>
                  <input
                    className="field-input"
                    value={saisie[c]}
                    disabled={envoi}
                    maxLength={c === 'banque' ? 120 : 60}
                    onChange={(e) => (setSaisie({ ...saisie, [c]: e.target.value }), setConfirmer(false))}
                  />
                </label>
              ))}
              {confirmer && (
                <div className="pf-alerte" role="alert">
                  <p>
                    Vous modifiez les coordonnées de paiement de l’apporteur (
                    {changes.map((c) => LIBELLES_COORDONNEES[c]).join(', ')}). Le CFO paiera sur ces coordonnées ; le
                    CFO et le CEO seront prévenus. Vérifiez chaque chiffre.
                  </p>
                  <label className="field">
                    <span className="field-label">
                      {fiche.confirmation === 'code'
                        ? 'Code de votre application de double authentification'
                        : 'Votre mot de passe, pour confirmer'}
                    </span>
                    <input
                      className="field-input"
                      type={fiche.confirmation === 'code' ? 'text' : 'password'}
                      inputMode={fiche.confirmation === 'code' ? 'numeric' : undefined}
                      autoComplete={fiche.confirmation === 'code' ? 'one-time-code' : 'current-password'}
                      value={preuve}
                      disabled={envoi}
                      autoFocus
                      onChange={(e) => setPreuve(e.target.value)}
                    />
                  </label>
                </div>
              )}
              {erreur && <p className="field-erreur">{erreur}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={envoi}
                  onClick={() => (setSaisie(null), setConfirmer(false), setPreuve(''), setErreur(null))}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={envoi || !changes.length || (confirmer && !preuve.trim())}
                  onClick={enregistrer}
                >
                  {envoi ? 'Enregistrement…' : confirmer ? 'Confirmer' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <dl className="fiche-crm-apporteur">
                {CHAMPS.map((c) => (
                  <div key={c}>
                    <dt>{LIBELLES_COORDONNEES[c]}</dt>
                    <dd>{fiche.coordonnees[c] || '—'}</dd>
                  </div>
                ))}
              </dl>
              {fiche.peutModifier && (
                <button
                  type="button"
                  className="btn-ghost fiche-apporteur-modifier"
                  onClick={() => setSaisie({ ...fiche.coordonnees })}
                >
                  Modifier les coordonnées
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
