'use client';

import { useEffect, useRef, useState } from 'react';
import { creerDevis } from '@/lib/devis';
import type { Client, ProduitService, ProjetRef } from '@/lib/types';
import { LignesDevisEditeur, ligneVide, lignesSaisies, type LigneForm } from './lignes-devis-editeur';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  clients: Client[];
  projets: ProjetRef[];
  catalogue: ProduitService[];
  projetPresel?: string;
  onClose: () => void;
  onCree: () => void;
};

export function NouveauDevisModal({ slug, clients, projets, catalogue, projetPresel, onClose, onCree }: Props) {
  const [clientId, setClientId] = useState('');
  const [projetId, setProjetId] = useState(projetPresel ?? '');
  const [objet, setObjet] = useState('');
  const [dateValidite, setDateValidite] = useState('');
  const [lignes, setLignes] = useState<LigneForm[]>([ligneVide()]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const premierChamp = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    premierChamp.current?.focus();
  }, [onClose]);

  // Client présélectionné automatiquement quand un projet est déjà choisi
  // (ouverture depuis la fiche projet) — modifiable ensuite si besoin.
  useEffect(() => {
    if (projetPresel) {
      const p = projets.find((x) => x.id === projetPresel);
      if (p) setClientId(p.client.id);
    }
  }, [projetPresel, projets]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!clientId) return setErreur('Choisis un client.');
    const saisie = lignesSaisies(lignes, catalogue);
    if ('erreur' in saisie) return setErreur(saisie.erreur);

    setEnvoi(true);
    try {
      await creerDevis(slug, {
        clientId,
        projetId: projetId || undefined,
        objet: objet.trim() || undefined,
        dateValidite: dateValidite || undefined,
        lignes: saisie.lignes,
      });
      onCree();
      onClose();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La création a échoué. Réessaie.');
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} className="modal--large" labelledBy="modal-titre-devis">
      <ModalHeader title="Nouveau devis" titleId="modal-titre-devis" onClose={onClose} />

      <form className="modal-body" onSubmit={soumettre}>
        <div className="field-row">
          <Field label="Client">
            <select
              ref={premierChamp}
              className="field-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Choisir…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Projet (facultatif)">
            <select className="field-input" value={projetId} onChange={(e) => setProjetId(e.target.value)}>
              <option value="">Aucun — devis libre</option>
              {projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.programme}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="field-row">
          <Field label="Objet (facultatif)">
            <input
              className="field-input"
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder="ex : Honoraires de conception — Villa Cap Ouest"
            />
          </Field>
          <Field label="Valable jusqu’au (facultatif)">
            <input
              type="date"
              className="field-input"
              value={dateValidite}
              onChange={(e) => setDateValidite(e.target.value)}
            />
          </Field>
        </div>

        {/* Rattaché à un projet = devis complémentaire : seul lieu des
              travaux supplémentaires (CGV art. 8), au tarif CO du projet. */}
        <LignesDevisEditeur
          lignes={lignes}
          onChange={setLignes}
          catalogue={catalogue}
          devisProjet={!!projetId}
          categorieCo={projets.find((p) => p.id === projetId)?.categorieConception ?? null}
        />
        {projetId && (
          <p className="field-aide">
            Devis complémentaire du projet : tout travail supplémentaire doit être accepté par écrit par le client avant
            exécution (CGV art. 8) — il ne se facture qu’une fois accepté.
          </p>
        )}

        {erreur && <FieldError>{erreur}</FieldError>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={envoi}>
            {envoi ? 'Création…' : 'Créer le brouillon'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
