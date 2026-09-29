'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { telechargerBulletin, telechargerDocument } from '@/lib/mon-espace';
import { PIECES } from '@/lib/rh';
import { libelleMois } from '@/lib/temps';
import type { ProfilMonEspace } from '@/lib/types';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// « Mon espace » · Mes documents (lot 5) : les pièces que la RH dépose pour le
// salarié (contrat signé, fiche de poste) et ses bulletins de paie, en
// téléchargement.
export function MesDocuments({ slug, dossier }: { slug: string; dossier: ProfilMonEspace }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const telecharger = (p: Promise<void>) => {
    setErreur(null);
    p.catch((e) => setErreur(e instanceof ApiError ? e.message : 'Téléchargement impossible.'));
  };
  const bouton = (action: () => Promise<void>) => (
    <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => telecharger(action())}>
      <Download size={14} strokeWidth={2} aria-hidden /> Télécharger
    </button>
  );

  return (
    <>
      {erreur && <p className="field-erreur">{erreur}</p>}
      <div className="dmd-grille">
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Mes documents</h2>
          <p className="dmd-note">Déposés par la RH dans ton dossier. Pour un document manquant, adresse-toi à la RH.</p>
          <ul className="dmd-liste">
            {dossier.documents.map((d) => (
              <li key={d.type} className="dmd-ligne">
                <span>
                  <strong>{PIECES.find((p) => p.type === d.type)?.libelle ?? d.type}</strong>
                  <span className="cell-sub">{d.ajouteLe ? `${d.nom} · déposé le ${jjmmaaaa(d.ajouteLe)}` : 'Pas encore déposé'}</span>
                </span>
                {d.ajouteLe && bouton(() => telechargerDocument(slug, d.type))}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Mes bulletins de paie</h2>
          {dossier.bulletins.length === 0 ? (
            <p className="empty-state">Aucun bulletin déposé pour l’instant.</p>
          ) : (
            <ul className="dmd-liste">
              {dossier.bulletins.map((b) => (
                <li key={b.mois} className="dmd-ligne">
                  <span>
                    <strong className="mes-mois">{libelleMois(b.mois)}</strong>
                    <span className="cell-sub">
                      {b.nom} · déposé le {jjmmaaaa(b.deposeLe)}
                    </span>
                  </span>
                  {bouton(() => telechargerBulletin(slug, b.mois))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
