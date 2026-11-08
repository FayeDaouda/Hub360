'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ModalHeader } from '@/components/ui/dialog';

// Garde des modifications non enregistrées (08/11/2026) : quitter un écran
// qui a des changements en attente ouvre une fenêtre du HUB — enregistrer et
// continuer, quitter sans enregistrer, ou rester — au lieu de les perdre en
// silence. Couvre :
// - les liens internes (menus, navigation, menu du compte), interceptés au
//   clic ;
// - les sorties sans lien (onglets, déconnexion, notification, recherche),
//   qui appellent `confirmLeave()` avant de naviguer ;
// - le bouton Précédent du navigateur (ou le geste retour), par une entrée
//   « sentinelle » d'historique tant que des changements sont en attente ;
// - la fermeture et le rechargement de l'onglet, par la boîte du navigateur
//   (la seule possible à ce moment-là).

export type UnsavedChanges = {
  // Nombre de changements en attente ; 0 = rien à garder.
  pending: number;
  // « 3 cases modifiées dans les droits des rôles »
  description: string;
  // Enregistre : true si c'est fait, sinon le message d'erreur à afficher.
  // Pendant l'enregistrement, l'appelant remet `pending` à 0 (la garde se
  // tait et retire sa sentinelle avant la navigation qui suit).
  save: () => Promise<true | string>;
};

// Écrans gardés, le plus récent en dernier (en pratique un seul à la fois).
const askers: (() => Promise<boolean>)[] = [];

/** À appeler avant de quitter l'écran autrement que par un lien (onglet, bouton). */
export function confirmLeave(): Promise<boolean> {
  const ask = askers[askers.length - 1];
  return ask ? ask() : Promise.resolve(true);
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// En tête de l'historique : l'entrée sentinelle de la garde (même adresse).
const onSentinel = () => !!window.history.state?.hubUnsaved;

/**
 * Quitte vers `href` après un `confirmLeave()` accepté. Si l'entrée sentinelle
 * est encore en tête, elle est remplacée (sinon elle resterait dans
 * l'historique et Précédent semblerait ne rien faire).
 */
export function leaveTo(router: { push: (href: string) => void; replace: (href: string) => void }, href: string) {
  if (onSentinel()) router.replace(href);
  else router.push(href);
}

// Lien interne vers un autre écran (même origine, même onglet, sans touche
// de modification) — ce que la garde intercepte. Renvoie l'adresse complète,
// déjà vérifiée de même origine : un chemin du type « //autre-site » ne peut
// pas devenir une sortie vers un autre site.
function internalLink(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const here = window.location;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url.href;
}

/**
 * Active la garde tant que `changes.pending > 0`. Renvoie la fenêtre à
 * placer dans l'écran (rendue seulement quand une sortie est demandée).
 */
export function useUnsavedChangesGuard(changes: UnsavedChanges): ReactNode {
  const router = useRouter();
  const [request, setRequest] = useState<((leave: boolean) => void) | null>(null);
  // Demande ouverte : close (« rester ») si une autre la remplace ou si
  // l'écran disparaît — la promesse ne reste jamais en suspens.
  const openRequest = useRef<((leave: boolean) => void) | null>(null);
  useEffect(() => {
    openRequest.current = request;
  }, [request]);
  useEffect(() => () => openRequest.current?.(false), []);
  // Sortie par Précédent en cours : partagé entre les exécutions de l'effet
  // (un échec d'enregistrement relance l'effet pendant que la fenêtre reste ouverte).
  const quitting = useRef(false);
  const active = changes.pending > 0;

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        openRequest.current?.(false);
        setRequest(() => (leave: boolean) => resolve(leave));
      }),
    [],
  );

  useEffect(() => {
    if (!active) return;
    askers.push(ask);
    const hold = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // anciens Safari et WebView
    };
    // À la capture, avant le routeur. Seulement preventDefault : le lien ne
    // navigue pas (Next et le navigateur le respectent), mais ses propres
    // gestionnaires s'exécutent (un menu ou un panneau se referme).
    const onClick = (e: MouseEvent) => {
      const target = internalLink(e);
      if (!target) return;
      e.preventDefault();
      void ask().then((leave) => leave && leaveTo(router, target));
    };
    // Précédent : une entrée sentinelle (même adresse) est ajoutée ; le
    // retour la consomme et ouvre la fenêtre. Rester : la sentinelle revient.
    // Quitter : un second retour mène à la page précédente. Next recopie son
    // propre état dans l'entrée (pas de rechargement).
    let disposed = false;
    quitting.current = false;
    const pushSentinel = () => {
      if (!onSentinel())
        window.history.pushState({ ...window.history.state, hubUnsaved: true }, '', window.location.href);
    };
    pushSentinel();
    const onPopState = () => {
      if (quitting.current || onSentinel()) return;
      // Position de lecture d'avant le retour (le navigateur la changera).
      const y = window.scrollY;
      void ask().then((leave) => {
        if (disposed) return;
        if (!leave) {
          pushSentinel();
          requestAnimationFrame(() => window.scrollTo(0, y));
          return;
        }
        quitting.current = true;
        // La page précédente peut être un autre site : pas de seconde boîte.
        window.removeEventListener('beforeunload', hold);
        window.history.back();
      });
    };
    window.addEventListener('beforeunload', hold);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      const i = askers.lastIndexOf(ask);
      if (i >= 0) askers.splice(i, 1);
      window.removeEventListener('beforeunload', hold);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
      disposed = true;
      // Plus rien en attente (enregistré, annulé) : la sentinelle, encore en
      // tête de l'historique, est retirée — Précédent redevient normal — sans
      // perdre la position de lecture.
      if (!quitting.current && onSentinel()) {
        const y = window.scrollY;
        window.addEventListener('popstate', () => requestAnimationFrame(() => window.scrollTo(0, y)), { once: true });
        window.history.back();
      }
    };
  }, [active, ask, router]);

  if (!request) return null;
  const answer = (leave: boolean) => {
    setRequest(null);
    openRequest.current = null;
    request(leave);
  };
  return <GuardDialog changes={changes} onAnswer={answer} />;
}

