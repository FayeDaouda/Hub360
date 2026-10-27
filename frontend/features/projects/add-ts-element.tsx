'use client';

import { useState } from 'react';
import { formatAmount } from '@hub/domain';
import { addTsElement } from './api';
import type { OpenProjectFile } from './types';

type Rework = 'mineure' | 'majeure';

// « Ajouter en TS » (Architecte DPLG) : l'élément demandé par le client
// devient une tâche de la carte choisie, son temps s'ajoute au budget atelier.
export function AddTsElement({
  slug,
  file: d,
  onUpdate,
}: {
  slug: string;
  file: OpenProjectFile;
  onUpdate: () => Promise<void>;
}) {
  const [cardId, setCardId] = useState(d.optionsTs[0].carteId);
  const [element, setElement] = useState('');
  const [rework, setRework] = useState<Rework>('mineure');
  const [surface, setSurface] = useState('');
  const [boards, setBoards] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function add() {
    setSending(true);
    setMessage(null);
    try {
      const t = await addTsElement(
        slug,
        d.id,
        cardId,
        element.trim(),
        rework === 'majeure'
          ? { reprise: rework, surfaceM2: Number(surface), planches: Number(boards) }
          : { reprise: rework },
      );
      setElement('');
      setSurface('');
      setBoards('');
      if ('enAttente' in t) {
        // Au-delà du seuil : rien n'est ajouté tant que le CTO n'a pas validé.
        setMessage({
          ok: true,
          texte: `TS chiffré à ${formatAmount(t.montantHt)} HT, au-delà du seuil de ${formatAmount(t.seuil)} : demande envoyée au CTO. Il sera ajouté au projet et à l’avenant dès sa validation.`,
        });
        return;
      }
      setMessage({
        ok: true,
        texte: `${t.libelle} ajoutée au projet et au devis d’avenant (en préparation, à envoyer au client).`,
      });
      await onUpdate();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error && e.message ? e.message : 'L’ajout en TS a échoué.' });
    } finally {
      setSending(false);
    }
  }

  const wholeNumber = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 1;
  const valid = element.trim().length >= 2 && (rework === 'mineure' || (wholeNumber(surface) && wholeNumber(boards)));

  return (
    <div className="po-ts">
      <div className="po-ts-ligne">
        <select
          className="field-input"
          aria-label="Type d’élément"
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
        >
          {d.optionsTs.map((o) => (
            <option key={o.carteId} value={o.carteId}>
              {o.libelle} ({o.heures} h)
            </option>
          ))}
        </select>
        <input
          className="field-input"
          value={element}
          maxLength={80}
          placeholder="Élément ajouté par le client (ex. Bureau)"
          onChange={(e) => setElement(e.target.value)}
        />
        <button type="button" className="btn-primary" disabled={sending || !valid} onClick={add}>
          {sending ? 'Ajout…' : 'Ajouter en TS'}
        </button>
      </div>
      <div className="po-ts-ligne po-ts-reprise">
        <select
          className="field-input"
          aria-label="Chiffrage de l’avenant"
          value={rework}
          onChange={(e) => setRework(e.target.value as Rework)}
        >
          <option value="mineure">Reprise mineure (TS-MIN, forfait)</option>
          <option value="majeure">Reprise majeure (TS-MAJ, tarif CO × surface × planches)</option>
        </select>
        {rework === 'majeure' && (
          <>
            <input
              className="field-input"
              type="number"
              min={1}
              inputMode="numeric"
              aria-label="Surface concernée (m²)"
              placeholder="Surface concernée (m²)"
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
            />
            <input
              className="field-input"
              type="number"
              min={1}
              inputMode="numeric"
              aria-label="Planches concernées"
              placeholder="Planches"
              value={boards}
              onChange={(e) => setBoards(e.target.value)}
            />
          </>
        )}
      </div>
      {message && <p className={message.ok ? 'po-aide' : 'field-erreur'}>{message.texte}</p>}
    </div>
  );
}
