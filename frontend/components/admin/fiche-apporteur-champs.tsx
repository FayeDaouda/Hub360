'use client';

import { PAS_COMMISSION, type ApporteurSaisi, type Projet } from '@/lib/types';

// Saisie de la fiche apporteur d'affaire (maquette « Nouveau projet »,
// oct. 2026) — partagée par la modale de création et la modification par le
// COO sur la fiche. Tout en texte, comme les champs eux-mêmes ; « commission »
// = '' tant que rien n'est choisi.
export type SaisieApporteur = {
  aucun: boolean;
  nom: string;
  structure: string;
  telephone: string;
  email: string;
  commission: string;
};

export const SAISIE_APPORTEUR_VIDE: SaisieApporteur = {
  aucun: false,
  nom: '',
  structure: '',
  telephone: '',
  email: '',
  commission: '',
};

// Fiche actuelle d'un dossier, pour la modifier. Un apporteur interne
// (dossier antérieur) n'est plus saisissable : on repart d'une fiche vide.
export function saisieDepuisProjet(p: Projet): SaisieApporteur {
  const ap = p.apporteur;
  if (!ap) return { ...SAISIE_APPORTEUR_VIDE, aucun: true };
  if (ap.type === 'interne') return SAISIE_APPORTEUR_VIDE;
  return {
    aucun: false,
    nom: ap.nom,
    structure: ap.structure ?? '',
    telephone: ap.telephone ?? '',
    email: ap.email ?? '',
    commission: p.commissionApporteur == null ? '' : String(p.commissionApporteur),
  };
}

// null = fiche incomplète : un apporteur sans nom ou sans % attribué.
export function versApporteurSaisi(s: SaisieApporteur): ApporteurSaisi | null {
  if (s.aucun) return { type: 'aucun' };
  if (!s.nom.trim() || !s.commission) return null;
  return {
    type: 'externe',
    nom: s.nom.trim(),
    structure: s.structure.trim() || undefined,
    telephone: s.telephone.trim() || undefined,
    email: s.email.trim() || undefined,
    commission: Number(s.commission),
  };
}

type Props = {
  saisie: SaisieApporteur;
  onChange: (saisie: SaisieApporteur) => void;
  idPrefixe: string; // ids uniques des champs (la modale et la fiche coexistent)
  desactive?: boolean;
};

export function FicheApporteurChamps({ saisie, onChange, idPrefixe, desactive }: Props) {
  const maj = (champs: Partial<SaisieApporteur>) => onChange({ ...saisie, ...champs });
  const id = (champ: string) => `${idPrefixe}-${champ}`;

  return (
    <>
      <label className="fiche-apporteur-case">
        <input
          type="checkbox"
          checked={saisie.aucun}
          onChange={(e) => maj({ aucun: e.target.checked })}
          disabled={desactive}
        />
        Aucun apporteur (affaire directe)
      </label>

      {!saisie.aucun && (
        <div className="fiche-apporteur-grille">
          <div className="field">
            <label className="field-label" htmlFor={id('nom')}>
              Nom et prénom
            </label>
            <input
              id={id('nom')}
              className="field-input"
              value={saisie.nom}
              onChange={(e) => maj({ nom: e.target.value })}
              placeholder="ex. Aïssatou Ba"
              maxLength={120}
              disabled={desactive}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id('structure')}>
              Structure / relation
            </label>
            <input
              id={id('structure')}
              className="field-input"
              value={saisie.structure}
              onChange={(e) => maj({ structure: e.target.value })}
              placeholder="ex. Notaire, partenaire"
              maxLength={120}
              disabled={desactive}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id('tel')}>
              Téléphone
            </label>
            <input
              id={id('tel')}
              className="field-input"
              type="tel"
              value={saisie.telephone}
              onChange={(e) => maj({ telephone: e.target.value })}
              placeholder="+221 …"
              maxLength={40}
              disabled={desactive}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id('email')}>
              E-mail
            </label>
            <input
              id={id('email')}
              className="field-input"
              type="email"
              value={saisie.email}
              onChange={(e) => maj({ email: e.target.value })}
              placeholder="nom@domaine.com"
              maxLength={120}
              disabled={desactive}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id('pct')}>
              % attribué
            </label>
            <select
              id={id('pct')}
              className="field-input"
              value={saisie.commission}
              onChange={(e) => maj({ commission: e.target.value })}
              disabled={desactive}
            >
              <option value="">— Choisir —</option>
              {PAS_COMMISSION.map((p) => (
                <option key={p} value={p}>
                  {String(p).replace('.', ',')} %
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </>
  );
}
