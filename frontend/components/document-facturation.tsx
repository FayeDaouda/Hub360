import { CompanyAvatar } from '@/components/ui/avatar';
import { formatAmount, plural } from '@hub/domain';
import { Pill } from '@/components/ui/pill';

// Rendu visuel PARTAGÉ d'un document de facturation (Devis ou Facture) —
// utilisé tel quel sur la page publique du devis (cf. app/devis/[token]) ET
// portalé plein écran pour l'impression admin (cf. ImpressionDocument). Un
// seul endroit qui sait à quoi « ressemble » un document HUB — jamais
// dupliqué entre les deux usages. Purement présentationnel : pas de bouton,
// pas d'état — l'appelant décide de ce qui entoure le document (actions,
// message de statut…).

export type LigneDocument = {
  id: string;
  designation: string;
  // Précision sous la désignation — « 250 m² × 2 planches » pour une ligne de
  // conception (sa quantité seule, 500, ne se lit pas). Fournie telle quelle
  // (vue publique) ou déduite de surfaceM2 / planches (vue admin).
  detail?: string | null;
  surfaceM2?: number | null;
  planches?: number | null;
  quantite: number;
  prixUnitaire: number;
  montantHt: number;
};

function detailLigne(l: LigneDocument): string | null {
  if (l.detail) return l.detail;
  if (l.surfaceM2 && l.planches) {
    return `${l.surfaceM2} m² × ${plural(l.planches, 'planche')}`;
  }
  return null;
}

export type DocumentFacturationProps = {
  typeDocument: 'Devis' | 'Facture';
  societe: {
    nom: string;
    logoUrl: string | null;
    logoUrlSombre: string | null;
    couleurMarque: string | null;
    icone: string | null;
    // Pied du document (identifiants légaux, coordonnées) et rappel des
    // pénalités sur une facture — absents = rien d'affiché.
    mentionsLegales?: string | null;
    coordonnees?: string | null;
    penaliteRetardMensuelle?: number | null;
  };
  reference: string | null;
  statutLabel: string;
  statutClasse: string; // pill--xxx
  dateEmission: string | null; // formatée par l'appelant (ex. « 19 septembre 2026 »)
  dateValidite?: string | null; // devis seulement, déjà formatée
  dateEcheance?: string | null; // facture seulement, déjà formatée
  estAvoir?: boolean; // un avoir ne porte pas de rappel de pénalités
  clientNom: string;
  objet?: string;
  lignes: LigneDocument[];
  montantHt: number;
  montantTva: number;
  montantTtc: number;
};

export function DocumentFacturation({
  typeDocument,
  societe,
  reference,
  statutLabel,
  statutClasse,
  dateEmission,
  dateValidite,
  dateEcheance,
  estAvoir = false,
  clientNom,
  objet,
  lignes,
  montantHt,
  montantTva,
  montantTtc,
}: DocumentFacturationProps) {
  // Dégradé sombre → couleur de marque de la société émettrice (jamais une
  // palette HUB en dur) — cf. cadrage « Devis » §page publique.
  const gradient = `linear-gradient(135deg, #17171a 0%, ${societe.couleurMarque || '#4b4b52'} 100%)`;

  return (
    <div className="devis-public-doc">
      <header className="devis-public-banniere" style={{ background: gradient }}>
        <div className="devis-public-banniere-marque">
          <CompanyAvatar company={societe} size="lg" theme="glass" />
          <span>{societe.nom}</span>
        </div>
        <div className="devis-public-banniere-bas">
          <div>
            <p className="devis-public-banniere-label">{typeDocument}</p>
            <h1># {reference ?? '—'}</h1>
          </div>
          <dl className="devis-public-banniere-infos">
            {dateEmission && (
              <div>
                <dt>Date</dt>
                <dd>{dateEmission}</dd>
              </div>
            )}
            {dateValidite && (
              <div>
                <dt>Valable jusqu’au</dt>
                <dd>{dateValidite}</dd>
              </div>
            )}
            {dateEcheance && (
              <div>
                <dt>Échéance</dt>
                <dd>{dateEcheance}</dd>
              </div>
            )}
            <div>
              <dt>{typeDocument === 'Devis' ? 'Devis pour' : 'Facturé à'}</dt>
              <dd>{clientNom}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="devis-public-corps">
        <div className="devis-public-corps-tete">
          {objet && <p className="devis-public-objet">{objet}</p>}
          <Pill className={statutClasse}>{statutLabel}</Pill>
        </div>

        <table className="devis-public-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Désignation</th>
              <th>P.U. HT</th>
              <th>Qté</th>
              <th>Total HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.id}>
                <td>{String(i + 1).padStart(2, '0')}</td>
                <td>
                  {l.designation}
                  {detailLigne(l) && <span className="cell-sub">{detailLigne(l)}</span>}
                </td>
                <td>{formatAmount(l.prixUnitaire)}</td>
                <td>{l.quantite}</td>
                <td>{formatAmount(l.montantHt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="devis-public-recap">
          <div className="devis-public-recap-ligne">
            <span>Sous-total HT</span>
            <span>{formatAmount(montantHt)}</span>
          </div>
          <div className="devis-public-recap-ligne">
            <span>TVA</span>
            <span>{formatAmount(montantTva)}</span>
          </div>
          <div className="devis-public-recap-total" style={{ background: gradient }}>
            <span>Total TTC</span>
            <span>{formatAmount(montantTtc)}</span>
          </div>
        </div>
      </div>

      {/* Conditions rappelées (CGV de la société : validité art. 14,
          pénalités art. 13), puis mentions légales et coordonnées. */}
      <footer className="document-pied">
        {typeDocument === 'Devis' && dateValidite && (
          <p>
            Offre valable jusqu’au {dateValidite}. Passé ce délai, les prix et conditions sont susceptibles de révision.
          </p>
        )}
        {typeDocument === 'Facture' && !estAvoir && societe.penaliteRetardMensuelle != null && (
          <p>
            Tout retard de paiement au-delà de l’échéance entraîne des pénalités de{' '}
            {String(societe.penaliteRetardMensuelle).replace('.', ',')} % par mois sur les sommes dues.
          </p>
        )}
        {societe.mentionsLegales && <p className="document-pied-legal">{societe.mentionsLegales}</p>}
        {societe.coordonnees && <p className="document-pied-legal">{societe.coordonnees}</p>}
      </footer>
      <p className="devis-public-pied">{typeDocument} généré via HUB360°</p>
    </div>
  );
}
