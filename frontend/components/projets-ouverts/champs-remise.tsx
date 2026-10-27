'use client';

import { useState } from 'react';
import { ArrowRight, Camera, UploadCloud, X } from 'lucide-react';
import { lireFichier, FICHIERS_ACCEPTES } from '@/lib/fichiers';

// Nombre de fichiers par remise (même plafond que le serveur).
const MAX_PIECES = 5;

export type SaisieRemise = { pieces: { nom: string; url: string }[]; commentaire: string };
export const SAISIE_REMISE_VIDE: SaisieRemise = { pieces: [], commentaire: '' };

// Nom final d'un fichier déposé : la base vient du serveur (règle du HUB,
// backend/src/projects/submission-file-name.ts, champ `nomDepot` de la tâche) ;
// le rang (-1, -2… s'il y a plusieurs fichiers) et l'extension sont ceux des
// fichiers choisis, seuls connus ici avant l'envoi.
function finalName(base: string, original: string, rank: number, total: number): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(original.trim());
  return `${base}${total > 1 ? `-${rank + 1}` : ''}${ext ? `.${ext[1].toLowerCase()}` : ''}`;
}

// Fichiers et commentaire d'une remise. Le fichier est obligatoire ou non
// selon la tâche (case du gabarit) ; une visite ou une réunion n'en produit
// pas. Zone de dépôt en pointillés (glisser ou parcourir) ; chaque fichier
// montre le nom sous lequel il sera enregistré. Balisage en <span> :
// utilisable dans le message d'une ConfirmModal.
export function ChampsRemise({
  valeur,
  onChange,
  id,
  obligatoire = false,
  nomDepot,
}: {
  valeur: SaisieRemise;
  onChange: (v: SaisieRemise) => void;
  id: string;
  obligatoire?: boolean;
  // Base du nom des fichiers (fournie par le serveur) ; absente : pas d'aperçu.
  nomDepot?: string;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const plein = valeur.pieces.length >= MAX_PIECES;

  async function ajouter(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setErreur(null);
    try {
      const lus = await Promise.all([...fichiers].map((f) => lireFichier(f)));
      const pieces = [...valeur.pieces, ...lus.map(({ nom, url }) => ({ nom, url }))];
      if (pieces.length > MAX_PIECES) setErreur(`${MAX_PIECES} fichiers au plus par remise.`);
      onChange({ ...valeur, pieces: pieces.slice(0, MAX_PIECES) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    }
  }

  return (
    <span className="po-remise-champs">
      <span className="po-panneau-label">
        Fichiers{' '}
        <span className={obligatoire ? 'depot-requis' : undefined}>({obligatoire ? 'obligatoire' : 'facultatif'})</span>
      </span>
      {/* Zone du HUB plutôt que le champ natif (« Choose Files » selon la
          langue du navigateur). */}
      <label
        className={`depot-zone${survol ? ' is-survol' : ''}${plein ? ' is-desactive' : ''}`}
        onDragOver={(e) => {
          if (plein || !e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          if (!plein) void ajouter(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={20} aria-hidden />
        <span className="depot-zone-texte">
          {plein ? (
            `${MAX_PIECES} fichiers au plus`
          ) : (
            <>
              Glissez vos fichiers ici ou <span className="depot-zone-lien">cliquez pour parcourir</span>
            </>
          )}
        </span>
        <span className="depot-zone-aide">{MAX_PIECES} fichiers au plus · renommés automatiquement</span>
        <input
          id={`${id}-fichiers`}
          type="file"
          accept={FICHIERS_ACCEPTES.projet}
          multiple
          className="sr-only"
          disabled={plein}
          onChange={(e) => {
            void ajouter(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {/* La photo n'apparaît que sur écran tactile. */}
      <label className={`btn-ghost btn-ghost--sm po-remise-photo${plein ? ' is-desactive' : ''}`}>
        <Camera size={15} aria-hidden /> Prendre une photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={plein}
          onChange={(e) => {
            void ajouter(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {valeur.pieces.length > 0 && (
        <span className="depot-fichiers">
          {valeur.pieces.map((f, i) => (
            <span key={`${f.nom}-${i}`} className="depot-fichier">
              <span className="depot-fichier-noms">
                <span className="depot-fichier-origine">{f.nom}</span>
                {nomDepot && (
                  <span className="depot-fichier-final">
                    <ArrowRight size={12} aria-label="enregistré sous" />{' '}
                    {finalName(nomDepot, f.nom, i, valeur.pieces.length)}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="po-remise-retirer"
                aria-label={`Retirer ${f.nom}`}
                onClick={() => onChange({ ...valeur, pieces: valeur.pieces.filter((_, k) => k !== i) })}
              >
                <X size={14} aria-hidden />
              </button>
            </span>
          ))}
        </span>
      )}
      {erreur && <span className="field-erreur">{erreur}</span>}
      <label className="po-panneau-label" htmlFor={`${id}-commentaire`}>
        Commentaire (facultatif)
      </label>
      <textarea
        id={`${id}-commentaire`}
        className="field-input"
        rows={2}
        maxLength={500}
        value={valeur.commentaire}
        onChange={(e) => onChange({ ...valeur, commentaire: e.target.value })}
      />
    </span>
  );
}

// Le dépôt peut partir : un fichier au moins quand il est obligatoire.
export const depotPret = (v: SaisieRemise, obligatoire: boolean) => !obligatoire || v.pieces.length > 0;

// Corps envoyé au serveur (commentaire vide omis).
export function corpsRemise(v: SaisieRemise) {
  const commentaire = v.commentaire.trim();
  return { pieces: v.pieces, ...(commentaire ? { commentaire } : {}) };
}
