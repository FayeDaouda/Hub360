'use client';

import { CGV_PAR_SOCIETE } from '@/lib/cgv';
import { formatAmount, formatNumber } from '@/lib/format';
import { TAUX_TVA_DEFAUT, type EcheanceOffre, type Societe } from '@/lib/types';

// Règles reprises dans les conditions particulières (CGV art. 12 à 14) et le
// délai de paiement de chaque facture.
const VALIDITE_JOURS = 7;
const MISE_EN_DEMEURE_JOURS = 15;
const PAIEMENT_JOURS = 15;

const pourcent = (n: number) => `${formatNumber(n)} %`;

type Props = {
  societe: Societe;
  totaux: { ht: number; tva: number; ttc: number };
  echeancier: EcheanceOffre[];
  delais: Record<string, string>;
  onDelai: (cle: string, valeur: string) => void;
};

// Fin du document d'offre (maquette Finances) : totaux, 3 · échéancier (seul
// le délai prévisionnel se saisit), note de bas de page, 4 · conditions
// particulières, Annexe 2 · CGV.
export function OffreAnnexes({ societe, totaux, echeancier, delais, onDelai }: Props) {
  const cgv = CGV_PAR_SOCIETE[societe.slug];
  const totalEcheancier = echeancier.reduce((s, e) => s + e.montantTtc, 0);
  const resume = resumeEcheancier(echeancier);
  const penalite = societe.penaliteRetardMensuelle;

  return (
    <>
      <div className="offre-totaux">
        <p>
          <span>Total HT</span>
          <strong>{formatAmount(totaux.ht)}</strong>
        </p>
        <p>
          <span>TVA {TAUX_TVA_DEFAUT} %</span>
          <strong>{formatAmount(totaux.tva)}</strong>
        </p>
        <p className="offre-totaux-ttc">
          <span>Total TTC</span>
          <strong>{formatAmount(totaux.ttc)}</strong>
        </p>
      </div>

      <section className="offre-section">
        <div className="offre-titre-ligne">
          <h3 className="offre-titre-section">3 · Échéancier de paiement</h3>
          <span className="offre-echeances-total">
            {echeancier.length} échéance(s) · {formatAmount(totalEcheancier)} TTC
          </span>
        </div>
        <div className="offre-echeancier" role="table" aria-label="Échéancier de paiement">
          <div className="offre-echeance offre-echeance--tete" role="row">
            <span role="columnheader">Famille</span>
            <span role="columnheader">Échéance</span>
            <span role="columnheader">Part</span>
            <span role="columnheader">Déclencheur</span>
            <span role="columnheader">Délai (j)</span>
            <span role="columnheader" className="offre-num">
              Montant TTC
            </span>
          </div>
          {echeancier.map((e, i) => (
            <div className="offre-echeance" role="row" key={e.cle ?? `mois-${i}`}>
              <span role="cell" data-label="Famille">
                {e.famille}
              </span>
              <span role="cell" data-label="Échéance">
                {e.echeance}
              </span>
              <span role="cell" data-label="Part">
                {e.part == null ? '—' : pourcent(e.part)}
              </span>
              <span role="cell" data-label="Déclencheur">
                {e.declencheur}
              </span>
              <span role="cell" data-label="Délai (j)">
                {e.cle ? (
                  <input
                    type="number"
                    min="0"
                    max="730"
                    step="1"
                    className="field-input"
                    value={delais[e.cle] ?? ''}
                    placeholder="j"
                    aria-label={`Délai prévisionnel, ${e.famille} ${e.echeance} (jours après la signature)`}
                    onChange={(ev) => onDelai(e.cle!, ev.target.value)}
                  />
                ) : (
                  '—'
                )}
              </span>
              <strong role="cell" data-label="Montant TTC" className="offre-num">
                {formatAmount(e.montantTtc)}
              </strong>
            </div>
          ))}
        </div>
        <p className="offre-aide">
          Échéancier imposé par les CGV et le catalogue : conception 40 / 40 / 20, DPC et SPC 50 / 50, suivi et extras
          au mois. Seul le délai prévisionnel (en jours après la signature) se renseigne ; il est validé avec l’offre,
          puis figé.
        </p>
      </section>

      {societe.mentionsLegales && (
        <p className="offre-note">
          <strong>Note de bas de page · </strong>
          {societe.mentionsLegales}. Offre valable {VALIDITE_JOURS} jours. Nous restons à votre disposition pour toute
          information complémentaire.
        </p>
      )}

      <section className="offre-section">
        <h3 className="offre-titre-section">4 · Conditions particulières</h3>
        <dl className="offre-articles">
          <div>
            <dt>
              <span className="offre-lettre">A</span> Échéancier
            </dt>
            <dd>
              {resume && `${resume}. `}Figé à la validation de l’offre ; chaque facture est émise à son déclenchement et
              payable à {PAIEMENT_JOURS} jours.
            </dd>
          </div>
          <div>
            <dt>
              <span className="offre-lettre">B</span> Validité
            </dt>
            <dd>
              Offre valable {VALIDITE_JOURS} jours à compter de son émission (CGV art. 14). Acceptation par bon pour
              accord en ligne horodaté.
            </dd>
          </div>
          {penalite != null && (
            <div>
              <dt>
                <span className="offre-lettre">C</span> Pénalités
              </dt>
              <dd>
                Retard de paiement : pénalités de {pourcent(penalite)} par mois sur les sommes dues (CGV art. 13) ;
                résiliation possible après mise en demeure de {MISE_EN_DEMEURE_JOURS} jours (art. 12).
              </dd>
            </div>
          )}
        </dl>
      </section>

      {cgv && (
        <section className="offre-section">
          <div className="offre-titre-ligne">
            <h3 className="offre-titre-section">Annexe 2 · Conditions générales de vente · édition {cgv.edition}</h3>
            <span className="offre-badge">{cgv.articles.length} articles · jointes au devis</span>
          </div>
          <dl className="offre-articles offre-articles--cgv" tabIndex={0} aria-label="Conditions générales de vente">
            {cgv.articles.map((a) => (
              <div key={a.numero}>
                <dt>
                  <span className="offre-numero">{String(a.numero).padStart(2, '0')}</span> {a.titre}
                </dt>
                <dd>
                  {a.paragraphes.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="offre-aide">
            Le client accepte les conditions particulières et les CGV avec le bon pour accord en ligne.
          </p>
        </section>
      )}
    </>
  );
}

// « Conception 40 / 40 / 20 ; DPC 50 / 50 ; suivi au mois » — repris de l'échéancier.
function resumeEcheancier(echeancier: EcheanceOffre[]): string {
  const parFamille = new Map<string, number[]>();
  let auMois = false;
  for (const e of echeancier) {
    if (e.part == null) {
      auMois = true;
      continue;
    }
    const famille = e.famille.split(' · ')[0] === 'Conception' ? 'Conception' : e.famille.split(' · ').pop()!;
    parFamille.set(famille, [...(parFamille.get(famille) ?? []), e.part]);
  }
  const morceaux = [...parFamille.entries()].map(([f, parts]) =>
    parts.length > 1 ? `${f} ${parts.join(' / ')}` : `${f} en une facture`,
  );
  if (auMois) morceaux.push('suivi et extras au mois');
  return morceaux.join(' ; ');
}
