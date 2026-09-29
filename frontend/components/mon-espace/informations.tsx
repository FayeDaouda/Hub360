'use client';

import { FormEvent, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { LIBELLE_PAIEMENT_SALAIRE, majCoordonnees } from '@/lib/mon-espace';
import { LIBELLE_CONTRAT } from '@/lib/rh';
import type { ProfilMonEspace } from '@/lib/types';

const jjmmaaaa = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const ou = (v: string) => v.trim() || '—';

function Bloc({ titre, lignes }: { titre: string; lignes: [string, string][] }) {
  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">{titre}</h2>
      <dl className="mes-infos">
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle}>
            <dt>{libelle}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// « Mon espace » · Mes informations (lot 5) : le dossier tenu par la RH, en
// lecture ; le salarié ne modifie que ses coordonnées (téléphone, contact
// d'urgence). Le salaire n'y figure pas.
export function MesInformations({
  slug,
  dossier,
  onMaj,
}: {
  slug: string;
  dossier: ProfilMonEspace;
  onMaj: (d: ProfilMonEspace) => void;
}) {
  const [telephone, setTelephone] = useState(dossier.telephone);
  const [contactUrgence, setContactUrgence] = useState(dossier.contactUrgence);
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null; ok: boolean }>({ envoi: false, erreur: null, ok: false });
  const modifie = telephone !== dossier.telephone || contactUrgence !== dossier.contactUrgence;

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEtat({ envoi: true, erreur: null, ok: false });
    try {
      const { dossier: maj } = await majCoordonnees(slug, { telephone, contactUrgence });
      if (maj) onMaj(maj);
      setEtat({ envoi: false, erreur: null, ok: true });
    } catch (err) {
      setEtat({ envoi: false, erreur: err instanceof ApiError ? err.message : 'Enregistrement impossible.', ok: false });
    }
  }

  return (
    <div className="dmd-grille">
      <Bloc
        titre="Poste et contrat"
        lignes={[
          ['Matricule', dossier.matricule],
          ['Poste', ou(dossier.poste)],
          ['Société', dossier.societe],
          ['Cellule', dossier.cellule ?? '—'],
          ['Contrat', LIBELLE_CONTRAT[dossier.typeContrat]],
          ['Entrée', jjmmaaaa(dossier.dateEntree)],
          ...(dossier.typeContrat !== 'cdi' ? ([['Fin prévue', jjmmaaaa(dossier.dateFin)]] as [string, string][]) : []),
        ]}
      />
      <form className="panel glass-panel dmd-section" onSubmit={enregistrer}>
        <h2 className="dmd-titre">Mes coordonnées</h2>
        <label className="field">
          <span className="field-label">Téléphone</span>
          <input className="field-input" type="tel" maxLength={40} value={telephone} onChange={(e) => setTelephone(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Contact d’urgence</span>
          <input
            className="field-input"
            maxLength={200}
            placeholder="Nom, lien, téléphone"
            value={contactUrgence}
            onChange={(e) => setContactUrgence(e.target.value)}
          />
        </label>
        <p className="dmd-note">E-mail professionnel : {ou(dossier.emailPro)}. Pour toute autre correction, adresse-toi à la RH.</p>
        {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
        {etat.ok && !modifie && <p className="dmd-note">Coordonnées enregistrées.</p>}
        <button type="submit" className="btn-primary" disabled={etat.envoi || !modifie}>
          {etat.envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
      <Bloc
        titre="Identité"
        lignes={[
          ['Nom', `${dossier.prenom} ${dossier.nom}`.trim() || '—'],
          ['Naissance', `${jjmmaaaa(dossier.dateNaissance)}${dossier.lieuNaissance.trim() ? ` à ${dossier.lieuNaissance}` : ''}`],
          ['Nationalité', ou(dossier.nationalite)],
          ['Pièce d’identité', ou(dossier.numeroPiece)],
        ]}
      />
      <Bloc
        titre="Paie et assurance"
        lignes={[
          ['Paiement du salaire', LIBELLE_PAIEMENT_SALAIRE[dossier.modePaiement]],
          ['RIB ou numéro', ou(dossier.coordonneesPaiement)],
          ['N° adhérent IPM', ou(dossier.numeroIpm)],
        ]}
      />
      {dossier.mission && (
        <Bloc
          titre="Carte de mission"
          lignes={[
            ['Résultat attendu', ou(dossier.mission.resultat)],
            ['Livrables', ou(dossier.mission.livrables)],
            ['KPI', ou(dossier.mission.kpi)],
            ['Signal d’alerte', ou(dossier.mission.signalAlerte)],
          ]}
        />
      )}
    </div>
  );
}
