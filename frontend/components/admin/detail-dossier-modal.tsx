import { X } from 'lucide-react';
import {
  CATEGORIES,
  GAMMES,
  NATURES_DOSSIER,
  STANDINGS,
  STATUTS_CRM,
  STATUTS_ORDRE,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Projet,
  type StatutCrm,
} from '@/lib/types';
import { formatSurface } from '@/lib/format';

const STATUT_MODIF: Record<StatutCrm, string> = {
  nouveau: 'nouveau',
  devis_contrat: 'devis',
  valide: 'valide',
  annule: 'annule',
};

type Props = {
  projet: Projet;
  onClose: () => void;
  onChangerStatut: (statut: StatutCrm) => void;
};

// Détail d'un dossier CRM — sorti de la ligne (mobile : liste condensée à une
// ligne, cf. .crm-ligne-mobile) pour que le statut ne se change plus au fil
// d'un scroll tactile, seulement ici, volontairement.
export function DetailDossierModal({ projet, onClose, onChangerStatut }: Props) {
  return (
    <div className="modal-backdrop modal-backdrop--feuille" onClick={onClose}>
      <div
        className="modal modal--feuille"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-dossier-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="detail-dossier-titre">{projet.code}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Statut</span>
            <select
              className={`statut-select statut-select--${STATUT_MODIF[projet.statut]}`}
              value={projet.statut}
              aria-label={`Statut de ${projet.code}`}
              onChange={(e) => onChangerStatut(e.target.value as StatutCrm)}
            >
              {STATUTS_ORDRE.map((s) => (
                <option key={s} value={s}>
                  {STATUTS_CRM[projet.nature][s]}
                </option>
              ))}
            </select>
          </label>

          <div className="detail-dossier-grille">
            <div className="field">
              <span className="field-label">Programme</span>
              <span className="detail-dossier-valeur">{projet.programme}</span>
            </div>
            <div className="field">
              <span className="field-label">Client</span>
              <span className="detail-dossier-valeur">
                {projet.client.nom}
                <span className="pill pill--neutre">{TYPES_CLIENT[projet.client.type]}</span>
              </span>
            </div>
            <div className="field">
              <span className="field-label">Nature</span>
              <span className="detail-dossier-valeur">
                <span className={`pill pill--nature-${projet.nature}`}>
                  {NATURES_DOSSIER[projet.nature]}
                </span>
                <span className="cell-sub">{CATEGORIES[projet.categorie]}</span>
              </span>
            </div>
            <div className="field">
              <span className="field-label">Type</span>
              <span className="detail-dossier-valeur">{TYPES_BIEN[projet.type]}</span>
            </div>
            <div className="field">
              <span className="field-label">Localisation</span>
              <span className="detail-dossier-valeur">{projet.localisation}</span>
            </div>
            <div className="field">
              <span className="field-label">Surface terrain</span>
              <span className="detail-dossier-valeur">
                {formatSurface(projet.surfaceTerrain)}
              </span>
            </div>
            <div className="field">
              <span className="field-label">Planches</span>
              <span className="detail-dossier-valeur">{projet.nbPlanches || '—'}</span>
            </div>
            <div className="field">
              <span className="field-label">Standing</span>
              <span className="detail-dossier-valeur">{STANDINGS[projet.standing]}</span>
            </div>
            <div className="field">
              <span className="field-label">Gamme</span>
              <span className="detail-dossier-valeur">{GAMMES[projet.gamme]}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
