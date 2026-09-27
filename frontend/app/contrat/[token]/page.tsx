'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download } from 'lucide-react';
import { getContratPublic, getFichierContratPublic, signerContrat } from '@/lib/contrats';
import { formatMontant } from '@/lib/format';
import type { ContratPublic } from '@/lib/types';
import { SignaturePad } from '@/components/signature-pad';

type Props = { params: { token: string } };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Page CLIENT du contrat (étape G) — sans compte, le jeton du lien EST
// l'authentification. Consultation du contrat et de ses annexes, puis
// signature : bouton « J'accepte » ou signature tracée à l'écran (horodatée).
export default function ContratPublicPage({ params }: Props) {
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
      const f = await getFichierContratPublic(params.token, cible);
      const a = document.createElement('a');
      a.href = f.url;
      a.download = f.nom;
      a.click();
    } catch {
      setErreur('Téléchargement impossible.');
    }
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
              {contrat.offre.reference} — {formatMontant(contrat.offre.montantHt)} HT ·{' '}
              <strong>{formatMontant(contrat.offre.montantTtc)} TTC</strong>
            </p>
          </section>

          <section className="contrat-public-bloc">
            <h2>Contrat</h2>
            {contrat.contenu ? (
              <div className="contrat-texte">{contrat.contenu}</div>
            ) : contrat.document ? (
              <button type="button" className="lien-inline" onClick={() => telecharger('document')}>
                <Download size={13} strokeWidth={2} aria-hidden /> {contrat.document.nom}
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
                        <Download size={13} strokeWidth={2} aria-hidden /> {a.fichierNom}
                      </button>
                    ) : null}
                  </li>
                ))}
            </ul>
          </section>

          {contrat.statut === 'signe' ? (
            <p className="devis-public-message">
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden /> Contrat signé
              {contrat.signeLe ? ` le ${formatDate(contrat.signeLe)}` : ''}. Merci — l’équipe revient
              vers vous pour la suite.
            </p>
          ) : contrat.peutSigner ? (
            <section className="contrat-public-bloc">
              <h2>Signature</h2>
              <label className="field">
                <span className="field-label">Vos nom et prénom</span>
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
              </label>
              <div className="admin-periode-toggle" role="group" aria-label="Mode de signature">
                <button
                  type="button"
                  className={mode === 'bouton' ? 'is-active' : ''}
                  aria-pressed={mode === 'bouton'}
                  onClick={() => setMode('bouton')}
                >
                  J’accepte
                </button>
                <button
                  type="button"
                  className={mode === 'trace' ? 'is-active' : ''}
                  aria-pressed={mode === 'trace'}
                  onClick={() => setMode('trace')}
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
              {erreur && <p className="field-erreur">{erreur}</p>}
              <button type="button" className="btn-primary" disabled={busy} onClick={signer}>
                {busy ? 'Signature…' : 'Signer le contrat'}
              </button>
              <p className="field-aide">
                Votre signature est horodatée et enregistrée avec votre nom.
              </p>
            </section>
          ) : (
            <p className="devis-public-message">
              Ce contrat n’est plus disponible à la signature. Contactez {contrat.societe}.
            </p>
          )}
          {contrat.statut !== 'signe' && !contrat.peutSigner && erreur && (
            <p className="field-erreur">{erreur}</p>
          )}
        </article>
      </div>
    </main>
  );
}
