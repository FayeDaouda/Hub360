'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { telechargerDocument } from '@/lib/mon-espace';
import { PIECES } from '@/lib/rh';
import type { ProfilMonEspace } from '@/lib/types';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// « Mon espace » · Mes documents (lot 5) : les pièces que la RH dépose pour le
// salarié (contrat signé, fiche de poste), en téléchargement.
export function MesDocuments({ slug, dossier }: { slug: string; dossier: ProfilMonEspace }) {
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">Mes documents</h2>
      <p className="dmd-note">Déposés par la RH dans ton dossier. Pour un document manquant, adresse-toi à la RH.</p>
      {erreur && <p className="field-erreur">{erreur}</p>}
      <ul className="dmd-liste">
        {dossier.documents.map((d) => (
          <li key={d.type} className="dmd-ligne">
            <span>
              <strong>{PIECES.find((p) => p.type === d.type)?.libelle ?? d.type}</strong>
              <span className="cell-sub">{d.ajouteLe ? `${d.nom} · déposé le ${jjmmaaaa(d.ajouteLe)}` : 'Pas encore déposé'}</span>
            </span>
            {d.ajouteLe && (
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={() => {
                  setErreur(null);
                  telechargerDocument(slug, d.type).catch((e) =>
                    setErreur(e instanceof ApiError ? e.message : 'Téléchargement impossible.'),
                  );
                }}
              >
                <Download size={14} strokeWidth={2} aria-hidden /> Télécharger
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
