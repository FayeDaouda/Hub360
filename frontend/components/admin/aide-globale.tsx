'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import { moduleDeSection, ORDRE_SECTIONS, sectionAccessible } from '@/lib/acces-back-office';
import { FICHES_AIDE, phraseNiveau, REPERES_AIDE } from '@/lib/aide';
import { lireFichier } from '@/lib/fichiers';
import { creerSignalement } from '@/lib/signalements';
import type { NiveauPermission, Session } from '@/lib/types';

type Onglet = 'guide' | 'signaler';

// Ouvrir l'aide d'ailleurs que de la barre du haut (menu latéral, Réglages).
const EVENEMENT = 'hub:ouvrir-aide';
export function ouvrirAide(onglet: Onglet = 'guide') {
  window.dispatchEvent(new CustomEvent<Onglet>(EVENEMENT, { detail: onglet }));
}

// Bouton « Aide » de la barre du haut : le guide de la personne connectée
// (ses sections, ce qu'elle peut y faire selon la matrice) et « Signaler un
// problème » (page, rôle et appareil joints automatiquement).
export function AideGlobale({ session }: { session: Session }) {
  const [onglet, setOnglet] = useState<Onglet | null>(null);
  useEffect(() => {
    const ouvrir = (e: Event) => setOnglet((e as CustomEvent<Onglet>).detail ?? 'guide');
    window.addEventListener(EVENEMENT, ouvrir);
    return () => window.removeEventListener(EVENEMENT, ouvrir);
  }, []);
  return (
    <>
      <button type="button" className="admin-icon-btn" aria-label="Aide et signalement d’un problème" title="Aide" onClick={() => setOnglet('guide')}>
        <HelpCircle size={18} />
      </button>
      {onglet &&
        createPortal(<Panneau session={session} onglet={onglet} onOnglet={setOnglet} onClose={() => setOnglet(null)} />, document.body)}
    </>
  );
}

function Panneau({ session, onglet, onOnglet, onClose }: { session: Session; onglet: Onglet; onOnglet: (o: Onglet) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal aide-panneau" role="dialog" aria-modal="true" aria-labelledby="aide-titre" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="aide-titre">Aide</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="vue-toggle aide-onglets" role="tablist" aria-label="Aide">
          {(
            [
              ['guide', 'Mon guide'],
              ['signaler', 'Signaler un problème'],
            ] as const
          ).map(([o, libelle]) => (
            <button key={o} type="button" role="tab" aria-selected={onglet === o} className={onglet === o ? 'is-active' : ''} onClick={() => onOnglet(o)}>
              {libelle}
            </button>
          ))}
        </div>
        <div className="modal-body aide-corps">
          {onglet === 'guide' ? <Guide session={session} onSignaler={() => onOnglet('signaler')} /> : <Signaler session={session} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

function Guide({ session, onSignaler }: { session: Session; onSignaler: () => void }) {
  const niveauDe = (cle: string): NiveauPermission => {
    if (session.role === 'societe_admin') return 'validation';
    const moduleMatrice = moduleDeSection(cle);
    return moduleMatrice ? (session.permissions?.[moduleMatrice] ?? 'aucun') : 'aucun';
  };
  const sections = [...ORDRE_SECTIONS, 'parametres'].filter((cle) => sectionAccessible(session, cle) && FICHES_AIDE[cle]);

  return (
    <>
      <p className="aide-intro">
        Bonjour {session.utilisateur.prenom}. Voici ce que votre rôle (<strong>{session.role}</strong>) vous ouvre dans le HUB, dans l’ordre du menu.
      </p>
      <ul className="aide-sections">
        {sections.map((cle) => {
          const f = FICHES_AIDE[cle];
          const actions = phraseNiveau(f, niveauDe(cle));
          return (
            <li key={cle}>
              <strong>{f.titre}</strong>
              <span className="cell-sub">{f.resume}</span>
              {actions.map((a) => (
                <span key={a} className="aide-action">
                  {a}
                </span>
              ))}
              {f.astuces?.map((a) => (
                <span key={a} className="aide-action aide-astuce">
                  {a}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="po-kicker">Partout dans le HUB</p>
      <ul className="aide-reperes">
        {REPERES_AIDE.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="modal-actions">
        <button type="button" className="btn-primary" onClick={onSignaler}>
          Signaler un problème
        </button>
      </div>
    </>
  );
}

function Signaler({ session, onClose }: { session: Session; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [capture, setCapture] = useState<{ nom: string; url: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  async function joindre(f: File | undefined) {
    if (!f) return;
    setErreur(null);
    try {
      setCapture(await lireFichier(f));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture de l’image impossible.');
    }
  }

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await creerSignalement(session.societe.slug, {
        description: description.trim(),
        page: `${window.location.pathname}${window.location.search}`,
        appareil: window.matchMedia('(max-width: 720px)').matches ? 'mobile' : 'ordinateur',
        ...(capture ? { capture: capture.url } : {}),
      });
      setEnvoye(true);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Envoi impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) {
    return (
      <>
        <p className="aide-intro">Merci, votre signalement est transmis au CIO. Il le suit jusqu’à sa correction.</p>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="aide-intro">
        Décrivez ce qui ne va pas, ce que vous attendiez ou votre idée. La page où vous êtes, votre rôle et votre appareil sont joints
        automatiquement.
      </p>
      <label className="field">
        <span className="field-label">Le problème</span>
        <textarea
          className="field-input"
          rows={5}
          maxLength={2000}
          placeholder="Ex. : en remettant ma tâche, le bouton reste grisé…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Capture d’écran (facultatif)</span>
        <input className="field-input" type="file" accept="image/*" onChange={(e) => joindre(e.target.files?.[0])} />
      </label>
      {capture && <span className="cell-sub">Jointe : {capture.nom}</span>}
      {erreur && <p className="field-erreur">{erreur}</p>}
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
          Annuler
        </button>
        <button type="button" className="btn-primary" onClick={envoyer} disabled={envoi || description.trim().length < 10}>
          {envoi ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </>
  );
}
