'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { chercher, GROUPES, lienResultat, type ResultatRecherche } from '@/lib/recherche';
import { FicheContactModal } from '@/components/contacts/fiche-contact';

const DELAI_SAISIE_MS = 250;
const LONGUEUR_MIN = 2;

// Recherche globale (barre du haut, Ctrl+K / ⌘K) : dossiers, projets, devis,
// factures, personnel (ou collègues : fiche contact) — ce que les droits de la personne lui laissent voir.
export function RechercheGlobale({ slug }: { slug: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [mac, setMac] = useState(false);
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOuvert((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="admin-search recherche-declencheur" aria-label="Rechercher" onClick={() => setOuvert(true)}>
        <Search size={15} aria-hidden />
        <span className="recherche-declencheur-texte">Rechercher…</span>
        <kbd className="recherche-raccourci">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      {ouvert && createPortal(<Palette slug={slug} onClose={() => setOuvert(false)} onContact={setContact} />, document.body)}
      {contact && <FicheContactModal slug={slug} utilisateurId={contact} onClose={() => setContact(null)} />}
    </>
  );
}

function Palette({ slug, onClose, onContact }: { slug: string; onClose: () => void; onContact: (utilisateurId: string) => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => champ.current?.focus(), []);

  // Requête après une courte pause de frappe ; une réponse périmée est ignorée.
  useEffect(() => {
    const saisie = q.trim();
    if (saisie.length < LONGUEUR_MIN) {
      setResultats(null);
      return;
    }
    let annule = false;
    const id = setTimeout(() => {
      chercher(slug, saisie)
        .then((r) => {
          if (annule) return;
          setErreur(false);
          setResultats(r);
          setActif(0);
        })
        .catch(() => !annule && setErreur(true));
    }, DELAI_SAISIE_MS);
    return () => {
      annule = true;
      clearTimeout(id);
    };
  }, [slug, q]);

  // Ordre d'affichage = ordre de navigation au clavier.
  const ordonnes = GROUPES.flatMap((g) => (resultats ?? []).filter((r) => r.type === g.type));

  function ouvrir(r: ResultatRecherche) {
    onClose();
    const lien = lienResultat(slug, r);
    if (lien) router.push(lien);
    else onContact(r.id);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown' && ordonnes.length) {
      e.preventDefault();
      setActif((i) => (i + 1) % ordonnes.length);
    } else if (e.key === 'ArrowUp' && ordonnes.length) {
      e.preventDefault();
      setActif((i) => (i - 1 + ordonnes.length) % ordonnes.length);
    } else if (e.key === 'Enter' && ordonnes[actif]) {
      e.preventDefault();
      ouvrir(ordonnes[actif]);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal recherche-palette" role="dialog" aria-modal="true" aria-label="Recherche" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="champ-recherche recherche-champ">
          <Search size={16} aria-hidden />
          <input
            ref={champ}
            type="search"
            className="field-input"
            placeholder="Rechercher un projet, un client, un collègue…"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            aria-controls="recherche-resultats"
            aria-activedescendant={ordonnes[actif] ? `recherche-${ordonnes[actif].id}` : undefined}
          />
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div id="recherche-resultats" className="recherche-resultats" role="listbox" aria-label="Résultats">
          {erreur ? (
            <p className="recherche-aide field-erreur">La recherche a échoué.</p>
          ) : q.trim().length < LONGUEUR_MIN ? (
            <p className="recherche-aide">Tapez au moins {LONGUEUR_MIN} caractères. ↑ ↓ pour choisir, Entrée pour ouvrir.</p>
          ) : !resultats ? (
            <p className="recherche-aide">Recherche…</p>
          ) : ordonnes.length === 0 ? (
            <p className="recherche-aide">Aucun résultat pour « {q.trim()} ».</p>
          ) : (
            GROUPES.map((g) => {
              const items = ordonnes.filter((r) => r.type === g.type);
              if (!items.length) return null;
              return (
                <div key={g.type} role="group" aria-label={g.libelle}>
                  <p className="recherche-groupe">{g.libelle}</p>
                  {items.map((r) => {
                    const i = ordonnes.indexOf(r);
                    return (
                      <button
                        key={`${r.type}-${r.id}`}
                        id={`recherche-${r.id}`}
                        type="button"
                        role="option"
                        aria-selected={i === actif}
                        className={`recherche-resultat${i === actif ? ' is-actif' : ''}`}
                        onMouseEnter={() => setActif(i)}
                        onClick={() => ouvrir(r)}
                      >
                        <strong>{r.titre}</strong>
                        {r.detail && <span className="cell-sub">{r.detail}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
