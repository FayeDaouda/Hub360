'use client';

import { useEffect, useState, use } from 'react';
import { CheckCircle2, Download } from 'lucide-react';
import { getContratPublic, getFichierContratPublic, signerContrat } from '@/lib/contrats';
import { telechargerFichier } from '@/lib/fichiers';
import { formatAmount } from '@/lib/format';
import type { ContratPublic } from '@/lib/types';
import { SignaturePad } from '@/components/signature-pad';
import { formatLongDate } from '@/lib/dates';
import { Field, FieldError } from '@/components/ui/field';

type Props = { params: Promise<{ token: string }> };

// Page CLIENT du contrat (étape G) — sans compte, le jeton du lien EST
// l'authentification. Consultation du contrat et de ses annexes, puis
// signature : bouton « J'accepte » ou signature tracée à l'écran (horodatée).
export default function ContratPublicPage(props: Props) {
  const params = use(props.params);
  const [contrat, setContrat] = useState<ContratPublic | null | undefined>(undefined);
  const [nom, setNom] = useState('');
  const [lu, setLu] = useState(false);
  const [mode, setMode] = useState<'bouton' | 'trace'>('bouton');
  const [trace, setTrace] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getContratPublic(params.token)
      .then(setContrat)
      .catch(() => setContrat(null));
  }, [params.token]);

  // Fichiers (data URI) récupérés à la demande — téléchargement direct.
  async function telecharger(cible: string) {
    setErreur(null);
    try {
      telechargerFichier(await getFichierContratPublic(params.token, cible));
    } catch {
      setErreur('Téléchargement impossible.');
    }
  }

  // Le pavé est démonté hors mode tracé et revient VIDE : on oublie le tracé
  // précédent, sinon « Signer » enverrait une signature que le client ne
  // voit plus à l'écran.
  function changerMode(m: 'bouton' | 'trace') {
    setMode(m);
    setTrace(null);
    setErreur(null);
  }

  async function signer() {
    if (nom.trim().length < 2) return setErreur('Indiquez vos nom et prénom.');
    if (!lu) return setErreur('Confirmez avoir lu le contrat et ses annexes.');
    if (mode === 'trace' && !trace) return setErreur('Tracez votre signature dans le cadre.');
    setBusy(true);
    setErreur(null);
    try {
      setContrat(
        await signerContrat(params.token, {
          mode,
          nom: nom.trim(),
          signatureTrace: mode === 'trace' ? trace! : undefined,
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La signature a échoué.');
    } finally {
      setBusy(false);
    }
  }

  if (contrat === undefined) {
    return (
      <main className="devis-public-page">
        <div className="devis-public-doc skeleton" style={{ height: 560 }} aria-hidden />
      </main>
    );
  }
  if (contrat === null) {
    return (
      <main className="devis-public-page">
        <div className="devis-public-doc devis-public-introuvable">
          <h1>Contrat introuvable</h1>
          <p>Ce lien n’est plus valable. Contactez la société qui vous l’a envoyé.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="devis-public-page">
      <div className="devis-public-page-corps">
        <article className="devis-public-doc contrat-public">
          <header className="contrat-public-tete">
            <p className="devis-public-banniere-label">{contrat.societe}</p>
            <h1>Contrat — {contrat.codeDossier}</h1>
            <p className="cell-sub">
              {contrat.clientNom} · {contrat.programme}
            </p>
          </header>

          <section className="contrat-public-bloc">
            <h2>Offre acceptée</h2>
            <p>
              {contrat.offre.reference} — {formatAmount(contrat.offre.montantHt)} HT ·{' '}
              <strong>{formatAmount(contrat.offre.montantTtc)} TTC</strong>
            </p>
          </section>

          <section className="contrat-public-bloc">
            <h2>Contrat</h2>
            {contrat.contenu ? (
              <div className="contrat-texte">{contrat.contenu}</div>
            ) : contrat.document ? (
              <button type="button" className="lien-inline" onClick={() => telecharger('document')}>
                <Download size={13} aria-hidden /> {contrat.document.nom}
              </button>
            ) : null}
            <p className="field-aide">
              Pour {contrat.societe} : {contrat.signataire.nom}, {contrat.signataire.fonction}.
            </p>
          </section>

          <section className="contrat-public-bloc">
            <h2>Annexes</h2>
            <ul className="contrat-annexes">
              {contrat.annexes
                .filter((a) => a.statut !== 'non_necessaire')
                .map((a) => (
                  <li key={a.id}>
                    <span>{a.libelle}</span>
                    {a.automatique === 'offre' ? (
                      <span className="cell-sub">ci-dessus</span>
                    ) : a.fichierNom ? (
                      <button type="button" className="lien-inline" onClick={() => telecharger(a.id)}>
                        <Download size={13} aria-hidden /> {a.fichierNom}
                      </button>
                    ) : null}
                  </li>
                ))}
            </ul>
          </section>

          {contrat.statut === 'signe' ? (
            <p className="devis-public-message">
              <CheckCircle2 size={16} aria-hidden /> Contrat signé
              {contrat.signeLe ? ` le ${formatLongDate(contrat.signeLe)}` : ''}. Merci — l’équipe revient vers vous pour
              la suite.
            </p>
          ) : contrat.peutSigner ? (
            <section className="contrat-public-bloc">
              <h2>Signature</h2>
              <Field label="Vos nom et prénom">
                <input
                  className="field-input"
                  value={nom}
                  onChange={(e) => {
                    setNom(e.target.value);
                    setErreur(null);
                  }}
                  maxLength={120}
                  autoComplete="name"
                />
              </Field>
              <div className="admin-periode-toggle" role="group" aria-label="Mode de signature">
                <button
                  type="button"
                  className={mode === 'bouton' ? 'is-active' : ''}
                  aria-pressed={mode === 'bouton'}
                  onClick={() => changerMode('bouton')}
                >
                  J’accepte
                </button>
                <button
                  type="button"
                  className={mode === 'trace' ? 'is-active' : ''}
                  aria-pressed={mode === 'trace'}
                  onClick={() => changerMode('trace')}
                >
                  Signer à la main
                </button>
              </div>
              {mode === 'trace' && (
                <SignaturePad
                  onChange={(t) => {
                    setTrace(t);
                    setErreur(null);
                  }}
                />
              )}
              <label className="contrat-public-accord">
                <input
                  type="checkbox"
                  checked={lu}
                  onChange={(e) => {
                    setLu(e.target.checked);
                    setErreur(null);
                  }}
                />
                <span>J’ai lu le contrat et ses annexes, et je les accepte.</span>
              </label>
              {erreur && <FieldError>{erreur}</FieldError>}
              <button type="button" className="btn-primary" disabled={busy} onClick={signer}>
                {busy ? 'Signature…' : 'Signer le contrat'}
              </button>
              <p className="field-aide">Votre signature est horodatée et enregistrée avec votre nom.</p>
            </section>
          ) : (
            <p className="devis-public-message">
              Ce contrat n’est plus disponible à la signature. Contactez {contrat.societe}.
            </p>
          )}
          {contrat.statut !== 'signe' && !contrat.peutSigner && erreur && <FieldError>{erreur}</FieldError>}
        </article>
      </div>
    </main>
  );
}
