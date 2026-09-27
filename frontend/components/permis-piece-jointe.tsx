'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { estImage, lireImageRedimensionnee } from '@/lib/image-fichier';
import { lireFichier } from '@/lib/fichiers';

type Props = {
  onJoindreImages: (fichiers: { nom: string; url: string }[]) => Promise<void>;
  onJoindreFichiers: (fichiers: { nom: string; url: string; taille?: number }[]) => Promise<void>;
  // Surcharges visuelles — par défaut la petite pastille en pointillés
  // utilisée sur Exécution ; le point d'upload de bloc sur Permis (sept.
  // 2026) passe le style « premium » champ blanc/bleu (cf. globals.css
  // .ap-souscheck-joindre-champ) pour matcher Constitution.
  className?: string;
  iconSize?: number;
};

// Bouton « joindre » — sur la même ligne que chaque item (à côté de la case
// à cocher), présent partout, optionnel (demande explicite du 2026-09-17).
// Route vers Images ou Documents selon le type MIME du fichier ; même objet
// stocké une seule fois, cf. lib/permis.ts. Les fichiers déjà rattachés et la
// note se consultent/éditent dans la popup « Détail » (cf. BoutonDetail et
// DetailItemModal) — pas affichés en permanence dans la liste.
export function BoutonJoindre({
  onJoindreImages,
  onJoindreFichiers,
  className = 'ap-souscheck-joindre',
  iconSize = 12,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);

  async function surFichiers(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    setEnCours(true);
    try {
      const tous = Array.from(liste);
      const images = tous.filter(estImage);
      const documents = tous.filter((f) => !estImage(f));
      if (images.length) {
        await onJoindreImages(await Promise.all(images.map(lireImageRedimensionnee)));
      }
      if (documents.length) {
        await onJoindreFichiers(await Promise.all(documents.map(lireFichier)));
      }
    } finally {
      setEnCours(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => surFichiers(e.target.files)}
      />
      <button
        type="button"
        className={className}
        onClick={() => inputRef.current?.click()}
        disabled={enCours}
      >
        <Paperclip size={iconSize} strokeWidth={2} aria-hidden />
        {enCours ? 'Envoi…' : 'Joindre'}
      </button>
    </>
  );
}

// Déclenche la popup « Détail » (note + fichiers joints) — un point marque
// les items qui ont déjà quelque chose (note ou fichier), pour repérer
// « vide » vs « déjà renseigné » sans ouvrir chaque popup.
export function BoutonDetail({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ap-souscheck-detail" onClick={onClick}>
      Détail
      {actif && <span className="ap-souscheck-detail-point" aria-hidden />}
    </button>
  );
}

// Un seul point d'upload pour tout le bloc « Constitution » plutôt qu'un
// BoutonJoindre par item (12 boutons éparpillés) — demande explicite du
// 2026-09-26 : plus premium. On choisit d'abord l'item concerné, puis les
// fichiers ; le fichier reste rattaché à CET item précis (même route
// joindreImages/joindreFichiers qu'avant, juste déclenchée différemment).
type ItemChoix = { id: string; libelle: string };

type PropsJoindreAvecItem = {
  items: ItemChoix[];
  onJoindreImages: (ligneId: string, fichiers: { nom: string; url: string }[]) => Promise<void>;
  onJoindreFichiers: (
    ligneId: string,
    fichiers: { nom: string; url: string; taille?: number }[],
  ) => Promise<void>;
  onClose: () => void;
};

export function JoindreAvecItemModal({
  items,
  onJoindreImages,
  onJoindreFichiers,
  onClose,
}: PropsJoindreAvecItem) {
  const [ligneId, setLigneId] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enCours]);

  async function surFichiers(liste: FileList | null) {
    if (!liste || liste.length === 0 || !ligneId) return;
    setEnCours(true);
    setErreur(null);
    try {
      const tous = Array.from(liste);
      const images = tous.filter(estImage);
      const documents = tous.filter((f) => !estImage(f));
      if (images.length) {
        await onJoindreImages(ligneId, await Promise.all(images.map(lireImageRedimensionnee)));
      }
      if (documents.length) {
        await onJoindreFichiers(ligneId, await Promise.all(documents.map(lireFichier)));
      }
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
      setEnCours(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !enCours && onClose()}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="joindre-item-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="joindre-item-titre">Joindre un fichier</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
            disabled={enCours}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span className="field-label">Ce fichier correspond à…</span>
            <select
              className="field-input"
              value={ligneId}
              onChange={(e) => setLigneId(e.target.value)}
              autoFocus
            >
              <option value="">— Choisir un item —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.libelle}
                </option>
              ))}
            </select>
          </label>

          {erreur && <p className="field-erreur">{erreur}</p>}

          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => surFichiers(e.target.files)}
          />

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!ligneId || enCours}
              onClick={() => inputRef.current?.click()}
            >
              {enCours ? 'Envoi…' : 'Choisir des fichiers'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
