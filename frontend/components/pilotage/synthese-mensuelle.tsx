'use client';

import { useEffect, useState } from 'react';
import { commenterSynthese, getSyntheses, type ListeSyntheses } from '@/lib/pilotage';

const dateHeure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

// Synthèse mensuelle (revue CEO, 22/10/2026) : le tableau de bord du mois,
// assemblé par le HUB à la clôture ; le CFO peut y ajouter un commentaire.
export function SyntheseMensuelle({ slug }: { slug: string }) {
  const [liste, setListe] = useState<ListeSyntheses | null>(null);
  const [mois, setMois] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<string | null>(null); // null = lecture
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getSyntheses(slug)
      .then(setListe)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Synthèses indisponibles.'));
  }, [slug]);

  if (erreur && !liste) return <p className="field-erreur">{erreur}</p>;
  if (!liste) return <div className="skeleton admin-skeleton-panel" aria-hidden />;
  if (!liste.syntheses.length) {
    return (
      <section className="panel glass-panel pi-liste">
        <h2>Synthèse mensuelle</h2>
        <p className="pi-aide">La première synthèse sera générée par le HUB dès que le CFO aura clôturé un mois.</p>
      </section>
    );
  }
  const s = liste.syntheses.find((x) => x.mois === mois) ?? liste.syntheses[0];

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    try {
      setListe(await commenterSynthese(slug, s.mois, saisie ?? ''));
      setSaisie(null);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Le commentaire n’a pas été enregistré.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="panel glass-panel pi-liste sy">
      <header className="sy-tete">
        <div>
          <h2>Synthèse de {s.libelle}</h2>
          <p className="pi-aide">Générée par le HUB à la clôture du mois, le {dateHeure(s.genereLe)} · aucun chiffre saisi à la main.</p>
        </div>
        {liste.syntheses.length > 1 && (
          <select className="field-input sy-mois" aria-label="Mois" value={s.mois} onChange={(e) => (setMois(e.target.value), setSaisie(null))}>
            {liste.syntheses.map((x) => (
              <option key={x.mois} value={x.mois}>
                {x.libelle}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="sy-sections">
        {s.sections.map((sec) => (
          <section key={sec.titre} className="sy-section">
            <h3>{sec.titre}</h3>
            <dl>
              {sec.lignes.map((l) => (
                <div key={l.libelle} data-ton={l.ton}>
                  <dt>{l.libelle}</dt>
                  <dd>{l.valeur}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section className="sy-commentaire">
        <h3>Commentaire du CFO</h3>
        {saisie !== null ? (
          <>
            <textarea className="field-input" rows={4} maxLength={2000} value={saisie} disabled={envoi} onChange={(e) => setSaisie(e.target.value)} />
            {erreur && <p className="field-erreur">{erreur}</p>}
            <div className="pi-saisie-actions">
              <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setSaisie(null)}>
                Annuler
              </button>
              <button type="button" className="btn-primary" disabled={envoi} onClick={enregistrer}>
                {envoi ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </>
        ) : s.commentaire ? (
          <>
            <p className="sy-commentaire-texte">{s.commentaire.texte}</p>
            <p className="pi-aide">
              {s.commentaire.par ?? 'CFO'}
              {s.commentaire.le ? ` · ${dateHeure(s.commentaire.le)}` : ''}
            </p>
          </>
        ) : (
          <p className="pi-aide">Pas de commentaire{liste.peutCommenter ? '' : ' du CFO pour ce mois'}.</p>
        )}
        {saisie === null && liste.peutCommenter && (
          <button type="button" className="btn-ghost" onClick={() => setSaisie(s.commentaire?.texte ?? '')}>
            {s.commentaire ? 'Modifier le commentaire' : 'Ajouter un commentaire'}
          </button>
        )}
      </section>
    </section>
  );
}
