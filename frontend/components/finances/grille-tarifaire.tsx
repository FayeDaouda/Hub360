'use client';

import { Lock } from 'lucide-react';
import { TAUX_COORDINATION_ET, identiteSociete } from '@/lib/finances';
import { formatAmount, formatNumber } from '@hub/domain';
import { TAUX_TVA_DEFAUT, type ProduitService, type Societe } from '@/lib/types';
import { CloseButton, Drawer } from '@/components/ui/dialog';

// Ordre de la grille (maquette) : conception, images, suivi, reprises, puis
// prestations au mois. Les prestations sans prix fixe (forfaits selon le
// projet, reprise majeure au tarif CO) n'y figurent pas.
const ORDRE_FAMILLES = ['CO', 'IM', 'SU', 'TS', 'EX'];
const UNITES: Record<string, string> = {
  m2: 'F/m²',
  piece: 'F/pièce',
  mois: 'F/mois',
  reprise: 'F/reprise',
  forfait: 'Forfait',
};

const pourcent = (n: number) => `${formatNumber(n)} %`;

type Props = { societe: Societe; catalogue: ProduitService[]; onClose: () => void };

// Grille tarifaire et société (maquette Finances, oct. 2026) : lecture seule,
// prix verrouillés du catalogue, paramètres de facturation et renseignements
// repris sur les devis et factures.
export function GrilleTarifaire({ societe, catalogue, onClose }: Props) {
  const rang = (p: ProduitService) => {
    const i = ORDRE_FAMILLES.indexOf(p.famille ?? '');
    return i < 0 ? ORDRE_FAMILLES.length : i;
  };
  const tarifs = catalogue
    .filter((p) => p.prixUnitaire != null)
    .sort((a, b) => rang(a) - rang(b) || (a.code ?? '').localeCompare(b.code ?? ''));
  const id = identiteSociete(societe.mentionsLegales, societe.coordonnees);
  const parametres: { libelle: string; unite: string; valeur: number | null }[] = [
    { libelle: 'Coordination études ETS/ETB/ETL', unite: '% ajouté au prix du bureau', valeur: TAUX_COORDINATION_ET },
    { libelle: 'TVA', unite: '%', valeur: TAUX_TVA_DEFAUT },
    { libelle: 'Pénalités de retard', unite: '% par mois', valeur: societe.penaliteRetardMensuelle },
  ];
  const renseignements: [string, string | null][] = [
    ['Raison sociale', id.raisonSociale],
    ['Adresse', id.adresse],
    ['Ville', id.ville],
    ['NINEA', id.ninea],
    ['COFI', id.cofi],
    ['RCCM', id.rccm],
    ['Capital', id.capital],
    ['Téléphone', id.telephone],
    ['E-mail', id.email],
  ];

  return (
    <Drawer onClose={onClose} as="aside" className="grille" labelledBy="grille-titre">
      <header className="grille-tete">
        <h2 id="grille-titre">Grille tarifaire et société</h2>
        <span className="grille-verrou">Verrouillée</span>
        <CloseButton onClick={onClose} />
      </header>
      <p className="grille-intro">
        Prix figés appliqués automatiquement à tous les devis en brouillon. Un devis soumis au CFO garde les prix du
        jour de sa soumission.
      </p>

      <ul className="grille-liste">
        {tarifs.map((p) => (
          <li key={p.id}>
            <span>
              <strong>
                {p.code ? `${p.code} · ${p.designation.replace(new RegExp(`^${p.code}\\s*—\\s*`), '')}` : p.designation}
              </strong>
              <small>
                {UNITES[p.unite ?? ''] ?? p.unite}
                {p.modeCalcul === 'surface_planches' && ' (× surface × planches)'}
              </small>
            </span>
            <span className="grille-prix">
              <Lock size={12} aria-label="Verrouillé" />
              {formatAmount(p.prixUnitaire!)}
            </span>
          </li>
        ))}
        {parametres.map((x) => (
          <li key={x.libelle}>
            <span>
              <strong>{x.libelle}</strong>
              <small>{x.unite}</small>
            </span>
            <span className="grille-prix">
              <Lock size={12} aria-label="Verrouillé" />
              {x.valeur == null ? '—' : pourcent(x.valeur)}
            </span>
          </li>
        ))}
      </ul>

      <section>
        <h3 className="grille-section">Renseignements société · repris sur devis et factures</h3>
        <dl className="grille-societe">
          {renseignements.map(([libelle, valeur]) => (
            <div key={libelle}>
              <dt>{libelle}</dt>
              <dd>{valeur ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="grille-note">Modification réservée à l’administration.</p>
    </Drawer>
  );
}