function GuardDialog({ changes, onAnswer }: { changes: UnsavedChanges; onAnswer: (leave: boolean) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);

  // Focus sur l'action principale, rendu à l'élément d'origine ensuite.
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    saveButton.current?.focus();
    return () => origin?.focus?.();
  }, []);

  // Échap = rester ; tabulation piégée dans la fenêtre.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) {
        e.stopPropagation();
        onAnswer(false);
        return;
      }
      if (e.key === 'Tab' && box.current) {
        const elements = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!elements.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onAnswer, saving]);

  async function saveAndLeave() {
    setSaving(true);
    setError(null);
    const result = await changes.save().catch(() => 'L’enregistrement a échoué.');
    if (result === true) onAnswer(true);
    else {
      setError(`${result} Réessayez ou restez sur la page.`);
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={() => onAnswer(false)}
      busy={saving}
      closeOnEscape={false}
      portal
      backdropClassName="modal-backdrop--premier-plan"
      className="modal--sm garde-fenetre"
      role="alertdialog"
      labelledBy="garde-titre"
      describedBy="garde-message"
      boxRef={box}
    >
      <ModalHeader
        title="Modifications non enregistrées"
        titleId="garde-titre"
        onClose={() => onAnswer(false)}
        closeDisabled={saving}
      />
      <div className="modal-body">
        <p id="garde-message" className="modal-message">
          {changes.description}{' '}
          {changes.pending > 1 ? 'ne sont pas encore enregistrées' : 'n’est pas encore enregistrée'}. Que voulez-vous en
          faire avant de quitter cet écran ?
        </p>
        {error && (
          <p className="field-erreur" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => onAnswer(false)} disabled={saving}>
            Rester sur la page
          </button>
          <button type="button" className="btn-ghost garde-quitter" onClick={() => onAnswer(true)} disabled={saving}>
            Quitter sans enregistrer
          </button>
          <button ref={saveButton} type="button" className="btn-primary" onClick={saveAndLeave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer et continuer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
