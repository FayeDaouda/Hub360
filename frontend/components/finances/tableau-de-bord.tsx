'use client';

import type { ReactNode } from 'react';
import { clientsPrincipaux, facturesOuvertes, produitsPrincipaux, ventesMensuelles, type Barre, type Tranche } from '@/lib/finances';
import { formatMontant } from '@/lib/format';
import type { Devis, FactureCentrale, ProduitService } from '@/lib/types';

type Props = { devis: Devis[]; factures: FactureCentrale[]; catalogue: ProduitService[] };

// Finances · Tableau de bord (maquette du boss, oct. 2026) : factures
// ouvertes, clients et produits principaux, ventes des 12 derniers mois —
// calculés sur les listes déjà chargées par la page.
export function TableauDeBordFinances({ devis, factures, catalogue }: Props) {
  const ouvertes = facturesOuvertes(factures);
  const ventes = ventesMensuelles(factures);
  return (
    <div className="fin-tdb">
      <section className="panel glass-panel fin-carte fin-ouvertes">
        <div className="fin-ouvertes-liste">
          <h2 className="fin-carte-titre">Factures ouvertes</h2>
          <ul>
            <LigneOuverte ton="non-echue" libelle="Non échues" t={ouvertes.nonEchues} />
            <LigneOuverte ton="retard" libelle="En retard (moins de 30 jours)" t={ouvertes.retardMoins30} />
            <LigneOuverte ton="retard-long" libelle="En retard (plus de 30 jours)" t={ouvertes.retardPlus30} />
          </ul>
        </div>
        <Anneau tranches={[ouvertes.nonEchues, ouvertes.retardMoins30, ouvertes.retardPlus30]} total={ouvertes.total} />
      </section>

      <BarresCarte
        titre="Clients principaux"
        sousTitre="12 derniers mois · facturé TTC et part encaissée"
        barres={clientsPrincipaux(factures)}
        vide="Aucune facture émise sur les 12 derniers mois."
        pied={
          <p className="fin-legende">
            <span className="fin-legende-encaisse">Encaissé</span>
            <span className="fin-legende-facture">Facturé</span>
          </p>
        }
      />

      <section className="panel glass-panel fin-carte fin-ventes">
        <div className="fin-ventes-tete">
          <div>
            <h2 className="fin-carte-titre">Ventes</h2>
            <p className="fin-carte-sous-titre">12 derniers mois · facturé TTC</p>
            <p className="fin-ventes-total">{formatMontant(ventes.reduce((s, m) => s + m.facture, 0))}</p>
          </div>
          <div>
            <p className="fin-carte-sous-titre">Ce mois</p>
            <p className="fin-ventes-mois">{formatMontant(ventes[ventes.length - 1].facture)}</p>
          </div>
        </div>
        <Histogramme mois={ventes} />
      </section>

      <BarresCarte
        titre="Produits principaux"
        sousTitre="12 derniers mois · facturé HT par prestation"
        barres={produitsPrincipaux(factures, devis, catalogue)}
        vide="Aucune prestation facturée sur les 12 derniers mois."
        pied={<p className="fin-pied">Répartition des factures selon les lignes des devis acceptés (au prorata des tranches).</p>}
      />
    </div>
  );
}

function LigneOuverte({ ton, libelle, t }: { ton: string; libelle: string; t: Tranche }) {
  return (
    <li>
      <span className={`fin-compteur fin-compteur--${ton}`}>{t.nombre}</span>
      <span>{libelle}</span>
      <strong>{formatMontant(t.montant)}</strong>
    </li>
  );
}

