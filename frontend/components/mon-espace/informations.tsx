'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { demanderPaiement, LIBELLE_PAIEMENT_SALAIRE, majCoordonnees, type ChampsPersonnels } from '@/lib/mon-espace';
import { LIBELLE_CONTRAT } from '@/lib/rh';
import type { ModePaiementSalaire, ProfilMonEspace, SituationFamiliale } from '@/lib/types';
import { formatDate } from '@hub/domain';
import { Field, FieldError } from '@/components/ui/field';

const ou = (v: string) => v.trim() || '—';
// Pièce d'identité masquée (maquette : « •••• 2211 »).
const masquer = (n: string) => (n.trim() ? `•••• ${n.trim().slice(-4)}` : '—');

const SITUATIONS: Record<SituationFamiliale, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  divorce: 'Divorcé(e)',
  veuf: 'Veuf / veuve',
};

type Champ = 'telephone' | 'emailPerso' | 'adresse' | 'contactUrgence' | 'telephoneUrgence';

// « Mon espace » · Mes informations (maquette du boss) : à gauche, ce que gère
// la RH (lecture) ; à droite, ce que le salarié modifie lui-même, enregistré
// immédiatement — sauf le moyen de paiement, soumis à la RH qui le valide
// avant la paie. Le salaire n'y figure pas.
export function MesInformations({
  slug,
  dossier,
  onMaj,
}: {
  slug: string;
  dossier: ProfilMonEspace;
  onMaj: (d: ProfilMonEspace) => void;
}) {
  const [saisies, setSaisies] = useState<Partial<Record<Champ, string>>>({});
  const [mode, setMode] = useState<ModePaiementSalaire>(dossier.paiementDemande?.mode ?? dossier.modePaiement);
  const [coordonnees, setCoordonnees] = useState(dossier.paiementDemande?.coordonnees ?? dossier.coordonneesPaiement);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null; enregistre: boolean }>({
    envoi: false,
    erreur: null,
    enregistre: false,
  });

  async function enregistrer(champs: ChampsPersonnels) {
    setEtat({ envoi: true, erreur: null, enregistre: false });
    try {
      const r = await majCoordonnees(slug, champs);
      if (r.dossier) onMaj(r.dossier);
      setEtat({ envoi: false, erreur: null, enregistre: true });
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Non enregistré.', enregistre: false });
    }
  }

  // Champ texte : enregistré à la sortie du champ, s'il a changé.
  const texte = (champ: Champ, libelle: string, o: { type?: string; long?: boolean } = {}) => {
    const valeur = saisies[champ] ?? dossier[champ];
    const props = {
      id: `mi-${champ}`,
      className: 'field-input',
      value: valeur,
      onChange: (e: { target: { value: string } }) => setSaisies((s) => ({ ...s, [champ]: e.target.value })),
      onBlur: () => {
        if (saisies[champ] !== undefined && saisies[champ]!.trim() !== dossier[champ])
          void enregistrer({ [champ]: saisies[champ] });
      },
    };
    return (
      <Field label={libelle} htmlFor={props.id}>
        {o.long ? <textarea {...props} rows={2} maxLength={300} /> : <input {...props} type={o.type ?? 'text'} />}
      </Field>
    );
  };

  async function soumettrePaiement() {
    setEtat({ envoi: true, erreur: null, enregistre: false });
    try {
      const r = await demanderPaiement(slug, { modePaiement: mode, coordonneesPaiement: coordonnees });
      if (r.dossier) onMaj(r.dossier);
      setEtat({ envoi: false, erreur: null, enregistre: false });
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Demande non envoyée.', enregistre: false });
    }
  }

  const enAttente = dossier.paiementDemande;
  const reference = enAttente ?? { mode: dossier.modePaiement, coordonnees: dossier.coordonneesPaiement };
  const paiementModifie = mode !== reference.mode || coordonnees.trim() !== reference.coordonnees;

  const rh: [string, string][] = [
    ['Matricule', dossier.matricule],
    ['Société', dossier.societe],
    ['Poste', ou(dossier.poste)],
    ['Cellule', dossier.cellule ?? 'sans cellule'],
    ['Contrat', LIBELLE_CONTRAT[dossier.typeContrat]],
    ['Date d’entrée', formatDate(dossier.dateEntree)],
    ['Date de naissance', formatDate(dossier.dateNaissance)],
    ['Pièce d’identité', masquer(dossier.numeroPiece)],
    ['N° IPM / assurance', ou(dossier.numeroIpm)],
    ['E-mail professionnel', ou(dossier.emailPro)],
  ];

  return (
    <div className="me-colonnes me-colonnes--egales">
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Gérées par la RH</h2>
        <p className="dmd-note">Une erreur ? Signalez-la à la RH, elle corrige le dossier.</p>
        <dl className="me-lignes">
          {rh.map(([libelle, valeur]) => (
            <div key={libelle}>
              <dt>{libelle}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Mes informations</h2>
        <p className="dmd-note">
          Enregistrées immédiatement. Le changement de moyen de paiement est validé par la RH avant la paie.
          {etat.enregistre && <span className="me-ok"> Enregistré.</span>}
        </p>
        <div className="rh-grille">
          {texte('telephone', 'Téléphone', { type: 'tel' })}
          {texte('emailPerso', 'E-mail personnel', { type: 'email' })}
          <Field label="Situation familiale">
            <select
              className="field-input"
              value={dossier.situationFamiliale ?? ''}
              disabled={etat.envoi}
              onChange={(e) =>
                enregistrer({ situationFamiliale: (e.target.value || null) as SituationFamiliale | null })
              }
            >
              <option value="">Non renseignée</option>
              {Object.entries(SITUATIONS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Enfants à charge">
            <input
              className="field-input"
              type="number"
              min={0}
              max={30}
              defaultValue={dossier.enfantsACharge}
              key={dossier.enfantsACharge}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 0 && n <= 30 && n !== dossier.enfantsACharge)
                  void enregistrer({ enfantsACharge: n });
              }}
            />
          </Field>
        </div>
        {texte('adresse', 'Adresse', { long: true })}
        <div className="rh-grille">
          {texte('contactUrgence', 'Contact d’urgence')}
          {texte('telephoneUrgence', 'Téléphone d’urgence', { type: 'tel' })}
        </div>

        <p className="me-intertitre">Moyen de paiement du salaire</p>
        <div className="rh-grille">
          <Field label="Mode">
            <select
              className="field-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as ModePaiementSalaire)}
            >
              {Object.entries(LIBELLE_PAIEMENT_SALAIRE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Banque et RIB, ou numéro">
            <input
              className="field-input"
              maxLength={80}
              value={coordonnees}
              onChange={(e) => setCoordonnees(e.target.value)}
            />
          </Field>
        </div>
        <div className="me-paiement">
          <button
            type="button"
            className="btn-ghost"
            disabled={etat.envoi || !paiementModifie || !coordonnees.trim()}
            onClick={soumettrePaiement}
          >
            Soumettre à la RH
          </button>
          {enAttente ? (
            <span className="me-attente">
              En attente de la RH · {LIBELLE_PAIEMENT_SALAIRE[enAttente.mode]} (soumis le {formatDate(enAttente.le)})
            </span>
          ) : (
            <span className="me-ok">À jour · {LIBELLE_PAIEMENT_SALAIRE[dossier.modePaiement]}</span>
          )}
        </div>
        {etat.erreur && <FieldError>{etat.erreur}</FieldError>}
      </section>
    </div>
  );
}
