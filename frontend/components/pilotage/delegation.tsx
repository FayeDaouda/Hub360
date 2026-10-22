'use client';

import { useEffect, useState } from 'react';
import { UserCog } from 'lucide-react';
import { deleguer, getDelegation, revoquerDelegation, type VueDelegation } from '@/lib/pilotage';
import { ROLE_CEO } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';

const dateFr = (j: string) => j.split('-').reverse().join('/');
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Délégation du CEO (revue CEO, 22/10/2026). Le CEO : sa carte (déléguer,
// révoquer). Le délégataire : un bandeau tant que la délégation court. Les
// autres : rien.
export function Delegation({ slug }: { slug: string }) {
  const session = useSessionCourante();
  const [vue, setVue] = useState<VueDelegation | null>(null);
  const [saisie, setSaisie] = useState<{ delegataireId: string; du: string; au: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getDelegation(slug)
      .then(setVue)
      .catch(() => setVue(null));
  }, [slug]);

  if (!vue) return null;

  async function agir(action: () => Promise<VueDelegation>) {
    setEnvoi(true);
    setErreur(null);
    try {
      setVue(await action());
      setSaisie(null);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’opération a échoué.');
    } finally {
      setEnvoi(false);
    }
  }

  // Délégataire : bandeau.
  if (session.role !== ROLE_CEO) {
    const d = vue.delegations.find((x) => x.enCours);
    if (!d || vue.peutGerer) return null;
    return (
      <p className="dl-bandeau" role="status">
        <UserCog size={16} aria-hidden /> Vous remplacez le CEO jusqu’au {dateFr(d.au)} : {d.perimetre.join(', ')}. Jamais : {vue.jamais.join(', ')}.
      </p>
    );
  }

  return (
    <section className="panel glass-panel dl" aria-label="Délégation du CEO">
      <div className="dl-tete">
        <h2 className="dmd-titre">
          <UserCog size={17} aria-hidden /> Délégation pendant une absence
        </h2>
        {!saisie && vue.peutGerer && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setSaisie({ delegataireId: vue.candidats[0]?.id ?? '', du: aujourdhui(), au: aujourdhui() })}>
            Déléguer
          </button>
        )}
      </div>
      {vue.delegations.length === 0 && !saisie && <p className="dmd-note">Aucune délégation : tout ce qui vous attend reste à vous, y compris depuis votre téléphone.</p>}
      {vue.delegations.map((d) => (
        <div key={d.id} className="dl-ligne">
          <span>
            <span>
              <strong>
                {d.delegataire} ({d.role})
              </strong>{' '}
              · du {dateFr(d.du)} au {dateFr(d.au)} {d.enCours ? '· en cours' : '· à venir'}
            </span>
            <span className="cell-sub">Délégué : {d.perimetre.join(', ')}. Jamais : {vue.jamais.join(', ')}.</span>
          </span>
          {vue.peutGerer && (
            <button type="button" className="btn-ghost btn-ghost--sm" disabled={envoi} onClick={() => agir(() => revoquerDelegation(slug, d.id))}>
              Révoquer
            </button>
          )}
        </div>
      ))}
      {saisie && (
        <div className="dl-form">
          <label className="field">
            <span className="field-label">Délégataire</span>
            <select className="field-input" value={saisie.delegataireId} onChange={(e) => setSaisie({ ...saisie, delegataireId: e.target.value })}>
              {vue.candidats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.role})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Du</span>
            <input className="field-input" type="date" min={aujourdhui()} value={saisie.du} onChange={(e) => setSaisie({ ...saisie, du: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Au (inclus)</span>
            <input className="field-input" type="date" min={saisie.du} value={saisie.au} onChange={(e) => setSaisie({ ...saisie, au: e.target.value })} />
          </label>
          <p className="dmd-note dl-note">Jamais délégués : {vue.jamais.join(', ')}. Le délégataire ne décide que dans la limite de ses propres droits.</p>
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="pi-saisie-actions dl-actions">
            <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setSaisie(null)}>
              Annuler
            </button>
            <button type="button" className="btn-primary" disabled={envoi || !saisie.delegataireId} onClick={() => agir(() => deleguer(slug, saisie))}>
              {envoi ? 'Enregistrement…' : 'Déléguer'}
            </button>
          </div>
        </div>
      )}
      {!saisie && erreur && <p className="field-erreur">{erreur}</p>}
    </section>
  );
}