// Anneau des factures ouvertes : non échues, retard < 30 j, retard > 30 j,
// dans le sens horaire depuis le haut.
function Anneau({ tranches, total }: { tranches: Tranche[]; total: Tranche }) {
  const r = 80;
  const c = 2 * Math.PI * r;
  let cumul = 0;
  return (
    <div className="fin-anneau">
      <svg viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r={r} className="fin-anneau-piste" />
        {total.montant > 0 &&
          tranches.map((t, i) => {
            const part = (t.montant / total.montant) * c;
            const segment = (
              <circle
                key={i}
                cx="100"
                cy="100"
                r={r}
                className={`fin-anneau-segment fin-anneau-segment--${i}`}
                strokeDasharray={`${part} ${c - part}`}
                strokeDashoffset={-cumul}
                transform="rotate(-90 100 100)"
              />
            );
            cumul += part;
            return segment;
          })}
      </svg>
      <p>
        <span>
          {total.nombre} facture{total.nombre > 1 ? 's' : ''} ouverte{total.nombre > 1 ? 's' : ''}
        </span>
        <strong>{formatMontant(total.montant)}</strong>
      </p>
    </div>
  );
}

// Barres horizontales (clients, produits) : piste = facturé, relatif au premier ;
// part verte = encaissé.
function BarresCarte({ titre, sousTitre, barres, vide, pied }: { titre: string; sousTitre: string; barres: Barre[]; vide: string; pied: ReactNode }) {
  const max = barres[0]?.facture ?? 0;
  return (
    <section className="panel glass-panel fin-carte fin-barres-carte">
      <h2 className="fin-carte-titre">{titre}</h2>
      <p className="fin-carte-sous-titre">{sousTitre}</p>
      {barres.length === 0 ? (
        <p className="fin-pied">{vide}</p>
      ) : (
        <ul className="fin-barres">
          {barres.map((b) => (
            <li key={b.cle} title={`${b.detail ? `${b.libelle} · ${b.detail}` : b.libelle} · facturé ${formatMontant(b.facture)} · encaissé ${formatMontant(b.encaisse)}`}>
              <span className="fin-barres-libelle">
                {b.libelle}
                {b.detail && <span className="fin-barres-detail">{b.detail}</span>}
              </span>
              <span className="fin-jauge" aria-hidden>
                <span className="fin-jauge-facture" style={{ width: `${(b.facture / max) * 100}%` }} />
                <span className="fin-jauge-encaisse" style={{ width: `${(Math.max(0, b.encaisse) / max) * 100}%` }} />
              </span>
              <strong>{formatMontant(b.facture)}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="fin-carte-pied">{pied}</div>
    </section>
  );
}

// Histogramme des ventes : une colonne par mois, facturé (gris) dont encaissé
// (vert). Axe des mois sous les colonnes (« oct. », année ajoutée en janvier
// et sur la première colonne) ; le détail chiffré de chaque mois est lu par
// les lecteurs d'écran (texte masqué) et affiché au survol.
function Histogramme({ mois }: { mois: Barre[] }) {
  const max = Math.max(...mois.map((m) => m.facture), 0);
  return (
    <div className="fin-histo-cadre">
      <div className="fin-histo">
        <div className="fin-histo-grille" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="fin-histo-zero" aria-hidden>
          0
        </span>
        <ol className="fin-histo-barres">
          {mois.map((m) => {
            const detail = `${m.libelle} · facturé ${formatMontant(m.facture)} · encaissé ${formatMontant(m.encaisse)}`;
            return (
              <li key={m.cle} title={detail}>
                <span className="sr-only">{detail}</span>
                {m.facture > 0 && (
                  <span className="fin-histo-facture" style={{ height: `${(m.facture / max) * 100}%` }}>
                    <span className="fin-histo-encaisse" style={{ height: `${(Math.max(0, m.encaisse) / m.facture) * 100}%` }} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="fin-histo-mois" aria-hidden>
        {mois.map((m, i) => (
          <li key={m.cle}>{moisCourt(m.cle, i === 0)}</li>
        ))}
      </ol>
    </div>
  );
}

// « 2026-10 » → « oct. » ; « janv. 27 » en janvier et sur la première colonne,
// pour situer l'année sans charger l'axe.
function moisCourt(cle: string, premier: boolean): string {
  const [a, m] = cle.split('-').map(Number);
  const libelle = new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' });
  return premier || m === 1 ? `${libelle} ${String(a).slice(2)}` : libelle;
}
